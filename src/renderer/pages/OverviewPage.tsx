// src/renderer/pages/OverviewPage.tsx
import { useState } from "react";
import type { AppSnapshot, MemberId } from "@shared/contracts";
import { teamApi } from "../adapters";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
  onReset: () => Promise<void>;
  onNavigate: (page: "overview" | "requirements" | "tasks" | "impact" | "delivery") => void;
}

export default function OverviewPage({ snapshot, memberId, onReset, onNavigate }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const member = snapshot.members.find((m) => m.id === memberId);
  const confirmedReqs = snapshot.requirements.filter((r) => r.status === "confirmed").length;
  const totalTasks = snapshot.tasks.length;
  const runningTasks = snapshot.tasks.filter((t) => t.status === "running").length;
  const waitingReviewTasks = snapshot.tasks.filter((t) => t.status === "waiting_review").length;

  // 计算当前流程位置和下一步提示
  let flowLocation = "需求确认";
  let nextStepHint = "确认需求后生成开发计划";
  if (snapshot.plan) {
    flowLocation = "任务执行";
    nextStepHint = "选择任务开始执行";
    if (waitingReviewTasks > 0) {
      flowLocation = "待评审";
      nextStepHint = "查看测试证据并提交评审";
    }
    if (snapshot.tasks.every((t) => t.status === "merged")) {
      flowLocation = "已完成";
      nextStepHint = "所有任务已完成合并";
    }
  } else if (confirmedReqs > 0) {
    nextStepHint = "点击“生成计划”开始规划";
  }

  const nextPage: "requirements" | "tasks" | "impact" | "delivery" =
    waitingReviewTasks > 0 ? "delivery" : snapshot.plan ? "tasks" : "requirements";

  const latestTest = snapshot.testResults.length > 0
    ? snapshot.testResults[snapshot.testResults.length - 1]
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 1. 项目标题区 */}
      <section className="card highlight">
        <span className="label">项目信息</span>
        <h2>{snapshot.project.name}</h2>
        <p>{snapshot.project.repositoryName} · 计划版本：{snapshot.project.planVersion > 0 ? `v${snapshot.project.planVersion}` : "尚未生成"}</p>
      </section>

      {/* 2. 当前步骤与下一步操作区 */}
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">当前流程位置</p>
            <h2>{flowLocation}</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "14px", color: "#666" }}>下一步建议</p>
            <strong style={{ color: "#1d4ed8" }}>{nextStepHint}</strong>
            <div className="action-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={() => onNavigate(nextPage)}>前往对应页面</button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 项目和人员状态区 */}
      <section className="status-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
        <article className="card">
          <span className="label">当前成员</span>
          <strong>{member?.name}</strong>
          <p>{member?.role}</p>
        </article>
        <article className="card">
          <span className="label">已确认需求</span>
          <strong>{confirmedReqs} 条</strong>
          <p>共 {snapshot.requirements.length} 条需求</p>
        </article>
        <article className="card">
          <span className="label">任务统计</span>
          <strong>共 {totalTasks} 个任务</strong>
          <p>执行中 {runningTasks} · 待评审 {waitingReviewTasks}</p>
        </article>
        <article className="card">
          <span className="label">最近测试</span>
          <strong>
            {latestTest
              ? latestTest.passed
                ? "测试通过"
                : "测试失败"
              : "尚无测试"}
          </strong>
          <p>{latestTest ? `耗时 ${latestTest.durationMs}ms` : "等待任务执行"}</p>
        </article>
      </section>

      {/* 4. 演示重置（二次确认，重置中禁用） */}
      <section className="card">
        <div className="row-between">
          <div>
            <p className="eyebrow">演示控制</p>
            <p className="meta">重置会清空计划、任务、证据、交接和影响记录，并恢复演示仓库。</p>
          </div>
          {!confirmReset ? (
            <button type="button" className="button-danger" disabled={resetting} onClick={() => setConfirmReset(true)}>
              重置演示数据
            </button>
          ) : (
            <div className="action-row">
              <button
                type="button"
                className="button-danger"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  setResetError(null);
                  try {
                    await onReset();
                    setConfirmReset(false);
                  } catch (reason) {
                    setResetError(reason instanceof Error ? reason.message : String(reason));
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                {resetting ? "正在恢复演示数据…" : "确认重置"}
              </button>
              <button type="button" className="button-secondary" disabled={resetting} onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </div>
          )}
        </div>
        {resetError && (
          <div className="notice notice-error">
            重置失败：{resetError}。当前数据未被清空，请先结束正在执行的任务后再试。
          </div>
        )}
      </section>

      {/* 5. 最近活动时间线 */}
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">最近活动</p>
            <h2>操作时间线</h2>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() => void teamApi.openSecondMemberWindow()}
            style={{ padding: "6px 12px", backgroundColor: "#1d4ed8", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            打开另一成员窗口
          </button>
        </div>
        <div className="requirement-list">
          {snapshot.events.slice(0, 10).map((event) => (
            <article className="requirement" key={event.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", borderBottom: "1px solid #f3f4f6" }}>
              <div>
                <strong>{event.summary}</strong>
                <p style={{ fontSize: "12px", color: "#666", margin: "4px 0 0" }}>
                  {event.actorId === "member-a" ? "成员甲" : "成员乙"} · {new Date(event.createdAt).toLocaleTimeString()}
                </p>
              </div>
              <span style={{ fontSize: "12px", color: "#999" }}>{event.type}</span>
            </article>
          ))}
          {snapshot.events.length === 0 && <p style={{ color: "#999" }}>暂无操作记录</p>}
        </div>
      </section>
    </div>
  );
}
