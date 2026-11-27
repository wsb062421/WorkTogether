// src/renderer/adapters/mockTeamApi.ts
import type {
  TeamApi,
  AppSnapshot,
  MemberId,
  Requirement,
  CreateRequirementInput,
  RequirementActionInput,
  ChangeRequirementInput,
  GeneratePlanInput,
  TaskActionInput,
  ResumeTaskInput,
  ReviewInput,
  MergeTaskInput,
  TaskExecutionResult,
  ImpactReport,
  Handover,
  Plan,
  PlanTask,
} from "@shared/contracts";

// 初始快照数据
const initialSnapshot: AppSnapshot = {
  schemaVersion: 1,
  project: {
    id: "proj-1",
    name: "迷你库存协作开发",
    repositoryName: "demo-repo",
    planVersion: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  members: [
    { id: "member-a", name: "成员甲", role: "需求与最终验收", status: "online" },
    { id: "member-b", name: "成员乙", role: "代码执行与测试", status: "online" },
  ],
  requirements: [
    {
      id: "req-1",
      title: "库存汇总",
      content: "相同商品的多条库存记录需要汇总，不能重复计数。",
      authorId: "member-a",
      confirmedBy: "member-b",
      status: "confirmed",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "req-2",
      title: "折扣计算",
      content: "订单金额达到 100 元时应用九折优惠。",
      authorId: "member-a",
      confirmedBy: null,
      status: "proposed",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  plan: null,
  tasks: [],
  codeLinks: [],
  testResults: [],
  handovers: [],
  impacts: [],
  events: [
    {
      id: "evt-1",
      type: "project_seeded",
      actorId: "member-a",
      objectId: "proj-1",
      summary: "项目初始数据已加载",
      createdAt: new Date().toISOString(),
    },
  ],
  updatedAt: new Date().toISOString(),
};

// 深拷贝，避免污染初始数据
function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

export class MockTeamApi implements TeamApi {
  private snapshot: AppSnapshot = clone(initialSnapshot);
  private listeners: (() => void)[] = [];

  private triggerChange() {
    this.snapshot.updatedAt = new Date().toISOString();
    // 模拟异步广播，与真实主进程行为一致
    setTimeout(() => {
      this.listeners.forEach((listener) => listener());
    }, 50);
  }

  async getSnapshot(memberId: MemberId): Promise<AppSnapshot> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 300));
    return clone(this.snapshot);
  }

  async createRequirement(input: CreateRequirementInput): Promise<Requirement> {
    const newReq: Requirement = {
      id: `req-${Date.now()}`,
      title: input.title,
      content: input.content,
      authorId: input.actorId,
      confirmedBy: null,
      status: "proposed",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.snapshot.requirements.push(newReq);
    this.snapshot.events.unshift({
      id: `evt-${Date.now()}`,
      type: "requirement_created",
      actorId: input.actorId,
      objectId: newReq.id,
      summary: `创建了需求：${newReq.title}`,
      createdAt: new Date().toISOString(),
    });
    this.triggerChange();
    return clone(newReq);
  }

  async confirmRequirement(input: RequirementActionInput): Promise<Requirement> {
    const req = this.snapshot.requirements.find((r) => r.id === input.requirementId);
    if (!req) throw new Error("需求不存在");
    req.status = "confirmed";
    req.confirmedBy = input.actorId;
    req.updatedAt = new Date().toISOString();
    this.snapshot.events.unshift({
      id: `evt-${Date.now()}`,
      type: "requirement_confirmed",
      actorId: input.actorId,
      objectId: req.id,
      summary: `确认了需求：${req.title}`,
      createdAt: new Date().toISOString(),
    });
    this.triggerChange();
    return clone(req);
  }

  async rejectRequirement(input: RequirementActionInput): Promise<Requirement> {
    const req = this.snapshot.requirements.find((r) => r.id === input.requirementId);
    if (!req) throw new Error("需求不存在");
    req.status = "rejected";
    req.confirmedBy = null;
    req.updatedAt = new Date().toISOString();
    this.snapshot.events.unshift({
      id: `evt-${Date.now()}`,
      type: "requirement_rejected",
      actorId: input.actorId,
      objectId: req.id,
      summary: `否决了需求：${req.title}`,
      createdAt: new Date().toISOString(),
    });
    this.triggerChange();
    return clone(req);
  }

  async changeRequirement(input: ChangeRequirementInput): Promise<ImpactReport> {
    const req = this.snapshot.requirements.find((r) => r.id === input.requirementId);
    if (!req) throw new Error("需求不存在");
    
    req.content = input.content;
    if (input.title) req.title = input.title;
    req.version += 1;
    req.status = "changed";
    req.confirmedBy = null;
    req.updatedAt = new Date().toISOString();

    // 影响范围由已有关联数据计算：Task.requirementIds -> CodeLink.taskId -> TestResult.taskId
    const impactedTasks = this.snapshot.tasks.filter((t) =>
      t.requirementIds.includes(req.id)
    );
    const affectedTasksBefore = clone(impactedTasks); // 变更前状态，供影响视图展示“原状态”
    const impactedTaskIds = new Set(impactedTasks.map((t) => t.id));
    impactedTasks.forEach((t) => {
      if (t.status !== "merged") t.status = "needs_recheck";
    });

    const affectedFiles = [
      ...new Set(
        this.snapshot.codeLinks
          .filter((link) => impactedTaskIds.has(link.taskId))
          .map((link) => link.filePath)
      ),
    ];
    const affectedTestIds = this.snapshot.testResults
      .filter((result) => impactedTaskIds.has(result.taskId))
      .map((result) => result.id);

    const report: ImpactReport = {
      requirement: clone(req),
      affectedTasks: clone(impactedTasks),
      affectedFiles,
      affectedTestIds,
      summary: `需求变更：${input.reason}。影响 ${affectedTasksBefore.length} 个任务、${affectedFiles.length} 个文件、${affectedTestIds.length} 条历史测试。`,
      createdAt: new Date().toISOString(),
    };

    this.snapshot.impacts.push(report);
    this.snapshot.events.unshift({
      id: `evt-${Date.now()}`,
      type: "requirement_changed",
      actorId: input.actorId,
      objectId: req.id,
      summary: `修改了需求：${req.title}`,
      createdAt: new Date().toISOString(),
    });
    this.triggerChange();
    return clone(report);
  }

  async generatePlan(input: GeneratePlanInput): Promise<Plan> {
    const confirmed = this.snapshot.requirements.filter((r) => r.status === "confirmed");
    if (confirmed.length === 0) throw new Error("至少需要一条已确认需求才能生成计划");

    const newPlan: Plan = {
      id: `plan-${Date.now()}`,
      version: (this.snapshot.plan?.version || 0) + 1,
      summary: "基于已确认需求生成的演示计划",
      source: "fallback",
      sourceLabel: "离线备用计划",
      createdBy: input.actorId,
      confirmedBy: null,
      createdAt: new Date().toISOString(),
      taskIds: ["task-1", "task-2", "task-3"],
    };

    const newTasks: PlanTask[] = [
      {
        id: "task-1",
        title: "实现库存汇总",
        description: "根据商品汇总库存数据",
        ownerId: "member-b",
        status: "planned",
        dependencyIds: [],
        requirementIds: [confirmed[0].id],
        acceptanceCriteria: ["测试通过", "代码审查通过"],
        demoAction: "inventory_summary",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "task-2",
        title: "实现折扣计算",
        description: "当订单金额达到100元时应用九折",
        ownerId: "member-b",
        status: "planned",
        dependencyIds: ["task-1"],
        requirementIds: confirmed.map((r) => r.id),
        acceptanceCriteria: ["测试通过", "边界值校验正确"],
        demoAction: "discount_rule",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "task-3",
        title: "实现库存校验",
        description: "库存不足时禁止生成待交付订单",
        ownerId: "member-b",
        status: "planned",
        dependencyIds: ["task-1"],
        requirementIds: confirmed.map((r) => r.id),
        acceptanceCriteria: ["库存不足返回错误", "测试通过"],
        demoAction: "stock_validation",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    this.snapshot.plan = newPlan;
    this.snapshot.tasks = newTasks;
    this.snapshot.project.planVersion = newPlan.version;
    this.snapshot.project.updatedAt = new Date().toISOString();
    
    this.snapshot.events.unshift({
      id: `evt-${Date.now()}`,
      type: "plan_generated",
      actorId: input.actorId,
      objectId: newPlan.id,
      summary: `生成了第 ${newPlan.version} 版计划`,
      createdAt: new Date().toISOString(),
    });
    this.triggerChange();
    return clone(newPlan);
  }

  // 任务动作的规则与 src/main/services/TeamAgentService.ts 保持一致
  private findTaskOrThrow(taskId: string): PlanTask {
    const task = this.snapshot.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("任务不存在");
    return task;
  }

  private memberLabel(memberId: MemberId): string {
    return memberId === "member-a" ? "成员甲" : "成员乙";
  }

  private setMemberStatus(memberId: MemberId, status: "online" | "interrupted") {
    const member = this.snapshot.members.find((m) => m.id === memberId);
    if (member) member.status = status;
  }

  private assertCurrentOwnerOrUnclaimed(task: PlanTask, actorId: MemberId) {
    if (["running", "tests_failed"].includes(task.status) && task.ownerId !== actorId) {
      throw new Error(`任务当前由${this.memberLabel(task.ownerId)}负责，请先完成交接再继续`);
    }
  }

  private assertDependenciesComplete(task: PlanTask) {
    for (const depId of task.dependencyIds) {
      const dep = this.snapshot.tasks.find((t) => t.id === depId);
      if (dep && !["reviewed", "merged"].includes(dep.status)) {
        throw new Error(`前置任务「${dep.title}」尚未评审通过`);
      }
    }
  }

  async startTask(input: TaskActionInput): Promise<PlanTask> {
    const task = this.findTaskOrThrow(input.taskId);
    this.assertCurrentOwnerOrUnclaimed(task, input.actorId);
    this.assertDependenciesComplete(task);
    if (!["planned", "ready", "needs_recheck", "tests_failed"].includes(task.status)) {
      throw new Error(`任务当前状态为 ${task.status}，不能开始`);
    }
    task.status = "running";
    task.ownerId = input.actorId;
    task.updatedAt = new Date().toISOString();
    this.triggerChange();
    return clone(task);
  }

  async executeTask(input: TaskActionInput): Promise<TaskExecutionResult> {
    const task = this.findTaskOrThrow(input.taskId);
    this.assertCurrentOwnerOrUnclaimed(task, input.actorId);
    if (task.status !== "running" && task.status !== "tests_failed") {
      throw new Error("请先开始任务再执行");
    }
    task.status = "waiting_review";
    task.updatedAt = new Date().toISOString();
    const codeLink = {
      id: `code-${Date.now()}`,
      taskId: task.id,
      filePath: "demo-repo/inventory.py",
      commit: "mock123",
      diff: "+ def summarize():\n+     return sum()",
      createdAt: new Date().toISOString(),
    };
    const testResult = {
      id: `test-${Date.now()}`,
      taskId: task.id,
      command: "pytest demo-repo",
      exitCode: 0,
      passed: true,
      durationMs: 1500,
      stdout: "2 passed",
      stderr: "",
      createdAt: new Date().toISOString(),
    };
    this.snapshot.codeLinks.push(codeLink);
    this.snapshot.testResults.push(testResult);
    this.triggerChange();
    return clone({ task, codeLink, testResult });
  }

  async interruptTask(input: TaskActionInput): Promise<Handover> {
    const task = this.findTaskOrThrow(input.taskId);
    if (task.ownerId !== input.actorId) {
      throw new Error(`只有当前负责人${this.memberLabel(task.ownerId)}可以中断该任务`);
    }
    if (!["planned", "ready", "running", "tests_failed", "waiting_review", "needs_recheck"].includes(task.status)) {
      throw new Error(`任务当前状态为 ${task.status}，不能中断交接`);
    }
    const otherId: MemberId = input.actorId === "member-a" ? "member-b" : "member-a";
    const linkedTests = this.snapshot.testResults.filter((r) => r.taskId === task.id);
    const latestTest = linkedTests[linkedTests.length - 1];
    const hasCode = this.snapshot.codeLinks.some((l) => l.taskId === task.id);
    const handover: Handover = {
      id: `hand-${Date.now()}`,
      taskId: task.id,
      fromMemberId: input.actorId,
      toMemberId: otherId,
      completed: hasCode ? ["已保存代码修改（diff）"] : ["尚未产生代码修改"],
      pending: [
        latestTest?.passed ? "重新核对并提交评审" : "修复 pytest 失败并重新执行",
        ...task.acceptanceCriteria.map((c) => `确认验收：${c}`),
      ],
      evidence: [
        ...this.snapshot.codeLinks.filter((l) => l.taskId === task.id).map((l) => `代码：${l.filePath}（${l.commit}）`),
        ...(latestTest ? [`最近测试：${latestTest.passed ? "通过" : "失败"}（退出码 ${latestTest.exitCode}）`] : ["尚未执行测试"]),
      ],
      createdAt: new Date().toISOString(),
      resumedAt: null,
    };
    task.status = "waiting_handover";
    task.updatedAt = new Date().toISOString();
    this.snapshot.handovers.push(handover);
    this.setMemberStatus(input.actorId, "interrupted");
    this.triggerChange();
    return clone(handover);
  }

  async resumeTask(input: ResumeTaskInput): Promise<PlanTask> {
    const task = this.findTaskOrThrow(input.taskId);
    const handover = this.snapshot.handovers.find((h) => h.id === input.handoverId);
    if (!handover) throw new Error("交接记录不存在");
    if (handover.taskId !== task.id) throw new Error("交接记录与当前任务不匹配");
    if (task.status !== "waiting_handover") throw new Error("当前任务不在等待交接状态");
    if (input.actorId === handover.fromMemberId) throw new Error("原负责人不能接管自己交出的任务");
    if (handover.toMemberId && handover.toMemberId !== input.actorId) {
      throw new Error("当前成员不是该交接记录的接管人");
    }
    handover.toMemberId = input.actorId;
    handover.resumedAt = new Date().toISOString();
    task.ownerId = input.actorId;
    task.status = "ready";
    task.updatedAt = new Date().toISOString();
    this.setMemberStatus(input.actorId, "online");
    this.triggerChange();
    return clone(task);
  }

  async submitReview(input: ReviewInput): Promise<PlanTask> {
    const task = this.findTaskOrThrow(input.taskId);
    if (task.ownerId === input.actorId) throw new Error("任务执行者不能评审自己的任务");
    if (!["waiting_review", "needs_recheck"].includes(task.status)) {
      throw new Error("当前任务不在可评审状态");
    }
    if (input.decision === "approve") {
      if (task.status !== "waiting_review") throw new Error("需求重新核对后，需要先重新执行任务并通过测试");
      const tests = this.snapshot.testResults.filter((r) => r.taskId === task.id);
      if (!tests[tests.length - 1]?.passed) throw new Error("任务缺少通过的 pytest 证据，不能通过评审");
      const invalid = this.snapshot.requirements.some(
        (r) => task.requirementIds.includes(r.id) && r.status !== "confirmed"
      );
      if (invalid) throw new Error("关联需求未处于已确认状态，不能通过评审");
    } else if (!input.comment.trim()) {
      throw new Error("退回任务时必须填写原因");
    }
    task.status = input.decision === "approve" ? "reviewed" : "needs_recheck";
    task.updatedAt = new Date().toISOString();
    this.triggerChange();
    return clone(task);
  }

  async mergeTask(input: MergeTaskInput): Promise<PlanTask> {
    const task = this.findTaskOrThrow(input.taskId);
    if (task.status !== "reviewed") throw new Error("任务通过评审后才能合并");
    if (task.ownerId === input.actorId) throw new Error("任务执行者不能合并自己的任务");
    task.status = "merged";
    task.updatedAt = new Date().toISOString();
    this.triggerChange();
    return clone(task);
  }

  async resetDemo(): Promise<void> {
    this.snapshot = clone(initialSnapshot);
    this.triggerChange();
  }

  async openSecondMemberWindow(): Promise<void> {
    console.log("[Mock] 尝试打开另一成员窗口");
    alert("在 mock 模式下无法打开真实窗口，请在真实环境中测试此功能。");
  }

  onStateChanged(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

export const mockTeamApi = new MockTeamApi();
