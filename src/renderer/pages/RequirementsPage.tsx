// src/renderer/pages/RequirementsPage.tsx
import { useState } from "react";
import type {
  AppSnapshot,
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

const TITLE_MIN = 2;
const TITLE_MAX = 80;
const CONTENT_MIN = 4;
const CONTENT_MAX = 1200;
const REASON_MIN = 2;
const REASON_MAX = 400;

const STATUS_LABEL: Record<Requirement["status"], string> = {
  proposed: "待确认",
  confirmed: "已确认",
  rejected: "已否决",
  changed: "已修改，需重新核对"
};

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
  return "尚未确认";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function RequirementsPage({ snapshot, memberId, onNavigate }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [changeContent, setChangeContent] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [changeTitle, setChangeTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const confirmedCount = snapshot.requirements.filter((r) => r.status === "confirmed").length;
  const canGenerate = confirmedCount > 0 && !busy;
  const hasExecution = snapshot.codeLinks.length > 0 || snapshot.testResults.length > 0;

  const createTitleLength = createTitle.trim().length;
  const createContentLength = createContent.trim().length;
  const createValid =
    createTitleLength >= TITLE_MIN && createTitleLength <= TITLE_MAX &&
    createContentLength >= CONTENT_MIN && createContentLength <= CONTENT_MAX;

  const changeContentLength = changeContent.trim().length;
  const reasonLength = changeReason.trim().length;
  const changeValid =
    changeContentLength >= CONTENT_MIN && changeContentLength <= CONTENT_MAX &&
    reasonLength >= REASON_MIN && reasonLength <= REASON_MAX;

  const linkedTaskCount = (requirementId: string): number =>
    snapshot.tasks.filter((task) => task.requirementIds.includes(requirementId)).length;

  const taskTitle = (taskId: string): string =>
    snapshot.tasks.find((task) => task.id === taskId)?.title ?? taskId;

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    setPageError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      setNotice(successText);
    } catch (reason) {
      setPageError(`${errorMessage(reason)}。当前需求状态未改变，请重试。`);
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setCreateTitle("");
    setCreateContent("");
    setFormError(null);
    setShowCreate(true);
  };

  const submitCreate = async () => {
    if (!createValid) {
      setFormError("请检查标题和正文长度后再提交。");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const created = await teamApi.createRequirement({
        actorId: memberId,
        title: createTitle.trim(),
        content: createContent.trim()
      });
      setShowCreate(false);
      setHighlightId(created.id);
      setNotice(`已新增需求“${created.title}”，等待另一成员确认。`);
    } catch (reason) {
      // 失败时保留用户输入，不关闭表单
      setFormError(`提交失败：${errorMessage(reason)}。输入内容已保留。`);
    } finally {
      setBusy(false);
    }
  };

  const openChange = (requirement: Requirement) => {
    setEditing(requirement);
    setChangeTitle(requirement.title);
    setChangeContent(requirement.content);
    setChangeReason("");
    setFormError(null);
  };

  const submitChange = async () => {
    if (!editing) return;
    if (!changeValid) {
      setFormError("请填写新正文（4 至 1200 字）和变更原因（2 至 400 字）。");
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const report = await teamApi.changeRequirement({
        actorId: memberId,
        requirementId: editing.id,
        title: changeTitle.trim() || undefined,
        content: changeContent.trim(),
        reason: changeReason.trim()
      });
      setEditing(null);
      setImpact(report);
      setNotice(`需求“${report.requirement.title}”已修改为 v${report.requirement.version}。`);
    } catch (reason) {
      setFormError(`修改失败：${errorMessage(reason)}。输入内容已保留。`);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (requirement: Requirement) => {
    return window.confirm(`确定否决需求“${requirement.title}”吗？否决后它不会进入新计划。`);
  };

  const handleGenerate = async () => {
    if (hasExecution && !window.confirm(
      "已有执行记录。重新生成计划会替换当前计划、任务、代码记录和测试记录，需求历史保留。是否继续？"
    )) {
      return;
    }
    await runAction(
      () => teamApi.generatePlan({ actorId: memberId }),
      "计划已生成。"
    );
  };

  const plan = snapshot.plan;
  const isFallback = plan?.source === "fallback";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 全局反馈区 */}
      {pageError && <div className="notice notice-error" role="alert">{pageError}</div>}
      {notice && <div className="notice notice-ok">{notice}</div>}

      {impact && (
        <div className="notice notice-warn">
          <strong>影响摘要：</strong>{impact.summary}
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={() => onNavigate("impact")}>查看变更影响</button>
          </div>
        </div>
      )}

      {/* 需求区 */}
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">需求管理</p>
            <h2>需求列表</h2>
          </div>
          <button type="button" onClick={openCreate} disabled={busy}>新建需求</button>
        </div>

        {snapshot.requirements.length === 0 ? (
          <div>
            <p>当前还没有需求</p>
            <button type="button" onClick={openCreate}>新建第一条需求</button>
          </div>
        ) : (
          <div className="requirement-list">
            {snapshot.requirements.map((req) => {
              const isHighlight = highlightId === req.id;
              return (
                <article
                  key={req.id}
                  className={`requirement-card ${isHighlight ? "highlight-row" : ""}`}
                >
                  <div className="row-between">
                    <strong>{req.title}</strong>
                    <span className={`status-badge status-${req.status}`}>
                      {STATUS_LABEL[req.status]}
                    </span>
                  </div>
                  <p className="muted-block">{req.content}</p>
                  <p className="meta">
                    提出者：{memberName(req.authorId)} · 提出于 {formatTime(req.createdAt)} ·
                    确认人：{memberName(req.confirmedBy)} · 版本 v{req.version} ·
                    关联任务 {linkedTaskCount(req.id)} 个
                  </p>
                  <div className="action-row">
                    {(req.status === "proposed" || req.status === "changed") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(
                          () => teamApi.confirmRequirement({ actorId: memberId, requirementId: req.id }),
                          `已确认需求“${req.title}”。`
                        )}
                      >
                        确认
                      </button>
                    )}
                    {(req.status === "proposed" || req.status === "changed") && (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => {
                          if (confirmDelete(req)) {
                            void runAction(
                              () => teamApi.rejectRequirement({ actorId: memberId, requirementId: req.id }),
                              `已否决需求“${req.title}”。`
                            );
                          }
                        }}
                      >
                        否决
                      </button>
                    )}
                    {req.status !== "rejected" && (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => openChange(req)}
                      >
                        修改
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 计划区 */}
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">计划管理</p>
            <h2>开发计划</h2>
          </div>
          <div>
            <button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate}>
              {busy && !showCreate && !editing ? "生成中…" : "生成计划"}
            </button>
            {!canGenerate && !busy && (
              <p className="meta">没有已确认需求，请先确认至少一条需求后再生成计划。</p>
            )}
          </div>
        </div>

        {busy && !showCreate && !editing && (
          <p className="notice notice-info">智能体正在整理已确认需求并生成任务，请稍候…</p>
        )}

        {plan ? (
          <div>
            {isFallback ? (
              <p className="notice notice-warn">
                <strong>离线备用计划</strong>：模型未能实时生成，以下内容为演示用备用结果，不是实时模型输出。
              </p>
            ) : (
              <p className="notice notice-ok">DeepSeek 实时生成</p>
            )}
            <p className="meta">
              版本 v{plan.version} · 来源：{plan.sourceLabel} · 创建人：{memberName(plan.createdBy)} ·
              确认人：{memberName(plan.confirmedBy)} · 创建于 {formatTime(plan.createdAt)}
            </p>
            <p>{plan.summary}</p>
            <p className="meta">未确认的需求不会进入正式计划；已否决需求已排除。</p>

            <table className="task-table">
              <thead>
                <tr>
                  <th>任务</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>依赖</th>
                  <th>验收条件</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.tasks.map((task: PlanTask) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      <div className="meta">{task.description}</div>
                    </td>
                    <td>{memberName(task.ownerId)}</td>
                    <td>{TASK_STATUS_LABEL[task.status]}</td>
                    <td>
                      {task.dependencyIds.length === 0
                        ? "无"
                        : task.dependencyIds.map((id) => taskTitle(id)).join("、")}
                    </td>
                    <td>
                      <ul className="criteria">
                        {task.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-block">尚未生成计划。</p>
        )}
      </section>

      {/* 新建需求弹窗 */}
      {showCreate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="新建需求">
          <div className="modal">
            <h2>新建需求</h2>
            <label className="field">
              <span>需求标题（2 至 80 字）</span>
              <input
                value={createTitle}
                onChange={(event) => setCreateTitle(event.target.value)}
                maxLength={200}
              />
              <small className={createTitleLength > TITLE_MAX ? "error-text" : "meta"}>
                {createTitleLength} / {TITLE_MAX}
              </small>
            </label>
            <label className="field">
              <span>需求内容（4 至 1200 字）</span>
              <textarea
                rows={6}
                value={createContent}
                onChange={(event) => setCreateContent(event.target.value)}
                maxLength={1500}
              />
              <small className={createContentLength > CONTENT_MAX ? "error-text" : "meta"}>
                {createContentLength} / {CONTENT_MAX}
              </small>
            </label>
            {formError && <p className="notice notice-error">{formError}</p>}
            <div className="action-row">
              <button type="button" onClick={() => void submitCreate()} disabled={busy}>
                {busy ? "提交中…" : "提交"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setShowCreate(false)} disabled={busy}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 修改需求弹窗 */}
      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="修改需求">
          <div className="modal">
            <h2>修改需求：{editing.title}</h2>
            <p className="meta">当前版本 v{editing.version}</p>
            <div className="muted-block">原正文：{editing.content}</div>
            <label className="field">
              <span>新正文（4 至 1200 字）</span>
              <textarea rows={5} value={changeContent} onChange={(event) => setChangeContent(event.target.value)} />
              <small className={changeContentLength > CONTENT_MAX ? "error-text" : "meta"}>
                {changeContentLength} / {CONTENT_MAX}
              </small>
            </label>
            <label className="field">
              <span>变更原因（必填，2 至 400 字）</span>
              <textarea rows={3} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
              <small className="meta">{reasonLength} / {REASON_MAX}</small>
            </label>
            <p className="notice notice-warn">
              提交后需求需要重新确认，相关任务将进入“需重新核对”状态。
            </p>
            {formError && <p className="notice notice-error">{formError}</p>}
            <div className="action-row">
              <button type="button" onClick={() => void submitChange()} disabled={busy || !changeValid}>
                {busy ? "提交中…" : "确认修改"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setEditing(null)} disabled={busy}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
