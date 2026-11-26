// src/renderer/pages/TasksPage.tsx
import { useState } from "react";
import type {
  AppSnapshot,
  CodeLink,
  MemberId,
  PlanTask,
  Requirement,
  TaskStatus,
  TestResult
} from "@shared/contracts";
import { teamApi } from "../adapters";
import type { PageKey } from "../components/Layout";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
  onNavigate: (page: PageKey) => void;
}

type BusyAction = "start" | "execute";

interface Notice {
  kind: "ok" | "info" | "warn" | "error";
  text: string;
}

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  planned: "已计划",
  ready: "就绪",
  running: "执行中",
  tests_failed: "测试失败",
  waiting_review: "等待评审",
  needs_recheck: "需重新核对",
  waiting_handover: "等待交接",
  reviewed: "已评审",
  merged: "已合并"
};

const REQUIREMENT_STATUS_LABEL: Record<Requirement["status"], string> = {
  proposed: "待确认",
  confirmed: "已确认",
  rejected: "已否决",
  changed: "已修改，需重新核对"
};

// 执行器真实只有开始与结束两个接口回调，这里列出固定步骤说明，不伪造逐步进度
const EXECUTION_STEPS = [
  "读取任务与需求",
  "准备演示仓库",
  "修改代码",
  "运行 pytest",
  "保存代码与测试证据"
];

// 前置任务达到评审通过或已合并，才视为依赖已满足
const DEPENDENCY_DONE: TaskStatus[] = ["reviewed", "merged"];
const STARTABLE: TaskStatus[] = ["planned", "ready", "needs_recheck"];
const EXECUTABLE: TaskStatus[] = ["running", "tests_failed"];

function memberName(id: MemberId | null): string {
  if (id === "member-a") return "成员甲";
  if (id === "member-b") return "成员乙";
  return "未分配";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function sortByTime<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function taskScoped<T extends { taskId: string; createdAt: string }>(items: T[], taskId: string): T[] {
  return sortByTime(items.filter((item) => item.taskId === taskId));
}

function testLabel(test: TestResult | undefined): string {
  if (!test) return "尚未执行";
  return test.passed ? "测试通过" : "测试失败";
}

function testClass(test: TestResult | undefined): string {
  if (!test) return "test-none";
  return test.passed ? "test-pass" : "test-fail";
}

// 默认选中：优先正在执行的任务，其次第一个未合并任务，最后第一个任务
function pickDefaultTask(tasks: PlanTask[]): PlanTask | undefined {
  return (
    tasks.find((t) => t.status === "running") ??
    tasks.find((t) => t.status !== "merged") ??
    tasks[0]
  );
}

// 返回尚未满足的前置任务说明，为空表示可以继续
function blockingReasons(task: PlanTask, tasks: PlanTask[]): string[] {
  const reasons: string[] = [];
  for (const depId of task.dependencyIds) {
    const dep = tasks.find((t) => t.id === depId);
    if (dep && !DEPENDENCY_DONE.includes(dep.status)) {
      reasons.push(`前置任务「${dep.title}」尚未评审通过（当前：${TASK_STATUS_LABEL[dep.status]}）`);
    }
  }
  return reasons;
}

function failureReason(test: TestResult): string {
  const lines = (test.stderr || test.stdout).trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1];
  return last ? last : `pytest 退出码 ${test.exitCode}`;
}

