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

    // 简单的模拟影响报告
    const impactedTasks = this.snapshot.tasks.filter((t) =>
      t.requirementIds.includes(req.id)
    );
    impactedTasks.forEach((t) => {
      if (t.status !== "merged") t.status = "needs_recheck";
    });

    const report: ImpactReport = {
      requirement: clone(req),
      affectedTasks: clone(impactedTasks),
      affectedFiles: ["demo-repo/inventory.py"],
      affectedTestIds: ["test-1"],
      summary: `需求变更：${input.reason}。影响了 ${impactedTasks.length} 个任务。`,
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
      taskIds: ["task-1", "task-2"],
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

  // 简化其余任务的实现，以确保 mock 可用
  async startTask(input: TaskActionInput): Promise<PlanTask> {
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    task.status = "running";
    task.ownerId = input.actorId;
    task.updatedAt = new Date().toISOString();
    this.triggerChange();
    return clone(task);
  }

  async executeTask(input: TaskActionInput): Promise<TaskExecutionResult> {
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    
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
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    task.status = "waiting_handover";
    const handover: Handover = {
      id: `hand-${Date.now()}`,
      taskId: task.id,
      fromMemberId: input.actorId,
      toMemberId: null,
      completed: ["部分实现"],
      pending: ["完成测试"],
      evidence: ["diff 文件已保存"],
      createdAt: new Date().toISOString(),
      resumedAt: null,
    };
    this.snapshot.handovers.push(handover);
    this.triggerChange();
    return clone(handover);
  }

  async resumeTask(input: ResumeTaskInput): Promise<PlanTask> {
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    task.status = "ready";
    task.ownerId = input.actorId;
    const handover = this.snapshot.handovers.find((h) => h.id === input.handoverId);
    if (handover) {
      handover.toMemberId = input.actorId;
      handover.resumedAt = new Date().toISOString();
    }
    this.triggerChange();
    return clone(task);
  }

  async submitReview(input: ReviewInput): Promise<PlanTask> {
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
    task.status = input.decision === "approve" ? "reviewed" : "needs_recheck";
    task.updatedAt = new Date().toISOString();
    this.triggerChange();
    return clone(task);
  }

  async mergeTask(input: MergeTaskInput): Promise<PlanTask> {
    const task = this.snapshot.tasks.find((t) => t.id === input.taskId);
    if (!task) throw new Error("任务不存在");
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
