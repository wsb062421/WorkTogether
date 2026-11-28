// src/renderer/pages/ImpactPage.tsx
import { useState } from "react";
import type {
  AppSnapshot,
  Handover,
  ImpactReport,
  MemberId,
  PlanTask,
  Requirement,
  TaskStatus
} from "@shared/contracts";
import { teamApi } from "../adapters";
import type { PageKey } from "../components/Layout";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
  onNavigate: (page: PageKey) => void;
}

type View = "impact" | "handover";

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

function memberName(id: MemberId | null): string {
  if (id === "member-a") return "成员甲";
  if (id === "member-b") return "成员乙";
  return "尚未确定";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

// 影响报告里的需求是变更后的版本，前一版本为 version - 1
function previousVersion(req: Requirement): number {
  return Math.max(1, req.version - 1);
}

function latestEventActor(snapshot: AppSnapshot, requirementId: string): MemberId | null {
  const event = snapshot.events.find(
    (e) => e.type === "requirement_changed" && e.objectId === requirementId
  );
  return event ? event.actorId : null;
}

function taskTitle(snapshot: AppSnapshot, taskId: string): string {
  return snapshot.tasks.find((t) => t.id === taskId)?.title ?? "任务已不存在";
}

function latestTestFor(snapshot: AppSnapshot, taskId: string) {
  const tests = snapshot.testResults.filter((r) => r.taskId === taskId);
  return tests[tests.length - 1];
}

export default function ImpactPage({ snapshot, memberId, onNavigate }: Props) {
  const pendingHandovers = snapshot.handovers.filter((h) => {
    const task = snapshot.tasks.find((t) => t.id === h.taskId);
    return task?.status === "waiting_handover" && h.resumedAt === null;
  });

  const [view, setView] = useState<View>(() =>
    snapshot.impacts.length === 0 && pendingHandovers.length > 0 ? "handover" : "impact"
  );
  const [busyHandover, setBusyHandover] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const resume = async (handover: Handover) => {
    if (busyHandover) return;
    setBusyHandover(handover.id);
    setNotice(null);
    try {
      const task = await teamApi.resumeTask({
        actorId: memberId,
        taskId: handover.taskId,
        handoverId: handover.id
      });
      setNotice({
        kind: "ok",
        text: `已由${memberName(memberId)}接管「${task.title}」，任务负责人已更新，可以在任务执行页继续。`
      });
      onNavigate("tasks");
    } catch (reason) {
      setNotice({
        kind: "error",
        text: `接管失败：${errorMessage(reason)}。交接记录与任务状态未被修改，请刷新后重试。`
      });
    } finally {
      setBusyHandover(null);
    }
  };

  const impacts = [...snapshot.impacts].reverse();
  const handovers = [...snapshot.handovers].reverse();

  return (
    <div className="impact-page">
      <div className="action-row">
        <button
          type="button"
          className={view === "impact" ? "" : "button-secondary"}
          onClick={() => setView("impact")}
        >
          变更影响（{snapshot.impacts.length}）
        </button>
        <button
          type="button"
          className={view === "handover" ? "" : "button-secondary"}
          onClick={() => setView("handover")}
        >
          中断交接（{snapshot.handovers.length}）
        </button>
      </div>

      {view === "handover" && pendingHandovers.length > 0 && (
        <div className="notice notice-warn">
          有 {pendingHandovers.length} 项任务等待交接，请在下方确认后接管。
        </div>
      )}
      {notice && <div className={`notice notice-${notice.kind === "ok" ? "ok" : "error"}`}>{notice.text}</div>}

      {view === "impact" && (
        <section className="card">
          <div className="section-title">
            <div>
              <p className="eyebrow">变更影响</p>
              <h2>需求变更与受影响范围</h2>
            </div>
          </div>
          {impacts.length === 0 ? (
            <p className="muted-block">尚无需求变更。</p>
          ) : (
            impacts.map((impact: ImpactReport) => {
              const req = impact.requirement;
              const actor = latestEventActor(snapshot, req.id);
              return (
                <div key={`${req.id}-${impact.createdAt}`} className="requirement-card">
                  <div className="row-between">
                    <strong>{req.title}</strong>
                    <span className="status-badge status-changed">已修改，需重新核对</span>
                  </div>
                  <p className="meta">
                    版本：v{previousVersion(req)} → v{req.version} ｜ 提出修改：{memberName(actor)} ｜ 时间：
                    {formatTime(impact.createdAt)}
                  </p>
                  <p className="muted-block">修改后内容：{req.content}</p>
                  <div className="notice notice-info">影响摘要：{impact.summary}</div>

                  <h3>受影响任务</h3>
                  {impact.affectedTasks.length === 0 ? (
                    <p className="meta">没有已关联的任务。</p>
                  ) : (
                    <table className="task-table">
                      <thead>
                        <tr>
                          <th>任务</th>
                          <th>当前状态</th>
                          <th>负责人</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impact.affectedTasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.title}</td>
                            <td>{TASK_STATUS_LABEL[task.status]}</td>
                            <td>{memberName(task.ownerId)}</td>
                            <td>
                              {task.status === "merged" ? (
                                <span className="meta">已合并，不再核对</span>
                              ) : (
                                <button type="button" className="button-secondary" onClick={() => onNavigate("tasks")}>
                                  查看关联任务
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3>受影响文件</h3>
                  {impact.affectedFiles.length === 0 ? (
                    <p className="meta">没有已保存的代码文件。</p>
                  ) : (
                    <ul className="criteria">
                      {impact.affectedFiles.map((file) => (
                        <li key={file}>{file}</li>
                      ))}
                    </ul>
                  )}

                  <h3>受影响的历史测试</h3>
                  {impact.affectedTestIds.length === 0 ? (
                    <p className="meta">没有历史测试记录。</p>
                  ) : (
                    <ul className="criteria">
                      {impact.affectedTestIds.map((id) => {
                        const test = snapshot.testResults.find((r) => r.id === id);
                        if (!test) return <li key={id}>测试记录已不存在</li>;
                        return (
                          <li key={id}>
                            {taskTitle(snapshot, test.taskId)} ｜ {test.passed ? "测试通过" : "测试失败"} ｜ 退出码 {test.exitCode}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}

      {view === "handover" && (
        <section className="card">
          <div className="section-title">
            <div>
              <p className="eyebrow">中断交接</p>
              <h2>交接记录</h2>
            </div>
          </div>
          {handovers.length === 0 ? (
            <p className="muted-block">当前没有等待交接的任务。</p>
          ) : (
            handovers.map((handover) => {
              const task = snapshot.tasks.find((t) => t.id === handover.taskId);
              const waiting = task?.status === "waiting_handover" && handover.resumedAt === null;
              const isOriginalOwner = handover.fromMemberId === memberId;
              const canResume = waiting && handover.toMemberId === memberId && memberId !== handover.fromMemberId;
              const test = latestTestFor(snapshot, handover.taskId);
              const reqs = task
                ? snapshot.requirements.filter((r) => task.requirementIds.includes(r.id))
                : [];
              return (
                <div key={handover.id} className="requirement-card">
                  <div className="row-between">
                    <strong>{taskTitle(snapshot, handover.taskId)}</strong>
                    <span className={`status-badge task-status task-${task?.status ?? "planned"}`}>
                      {task ? TASK_STATUS_LABEL[task.status] : "任务不存在"}
                    </span>
                  </div>
                  <p className="meta">
                    原负责人：{memberName(handover.fromMemberId)} ｜ 待接管成员：{memberName(handover.toMemberId)} ｜ 交接时间：
                    {formatTime(handover.createdAt)}
                  </p>
                  {handover.resumedAt && (
                    <p className="meta">已由 {memberName(handover.toMemberId)} 接管，接管时间：{formatTime(handover.resumedAt)}</p>
                  )}

                  <h3>原负责人已完成</h3>
                  <ul className="criteria">
                    {handover.completed.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  <h3>仍需完成</h3>
                  <ul className="criteria">
                    {handover.pending.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  <h3>关联需求</h3>
                  {reqs.length === 0 ? (
                    <p className="meta">无关联需求。</p>
                  ) : (
                    <ul className="criteria">
                      {reqs.map((r) => (
                        <li key={r.id}>
                          {r.title}（版本 v{r.version}，{r.status === "confirmed" ? "已确认" : "需重新确认"}）
                        </li>
                      ))}
                    </ul>
                  )}

                  <h3>代码与测试证据</h3>
                  <ul className="criteria">
                    {handover.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="meta">
                    最近一次测试：{test ? (test.passed ? "通过" : "失败") : "尚未执行"}
                  </p>

                  {waiting && (
                    <div className="action-row">
                      <button
                        type="button"
                        disabled={!canResume || busyHandover !== null}
                        onClick={() => void resume(handover)}
                      >
                        {busyHandover === handover.id ? "接管中…" : "由当前成员接管"}
                      </button>
                      {!canResume && (
                        <span className="meta">
                          {isOriginalOwner
                            ? "原负责人不能接管自己交出的任务。"
                            : `请由${memberName(handover.toMemberId)}在其窗口中接管。`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
