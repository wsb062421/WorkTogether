import { randomUUID } from "node:crypto";
import type {
  ActivityEvent,
  AppSnapshot,
  ChangeRequirementInput,
  CreateRequirementInput,
  GeneratePlanInput,
  Handover,
  ImpactReport,
  MemberId,
  MergeTaskInput,
  Plan,
  PlanTask,
  Requirement,
  RequirementActionInput,
  ResumeTaskInput,
  ReviewInput,
  TaskActionInput,
  TaskExecutionResult,
  TestResult
} from "@shared/contracts";
import type { SqliteStateStore } from "../storage/SqliteStateStore";
import {
  DeepSeekPlanner,
  type GeneratedPlanDraft
} from "./planning/DeepSeekPlanner";
import { DemoRepositoryService } from "./DemoRepositoryService";

const now = () => new Date().toISOString();
const opposite = (memberId: MemberId): MemberId =>
  memberId === "member-a" ? "member-b" : "member-a";

export class TeamAgentService {
  private state: AppSnapshot;
  private readonly runningTasks = new Set<string>();

  constructor(
    private readonly store: SqliteStateStore,
    private readonly repository: DemoRepositoryService,
    private readonly planner: DeepSeekPlanner,
    private readonly notifyChange: () => void
  ) {
    this.state = this.store.load();
  }

  async initialize(): Promise<void> {
    await this.repository.ensureWorkspace();
  }

  getSnapshot(_memberId: MemberId): AppSnapshot {
    return structuredClone(this.state);
  }