export default function TasksPage({ snapshot, memberId, onNavigate }: Props) {
  const tasks = snapshot.tasks;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selected: PlanTask | undefined =
    tasks.find((t) => t.id === selectedId) ?? pickDefaultTask(tasks);

  if (tasks.length === 0) {
    return (
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">任务执行</p>
            <h2>任务列表与执行证据</h2>
          </div>
        </div>
        <p className="muted-block">暂无任务。请先在“需求与计划”页确认需求并生成计划。</p>
        <div className="action-row">
          <button type="button" onClick={() => onNavigate("requirements")}>
            前往需求与计划
          </button>
        </div>
      </section>
    );
  }

  if (!selected) return null;

  const blockers = blockingReasons(selected, tasks);
  const codes = taskScoped(snapshot.codeLinks, selected.id);
  const latestCode: CodeLink | undefined = codes[codes.length - 1];
  const tests = taskScoped(snapshot.testResults, selected.id);
  const latestTest: TestResult | undefined = tests[tests.length - 1];
  const failedTest = latestTest && !latestTest.passed ? latestTest : undefined;
  const requirements = snapshot.requirements.filter((r) => selected.requirementIds.includes(r.id));
  const requirementCount = (task: PlanTask) => task.requirementIds.length;
  const isDependencyOfOthers = (task: PlanTask) =>
    tasks.some((other) => other.dependencyIds.includes(task.id));
  const otherRunning = selected.status === "running" && busy === null;

  const canStart = STARTABLE.includes(selected.status) && blockers.length === 0 && busy === null;
  const canExecute = EXECUTABLE.includes(selected.status) && blockers.length === 0 && busy === null;

  const runAction = async (action: BusyAction) => {
    if (busy) return;
    setBusy(action);
    setNotice(null);
    const input = { actorId: memberId, taskId: selected.id };
    try {
      if (action === "start") {
        await teamApi.startTask(input);
        setNotice({ kind: "ok", text: `已开始任务「${selected.title}」，状态更新为执行中。` });
      } else {
        const result = await teamApi.executeTask(input);
        if (result.testResult.passed) {
          setNotice({
            kind: "ok",
            text: `pytest 通过，代码已保存（commit ${result.codeLink.commit}），任务进入等待评审。`
          });
        } else {
          setNotice({
            kind: "warn",
            text: "pytest 未通过。这是一次已完成的失败测试，代码与日志证据已保留，请查看下方失败原因后重新执行。"
          });
        }
      }
    } catch (reason) {
      setNotice({
        kind: "error",
        text: `${action === "start" ? "开始任务" : "执行任务"}失败：${errorMessage(reason)}。当前任务和已保存的证据未被修改；若涉及 Python 或仓库环境，请检查环境后重试。`
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="tasks-page">
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">任务执行</p>
            <h2>任务列表与执行证据</h2>
          </div>
          <p className="meta">
            计划来源：{snapshot.plan?.sourceLabel ?? "尚未生成计划"} ｜ 执行来源：本地演示仓库 + 真实 pytest
          </p>
        </div>
        {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}
      </section>

      <div className="tasks-layout">
        {/* 左侧：任务列表 */}
        <section className="card task-list-panel">
          <h3>任务列表</h3>
          {tasks.map((task) => {
            const test = latestOf(snapshot, task.id);
            return (
              <button
                key={task.id}
                type="button"
                className={`task-item ${task.id === selected.id ? "task-item-active" : ""}`}
                onClick={() => {
                  setSelectedId(task.id);
                  setNotice(null);
                }}
              >
                <div className="row-between">
                  <strong>{task.title}</strong>
                  {isDependencyOfOthers(task) && <span className="tag">前置任务</span>}
                </div>
                <div className="meta">
                  负责人：{memberName(task.ownerId)} ｜ 关联需求 {requirementCount(task)} 项
                </div>
                <div className="row-between">
                  <span className={`status-badge task-status task-${task.status}`}>
                    {TASK_STATUS_LABEL[task.status]}
                  </span>
                  <span className={`test-chip ${testClass(test)}`}>{testLabel(test)}</span>
                </div>
              </button>
            );
          })}
        </section>

        {/* 中间：任务详情与操作 */}
        <section className="card task-detail-panel">
          <div className="row-between">
            <div>
              <p className="eyebrow">任务详情</p>
              <h2>{selected.title}</h2>
            </div>
            <span className={`status-badge task-status task-${selected.status}`}>
              {TASK_STATUS_LABEL[selected.status]}
            </span>
          </div>

          <p className="muted-block">{selected.description}</p>

          <div className="meta">
            负责人：{memberName(selected.ownerId)} ｜ 最近更新：{formatTime(selected.updatedAt)} ｜ 计划版本：
            {snapshot.plan ? `v${snapshot.plan.version}` : "尚未生成"}
          </div>

          <h3>关联需求</h3>
          {requirements.length === 0 ? (
            <p className="meta">该任务未关联需求。</p>
          ) : (
            <ul className="criteria">
              {requirements.map((req) => (
                <li key={req.id}>
                  {req.title}（版本 v{req.version}，{REQUIREMENT_STATUS_LABEL[req.status]}）
                </li>
              ))}
            </ul>
          )}

          <h3>前置依赖</h3>
          {selected.dependencyIds.length === 0 ? (
            <p className="meta">无前置依赖。</p>
          ) : (
            <ul className="criteria">
              {selected.dependencyIds.map((depId) => {
                const dep = tasks.find((t) => t.id === depId);
                return (
                  <li key={depId}>
                    {dep ? `${dep.title}（${TASK_STATUS_LABEL[dep.status]}）` : "前置任务不存在"}
                  </li>
                );
              })}
            </ul>
          )}
          {blockers.length > 0 && (
            <div className="notice notice-warn">阻塞原因：{blockers.join("；")}。在此之前无法开始或执行本任务。</div>
          )}

          <h3>验收条件</h3>
          <ul className="criteria">
            {selected.acceptanceCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {/* 状态相关的操作按钮 */}
          <div className="action-row">
            {canStart && (
              <button type="button" onClick={() => void runAction("start")}>
                开始任务
              </button>
            )}
            {canExecute && (
              <button type="button" onClick={() => void runAction("execute")}>
                {selected.status === "tests_failed" ? "重新执行" : "执行任务"}
              </button>
            )}
            {selected.status === "waiting_review" && (
              <button type="button" onClick={() => onNavigate("delivery")}>
                前往评审提交
              </button>
            )}
            {selected.status === "waiting_handover" && (
              <p className="meta">该任务等待交接，请在“变更与交接”页查看交接信息。</p>
            )}
            {selected.status === "reviewed" && <p className="meta">已通过评审，等待合并。</p>}
            {selected.status === "merged" && <p className="meta">任务已完成并合并。</p>}
            {otherRunning && <p className="meta">该任务正在执行中，请等待结果返回。</p>}
          </div>

          {busy === "execute" && (
            <div className="execution-steps">
              <p className="meta">执行中，等待主进程返回真实结果。执行步骤：</p>
              <ol>
                {EXECUTION_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* 右侧：执行证据 */}
        <section className="card evidence-panel">
          <h3>执行证据</h3>
          {!latestCode && !latestTest ? (
            <p className="muted-block">尚未执行该任务，执行后会在此显示修改文件、diff 和 pytest 日志。</p>
          ) : (
            <>
              {failedTest && (
                <div className="notice notice-error">
                  <strong>测试失败</strong>：{failureReason(failedTest)}。
                  <br />
                  下一步：查看下方日志定位问题，然后点击“重新执行”。
                </div>
              )}

              {latestCode && (
                <>
                  <p className="meta">
                    修改文件：{latestCode.filePath} ｜ Commit：
                    {failedTest ? "尚未提交" : latestCode.commit} ｜ 证据生成：{formatTime(latestCode.createdAt)}
                  </p>
                  <h4>统一 diff</h4>
                  <pre className="pre-block">{latestCode.diff}</pre>
                </>
              )}

              {latestTest && (
                <>
                  <h4>pytest 结果：{testLabel(latestTest)}</h4>
                  <p className="meta">
                    命令：<code>{latestTest.command}</code>
                  </p>
                  <p className="meta">
                    退出码：{latestTest.exitCode} ｜ 耗时：{(latestTest.durationMs / 1000).toFixed(2)} 秒 ｜ 时间：
                    {formatTime(latestTest.createdAt)}
                  </p>
                  <h4>标准输出</h4>
                  <pre className="pre-block">{latestTest.stdout || "（无）"}</pre>
                  <h4>错误输出</h4>
                  <pre className="pre-block">{latestTest.stderr || "（无）"}</pre>
                </>
              )}

              {tests.length > 1 && (
                <>
                  <h4>历史测试记录</h4>
                  <ul className="criteria">
                    {[...tests].reverse().map((test) => (
                      <li key={test.id}>
                        {formatTime(test.createdAt)} ｜ {testLabel(test)} ｜ 退出码 {test.exitCode}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function latestOf(snapshot: AppSnapshot, taskId: string): TestResult | undefined {
  const tests = taskScoped(snapshot.testResults, taskId);
  return tests[tests.length - 1];
}
