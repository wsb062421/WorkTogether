export const MEMBER_IDS = ["member-a", "member-b"] as const;
export type MemberId = (typeof MEMBER_IDS)[number];

export type RequirementStatus =
  | "proposed"
  | "confirmed"
  | "rejected"
  | "changed";

export type TaskStatus =
  | "planned"
  | "ready"
  | "running"
  | "tests_failed"
  | "waiting_review"
  | "needs_recheck"
  | "waiting_handover"
  | "reviewed"
  | "merged";

export type DemoAction =
  | "inventory_summary"
  | "discount_rule"
  | "stock_validation";

export interface Project {
  id: string;
  name: string;
  repositoryName: string;
  planVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: MemberId;
  name: string;
  role: string;
  status: "online" | "interrupted";
}

export interface Requirement {
  id: string;
  title: string;
  content: string;
  authorId: MemberId;
  confirmedBy: MemberId | null;
  status: RequirementStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  ownerId: MemberId;
  status: TaskStatus;
  dependencyIds: string[];
  requirementIds: string[];
  acceptanceCriteria: string[];
  demoAction: DemoAction;
  createdAt: string;
  updatedAt: string;
}

export interface CodeLink {
  id: string;
  taskId: string;
  filePath: string;
  commit: string;
  diff: string;
  createdAt: string;
}

export interface TestResult {
  id: string;
  taskId: string;
  command: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  version: number;
  summary: string;
  source: "deepseek" | "fallback";
  sourceLabel: string;
  createdBy: MemberId;
  confirmedBy: MemberId | null;
  createdAt: string;
  taskIds: string[];
}

export interface Handover {
  id: string;
  taskId: string;
  fromMemberId: MemberId;
  toMemberId: MemberId | null;
  completed: string[];
  pending: string[];
  evidence: string[];
  createdAt: string;
  resumedAt: string | null;
}

export interface ImpactReport {
  requirement: Requirement;
  affectedTasks: PlanTask[];
  affectedFiles: string[];
  affectedTestIds: string[];
  summary: string;
  createdAt: string;
}

export type EventType =
  | "project_seeded"
  | "requirement_created"
  | "requirement_confirmed"
  | "requirement_rejected"
  | "requirement_changed"
  | "plan_generated"
  | "task_started"
  | "task_executed"
  | "task_interrupted"
  | "task_resumed"
  | "task_reviewed"
  | "task_merged"
  | "demo_reset";

export interface ActivityEvent {
  id: string;
  type: EventType;
  actorId: MemberId;
  objectId: string;
  summary: string;
  createdAt: string;
}

export interface AppSnapshot {
  schemaVersion: 1;
  project: Project;
  members: Member[];
  requirements: Requirement[];
  plan: Plan | null;
  tasks: PlanTask[];
  codeLinks: CodeLink[];
  testResults: TestResult[];
  handovers: Handover[];
  impacts: ImpactReport[];
  events: ActivityEvent[];
  updatedAt: string;
}

export interface CreateRequirementInput {
  actorId: MemberId;
  title: string;
  content: string;
}

export interface RequirementActionInput {
  actorId: MemberId;
  requirementId: string;
}

export interface ChangeRequirementInput extends RequirementActionInput {
  title?: string;
  content: string;
  reason: string;
}

export interface GeneratePlanInput {
  actorId: MemberId;
}

export interface TaskActionInput {
  actorId: MemberId;
  taskId: string;
}

export interface ResumeTaskInput extends TaskActionInput {
  handoverId: string;
}

export interface ReviewInput extends TaskActionInput {
  decision: "approve" | "return";
  comment: string;
}

export interface MergeTaskInput extends TaskActionInput {
  comment?: string;
}

export interface TaskExecutionResult {
  task: PlanTask;
  codeLink: CodeLink;
  testResult: TestResult;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface TeamApi {
  getSnapshot(memberId: MemberId): Promise<AppSnapshot>;
  createRequirement(
    input: CreateRequirementInput
  ): Promise<Requirement>;
  confirmRequirement(
    input: RequirementActionInput
  ): Promise<Requirement>;
  rejectRequirement(
    input: RequirementActionInput
  ): Promise<Requirement>;
  changeRequirement(
    input: ChangeRequirementInput
  ): Promise<ImpactReport>;
  generatePlan(input: GeneratePlanInput): Promise<Plan>;
  startTask(input: TaskActionInput): Promise<PlanTask>;
  executeTask(input: TaskActionInput): Promise<TaskExecutionResult>;
  interruptTask(input: TaskActionInput): Promise<Handover>;
  resumeTask(input: ResumeTaskInput): Promise<PlanTask>;
  submitReview(input: ReviewInput): Promise<PlanTask>;
  mergeTask(input: MergeTaskInput): Promise<PlanTask>;
  resetDemo(): Promise<void>;
  openSecondMemberWindow(): Promise<void>;
  onStateChanged(listener: () => void): () => void;
}

export const IPC_CHANNELS = {
  getSnapshot: "team-api:get-snapshot",
  createRequirement: "team-api:create-requirement",
  confirmRequirement: "team-api:confirm-requirement",
  rejectRequirement: "team-api:reject-requirement",
  changeRequirement: "team-api:change-requirement",
  generatePlan: "team-api:generate-plan",
  startTask: "team-api:start-task",
  executeTask: "team-api:execute-task",
  interruptTask: "team-api:interrupt-task",
  resumeTask: "team-api:resume-task",
  submitReview: "team-api:submit-review",
  mergeTask: "team-api:merge-task",
  resetDemo: "team-api:reset-demo",
  openSecondWindow: "team-api:open-second-window",
  stateChanged: "team-api:state-changed"
} as const;