  async createRequirement(
    input: CreateRequirementInput
  ): Promise<Requirement> {
    const timestamp = now();
    const requirement: Requirement = {
      id: `req-${randomUUID()}`,
      title: input.title,
      content: input.content,
      authorId: input.actorId,
      confirmedBy: null,
      status: "proposed",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.state.requirements.push(requirement);
    this.addEvent(
      "requirement_created",
      input.actorId,
      requirement.id,
      `提出需求：${requirement.title}`
    );
    this.persistAndNotify();
    return structuredClone(requirement);
  }

  confirmRequirement(
    input: RequirementActionInput
  ): Promise<Requirement> {
    const requirement = this.findRequirement(input.requirementId);
    if (requirement.status === "rejected") {
      throw new Error("已否决的需求不能直接确认");
    }
    requirement.status = "confirmed";
    requirement.confirmedBy = input.actorId;
    requirement.updatedAt = now();
    this.addEvent(
      "requirement_confirmed",
      input.actorId,
      requirement.id,
      `确认需求：${requirement.title}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(requirement));
  }

  rejectRequirement(
    input: RequirementActionInput
  ): Promise<Requirement> {
    const requirement = this.findRequirement(input.requirementId);
    requirement.status = "rejected";
    requirement.confirmedBy = null;
    requirement.updatedAt = now();
    this.addEvent(
      "requirement_rejected",
      input.actorId,
      requirement.id,
      `否决需求：${requirement.title}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(requirement));
  }

  changeRequirement(
    input: ChangeRequirementInput
  ): Promise<ImpactReport> {
    const requirement = this.findRequirement(input.requirementId);
    requirement.title = input.title?.trim() || requirement.title;
    requirement.content = input.content;
    requirement.version += 1;
    requirement.status = "changed";
    requirement.confirmedBy = null;
    requirement.updatedAt = now();

    const affectedTasks = this.state.tasks.filter((task) =>
      task.requirementIds.includes(requirement.id)
    );
    for (const task of affectedTasks) {
      if (task.status !== "merged") {
        task.status = "needs_recheck";
        task.updatedAt = now();
      }
    }
    const affectedFiles = [
      ...new Set(
        this.state.codeLinks
          .filter((link) =>
            affectedTasks.some((task) => task.id === link.taskId)
          )
          .map((link) => link.filePath)
      )
    ];
    const affectedTestIds = this.state.testResults
      .filter((result) =>
        affectedTasks.some((task) => task.id === result.taskId)
      )
      .map((result) => result.id);
    const impact: ImpactReport = {
      requirement: structuredClone(requirement),
      affectedTasks: structuredClone(affectedTasks),
      affectedFiles,
      affectedTestIds,
      summary: `需求 ${requirement.id} 已更新至版本 ${requirement.version}。${input.reason}`,
      createdAt: now()
    };
    this.state.impacts.unshift(impact);
    this.addEvent(
      "requirement_changed",
      input.actorId,
      requirement.id,
      `修改需求：${requirement.title}，影响 ${affectedTasks.length} 项任务`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(impact));
  }

  async generatePlan(input: GeneratePlanInput): Promise<Plan> {
    const confirmed = this.state.requirements.filter(
      (requirement) => requirement.status === "confirmed"
    );
    if (confirmed.length === 0) {
      throw new Error("至少需要一条已确认需求才能生成计划");
    }
    const draft = await this.planner.generate(confirmed, {
      actorId: input.actorId
    });
    const tasks = this.buildTasks(draft, confirmed);
    const timestamp = now();
    this.state.project.planVersion += 1;
    this.state.project.updatedAt = timestamp;
    const plan: Plan = {
      id: `plan-${randomUUID()}`,
      version: this.state.project.planVersion,
      summary: draft.summary,
      source: draft.source,
      sourceLabel: draft.sourceLabel,
      createdBy: input.actorId,
      confirmedBy: input.actorId,
      createdAt: timestamp,
      taskIds: tasks.map((task) => task.id)
    };
    this.state.plan = plan;
    this.state.tasks = tasks;
    this.state.codeLinks = [];
    this.state.testResults = [];
    this.state.handovers = [];
    this.addEvent(
      "plan_generated",
      input.actorId,
      plan.id,
      `生成计划 v${plan.version}（${plan.sourceLabel}）`
    );
    this.persistAndNotify();
    return structuredClone(plan);
  }

  startTask(input: TaskActionInput): Promise<PlanTask> {
    const task = this.findTask(input.taskId);
    this.assertDependenciesComplete(task);
    if (
      !["planned", "ready", "needs_recheck", "tests_failed"].includes(
        task.status
      )
    ) {
      throw new Error(`任务当前状态为 ${task.status}，不能开始`);
    }
    task.status = "running";
    task.ownerId = input.actorId;
    task.updatedAt = now();
    this.addEvent(
      "task_started",
      input.actorId,
      task.id,
      `开始任务：${task.title}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(task));
  }

  async executeTask(
    input: TaskActionInput
  ): Promise<TaskExecutionResult> {
    const requestedTask = this.findTask(input.taskId);
    if (this.runningTasks.has(requestedTask.id)) {
      throw new Error(`任务“${requestedTask.title}”正在执行，请等待当前执行结束`);
    }
    this.runningTasks.add(requestedTask.id);

    let task = requestedTask;
    try {
      this.assertDependenciesComplete(task);
      if (task.status !== "running") {
        await this.startTask(input);
        task = this.findTask(input.taskId);
      }

      let execution;
      try {
        execution = await this.repository.executeTask(
          task.id,
          task.demoAction
        );
      } catch (error) {
        task.status = "tests_failed";
        task.updatedAt = now();
        this.addEvent(
          "task_executed",
          input.actorId,
          task.id,
          `任务执行异常：${task.title}；${
            error instanceof Error ? error.message : String(error)
          }`
        );
        this.persistAndNotify();
        throw new Error(
          `任务执行失败：${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
      const timestamp = now();
      const codeLink = {
        id: `code-${randomUUID()}`,
        taskId: task.id,
        filePath: execution.filePath,
        commit: execution.commit,
        diff: execution.diff,
        createdAt: timestamp
      };
      const testResult: TestResult = {
        id: `test-${randomUUID()}`,
        taskId: task.id,
        command: execution.command,
        exitCode: execution.exitCode,
        passed: execution.passed,
        durationMs: execution.durationMs,
        stdout: execution.stdout,
        stderr: execution.stderr,
        createdAt: timestamp
      };
      this.state.codeLinks.unshift(codeLink);
      this.state.testResults.unshift(testResult);
      task.status = execution.passed ? "waiting_review" : "tests_failed";
      task.ownerId = input.actorId;
      task.updatedAt = timestamp;
      this.addEvent(
        "task_executed",
        input.actorId,
        task.id,
        execution.passed
          ? `任务执行完成，pytest 通过：${task.title}`
          : `任务执行失败，pytest 退出码 ${execution.exitCode}：${task.title}`
      );
      this.persistAndNotify();
      return {
        task: structuredClone(task),
        codeLink: structuredClone(codeLink),
        testResult: structuredClone(testResult)
      };
    } finally {
      this.runningTasks.delete(requestedTask.id);
    }
  }

  interruptTask(input: TaskActionInput): Promise<Handover> {
    const task = this.findTask(input.taskId);
    const timestamp = now();
    const linkedTests = this.state.testResults.filter(
      (result) => result.taskId === task.id
    );
    const handover: Handover = {
      id: `handover-${randomUUID()}`,
      taskId: task.id,
      fromMemberId: input.actorId,
      toMemberId: opposite(input.actorId),
      completed:
        task.status === "waiting_review" ||
        linkedTests.length > 0
          ? ["代码修改已执行", "测试结果已保存"]
          : ["任务已创建", "需求与负责人已记录"],
      pending:
        task.status === "waiting_review"
          ? ["另一成员完成评审"]
          : ["核对当前需求版本", "继续执行并运行测试"],
      evidence: [
        ...this.state.codeLinks
          .filter((link) => link.taskId === task.id)
          .map((link) => `${link.filePath} @ ${link.commit || "未提交"}`),
        ...linkedTests.map(
          (result) =>
            `${result.command}：${result.passed ? "通过" : `失败(${result.exitCode})`}`
        )
      ],
      createdAt: timestamp,
      resumedAt: null
    };
    task.status = "waiting_handover";
    task.updatedAt = timestamp;
    const member = this.state.members.find(
      (item) => item.id === input.actorId
    );
    if (member) {
      member.status = "interrupted";
    }
    this.state.handovers.unshift(handover);
    this.addEvent(
      "task_interrupted",
      input.actorId,
      task.id,
      `中断任务并生成交接记录：${task.title}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(handover));
  }

  resumeTask(input: ResumeTaskInput): Promise<PlanTask> {
    const task = this.findTask(input.taskId);
    const handover = this.state.handovers.find(
      (item) => item.id === input.handoverId
    );
    if (!handover) {
      throw new Error("交接记录不存在");
    }
    if (task.status !== "waiting_handover") {
      throw new Error("当前任务不在等待交接状态");
    }
    handover.toMemberId = input.actorId;
    handover.resumedAt = now();
    task.ownerId = input.actorId;
    task.status = "ready";
    task.updatedAt = handover.resumedAt;
    const member = this.state.members.find(
      (item) => item.id === input.actorId
    );
    if (member) {
      member.status = "online";
    }
    this.addEvent(
      "task_resumed",
      input.actorId,
      task.id,
      `接管任务：${task.title}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(task));
  }

  submitReview(input: ReviewInput): Promise<PlanTask> {
    const task = this.findTask(input.taskId);
    if (
      !["waiting_review", "needs_recheck"].includes(task.status)
    ) {
      throw new Error("当前任务不在可评审状态");
    }
    task.status =
      input.decision === "approve" ? "reviewed" : "needs_recheck";
    task.updatedAt = now();
    this.addEvent(
      "task_reviewed",
      input.actorId,
      task.id,
      `${input.decision === "approve" ? "通过" : "退回"}评审：${task.title}${
        input.comment ? `；${input.comment}` : ""
      }`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(task));
  }

  mergeTask(input: MergeTaskInput): Promise<PlanTask> {
    const task = this.findTask(input.taskId);
    if (task.status !== "reviewed") {
      throw new Error("任务通过评审后才能合并");
    }
    task.status = "merged";
    task.updatedAt = now();
    this.addEvent(
      "task_merged",
      input.actorId,
      task.id,
      `合并任务：${task.title}${input.comment ? `；${input.comment}` : ""}`
    );
    this.persistAndNotify();
    return Promise.resolve(structuredClone(task));
  }

  async resetDemo(): Promise<void> {
    if (this.runningTasks.size > 0) {
      throw new Error("有任务正在执行，暂时不能重置演示数据");
    }
    this.state = this.store.reset();
    await this.repository.resetWorkspace();
    this.addEvent(
      "demo_reset",
      "member-a",
      this.state.project.id,
      "重置演示数据与代码仓库"
    );
    this.persistAndNotify();
  }

  private buildTasks(
    draft: GeneratedPlanDraft,
    confirmed: Requirement[]
  ): PlanTask[] {
    const timestamp = now();
    const ids = draft.tasks.map(() => `task-${randomUUID()}`);
    return draft.tasks.map((item, index) => ({
      id: ids[index],
      title: item.title,
      description: item.description,
      ownerId: (index % 2 === 0 ? "member-a" : "member-b") as MemberId,
      status: "planned",
      dependencyIds:
        item.demoAction === "stock_validation" ? [ids[0]] : [],
      requirementIds: this.requirementsForAction(
        item.demoAction,
        confirmed
      ),
      acceptanceCriteria: item.acceptanceCriteria,
      demoAction: item.demoAction,
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }

  private requirementsForAction(
    action: GeneratedPlanDraft["tasks"][number]["demoAction"],
    requirements: Requirement[]
  ): string[] {
    const ids = requirements.map((item) => item.id);
    if (action === "inventory_summary") {
      return [ids[0]];
    }
    if (action === "discount_rule") {
      return [...new Set([ids[0], ids[1]].filter(Boolean))];
    }
    return [
      ...new Set([ids[0], ids[2] ?? ids[1]].filter(Boolean))
    ];
  }

  private assertDependenciesComplete(task: PlanTask): void {
    const incomplete = task.dependencyIds
      .map((id) => this.findTask(id))
      .filter(
        (dependency) =>
          !["reviewed", "merged"].includes(dependency.status)
      );
    if (incomplete.length > 0) {
      throw new Error(
        `前置任务尚未完成：${incomplete
          .map((item) => item.title)
          .join("、")}`
      );
    }
  }

  private findRequirement(id: string): Requirement {
    const requirement = this.state.requirements.find(
      (item) => item.id === id
    );
    if (!requirement) {
      throw new Error("需求不存在");
    }
    return requirement;
  }

  private findTask(id: string): PlanTask {
    const task = this.state.tasks.find((item) => item.id === id);
    if (!task) {
      throw new Error("任务不存在");
    }
    return task;
  }

  private addEvent(
    type: ActivityEvent["type"],
    actorId: MemberId,
    objectId: string,
    summary: string
  ): void {
    this.state.events.unshift({
      id: `event-${randomUUID()}`,
      type,
      actorId,
      objectId,
      summary,
      createdAt: now()
    });
  }

  private persistAndNotify(): void {
    this.state.updatedAt = now();
    this.state.project.updatedAt = this.state.updatedAt;
    this.store.save(this.state);
    this.notifyChange();
  }
}
