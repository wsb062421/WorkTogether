// src/renderer/pages/DeliveryPage.tsx
import { useState } from "react";
import type {
  ActivityEvent,
  AppSnapshot,
  CodeLink,
  MemberId,
  PlanTask,
  Requirement,
  TaskStatus,
  TestResult
} from "@shared/contracts";
import { teamApi } from "../adapters";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
}

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  planned: "已计划",
  ready: "就绪",
  running: "执行中",
  tests_failed: "测试失败",
  waiting_review: "等待评审",
  needs_recheck: "需重新核对",
  waiting_handover: "等待交接",
  reviewed: "已评审，待合并",
  merged: "已合并"
};

const EVENT_LABEL: Record<ActivityEvent["type"], string> = {
  project_seeded: "项目初始化",
  requirement_created: "需求提出",
  requirement_confirmed: "需求确认",
  requirement_rejected: "需求否决",
  requirement_changed: "需求变更",
  plan_generated: "计划生成",
  task_started: "任务开始",
  task_executed: "任务执行",
  task_interrupted: "中断交接",
  task_resumed: "成员接管",
  task_reviewed: "评审",
  task_merged: "合并",
  demo_reset: "重置演示"
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

function latestOf<T extends { taskId: string; createdAt: string }>(items: T[], taskId: string): T | undefined {
  return items
    .filter((item) => item.taskId === taskId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .at(-1);
}

// 评审页面只关心这些状态的任务，其余任务在左侧只读显示
const REVIEW_STATUSES: TaskStatus[] = ["waiting_review", "needs_recheck", "reviewed"];

export default function DeliveryPage({ snapshot, memberId }: Props) {
  const tasks = snapshot.tasks;
  const reviewable = tasks.filter((t) => REVIEW_STATUSES.includes(t.status));
  const merged = tasks.filter((t) => t.status === "merged");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "return" | "merge" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  const selected: PlanTask | undefined =
    tasks.find((t) => t.id === selectedId) ?? reviewable[0] ?? tasks[0];

  const runReview = async (decision: "approve" | "return") => {
    if (!selected || busy) return;
    if (decision === "return" && returnReason.trim().length < 2) {
      setNotice({ kind: "warn", text: "退回修改必须填写原因（至少 2 个字）。" });
      return;
    }
    setBusy(decision);
    setNotice(null);
    try {
      await teamApi.submitReview({
        actorId: memberId,
        taskId: selected.id,
        decision,
        comment: decision === "return" ? returnReason.trim() : ""
      });
      setReturnReason("");
      setNotice({
        kind: "ok",
        text:
          decision === "approve"
            ? `已通过评审「${selected.title}」，现在可以批准合并。`
            : `已退回「${selected.title}」，任务进入需重新核对状态。`
      });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: `评审提交失败：${errorMessage(reason)}。任务状态和已有证据未被修改。`
      });
    } finally {
      setBusy(null);
    }
  };

  const runMerge = async () => {
    if (!selected || busy) return;
    setBusy("merge");
    setNotice(null);
    try {
      await teamApi.mergeTask({ actorId: memberId, taskId: selected.id });
      setNotice({ kind: "ok", text: `已合并「${selected.title}」。` });
    } catch (reason) {
      setNotice({
        kind: "error",
        text: `合并失败：${errorMessage(reason)}。任务仍保持已评审状态。`
      });
    } finally {
      setBusy(null);
    }
  };

  if (!selected) {
    return (
      <section className="card">
        <p className="eyebrow">评审与交付</p>
        <h2>还没有可以评审的任务</h2>
        <p className="muted-block">请先在“需求与计划”页生成计划，并在“任务执行”页完成任务和测试。</p>
      </section>
    );
  }

  const requirements: Requirement[] = snapshot.requirements.filter((r) =>
    selected.requirementIds.includes(r.id)
  );
  const staleRequirement = requirements.some((r) => r.status === "changed");
  const latestCode: CodeLink | undefined = latestOf(snapshot.codeLinks, selected.id);
  const latestTest: TestResult | undefined = latestOf(snapshot.testResults, selected.id);
  const isOwner = selected.ownerId === memberId;
  const canReview = (selected.status === "waiting_review" || selected.status === "needs_recheck") && !isOwner;
  const canApprove = canReview && selected.status === "waiting_review" && !!latestTest?.passed && !staleRequirement;
  const canReturn = canReview;
  const canMerge = selected.status === "reviewed" && !isOwner;

  return (
    <div className="delivery-page">
      <section className="card">
        <div className="row-between">
          <div>
            <p className="eyebrow">评审与交付</p>
            <h2>项目完成情况</h2>
          </div>
          <div className="meta">
            已评审 {tasks.filter((t) => t.status === "reviewed" || t.status === "merged").length} 个 ·
            已合并 {merged.length} 个 · 共 {tasks.length} 个任务
          </div>
        </div>
        {notice && <div className={`notice notice-${notice.kind}`}>{notice.text}</div>}
      </section>

      <div className="delivery-layout">
        {/* 左侧：任务选择 */}
        <section className="card">
          <h3>待处理任务</h3>
          {reviewable.length === 0 && <p className="meta">当前没有等待评审或合并的任务。</p>}
          {reviewable.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`task-item ${task.id === selected.id ? "task-item-active" : ""}`}
              onClick={() => {
                setSelectedId(task.id);
                setNotice(null);
              }}
            >
              <strong>{task.title}</strong>
              <span className={`status-badge task-status task-${task.status}`}>{TASK_STATUS_LABEL[task.status]}</span>
            </button>
          ))}

          <h3>已合并</h3>
          {merged.length === 0 ? (
            <p className="meta">尚无已合并任务。</p>
          ) : (
            <ul className="criteria">
              {merged.map((task) => {
                const link = latestOf(snapshot.codeLinks, task.id);
                const event = snapshot.events.find((e) => e.type === "task_merged" && e.objectId === task.id);
                return (
                  <li key={task.id}>
                    {task.title} · {memberName(event?.actorId ?? null)} · {formatTime(event?.createdAt ?? task.updatedAt)} ·
                    commit {link?.commit ?? "—"}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 中间：评审材料 */}
        <section className="card">
          <div className="row-between">
            <div>
              <p className="eyebrow">评审材料</p>
              <h2>{selected.title}</h2>
            </div>
            <span className={`status-badge task-status task-${selected.status}`}>{TASK_STATUS_LABEL[selected.status]}</span>
          </div>
          <p className="muted-block">{selected.description}</p>
          <p className="meta">
            负责人：{memberName(selected.ownerId)} ｜ 最近更新：{formatTime(selected.updatedAt)}
          </p>

          {staleRequirement && (
            <div className="notice notice-warn">
              关联需求已修改，本评审内容已过期。请先在任务页重新执行，再提交评审。
            </div>
          )}

          <h3>关联需求</h3>
          {requirements.length === 0 ? (
            <p className="meta">未关联需求。</p>
          ) : (
            <ul className="criteria">
              {requirements.map((r) => (
                <li key={r.id}>
                  {r.title}（版本 v{r.version}，{r.status === "confirmed" ? "已确认" : "需重新确认"}）
                </li>
              ))}
            </ul>
          )}

          <h3>验收条件</h3>
          <ul className="criteria">
            {selected.acceptanceCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h3>修改文件与 diff</h3>
          {latestCode ? (
            <>
              <p className="meta">文件：{latestCode.filePath} ｜ Commit：{latestCode.commit}</p>
              <pre className="pre-block">{latestCode.diff}</pre>
            </>
          ) : (
            <p className="notice notice-warn">证据不完整：没有代码修改记录。请回到任务执行页执行任务。</p>
          )}

          <h3>pytest 结果</h3>
          {latestTest ? (
            <>
              <p className="meta">
                <code>{latestTest.command}</code> ｜ 退出码 {latestTest.exitCode} ｜ 耗时 {(latestTest.durationMs / 1000).toFixed(2)} 秒 ｜{" "}
                {latestTest.passed ? "通过" : "失败"}
              </p>
              {!latestTest.passed && <p className="notice notice-error">测试失败，不能通过评审。请查看任务执行页的错误输出。</p>}
            </>
          ) : (
            <p className="notice notice-warn">证据不完整：尚无 pytest 结果。请回到任务执行页执行任务。</p>
          )}
        </section>

        {/* 右侧：评审操作 */}
        <section className="card">
          <h3>评审操作</h3>
          {isOwner && (
            <p className="meta">你是该任务的负责人，不能评审或合并自己的任务。请由另一成员评审。</p>
          )}

          {canReview && (
            <>
              <div className="action-row">
                <button type="button" disabled={!canApprove || busy !== null} onClick={() => void runReview("approve")}>
                  {busy === "approve" ? "提交中…" : "通过评审"}
                </button>
              </div>
              {!canApprove && (
                <p className="meta">
                  {staleRequirement
                    ? "需求已变更，需先重新执行任务。"
                    : !latestTest?.passed
                      ? "pytest 未通过，不能通过评审。"
                      : "当前任务不能直接通过评审。"}
                </p>
              )}

              <div className="field">
                <label htmlFor="return-reason">退回原因</label>
                <textarea
                  id="return-reason"
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="例如：diff 没有覆盖“按仓库位置分别汇总”"
                />
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!canReturn || busy !== null}
                  onClick={() => void runReview("return")}
                >
                  {busy === "return" ? "提交中…" : "退回修改"}
                </button>
              </div>
            </>
          )}

          {selected.status === "reviewed" && (
            <div className="action-row">
              <button type="button" disabled={!canMerge || busy !== null} onClick={() => void runMerge()}>
                {busy === "merge" ? "合并中…" : "批准合并"}
              </button>
              {!canMerge && <p className="meta">评审人与执行者不能是同一人。</p>}
            </div>
          )}

          {selected.status === "merged" && <p className="meta">该任务已完成合并。</p>}
          {selected.status === "waiting_handover" && (
            <p className="meta">任务正在等待交接，请先在“变更与交接”页完成接管。</p>
          )}

          <h3>评审历史</h3>
          <Timeline
            events={snapshot.events.filter(
              (e) => e.objectId === selected.id && ["task_reviewed", "task_merged"].includes(e.type)
            )}
            empty="该任务还没有评审记录。"
          />
        </section>
      </div>

      <section className="card">
        <h3>完整活动时间线</h3>
        <p className="meta">按时间倒序回放需求、计划、执行、变更、交接、评审和合并。</p>
        <Timeline events={snapshot.events} empty="暂无操作记录。" />
      </section>
    </div>
  );
}

function Timeline({ events, empty }: { events: ActivityEvent[]; empty: string }) {
  if (events.length === 0) return <p className="meta">{empty}</p>;
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.id} className="timeline-item">
          <span className="tag">{EVENT_LABEL[event.type]}</span>
          <span className="timeline-text">{event.summary}</span>
          <span className="meta">
            {memberName(event.actorId)} · {formatTime(event.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}
