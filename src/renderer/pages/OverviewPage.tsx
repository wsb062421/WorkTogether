import type { AppSnapshot, MemberId } from "@shared/contracts";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
}

export default function OverviewPage({ snapshot, memberId }: Props) {
  const member = snapshot.members.find((item) => item.id === memberId);
  const confirmedReqs = snapshot.requirements.filter(r => r.status === "confirmed").length;
  const runningTasks = snapshot.tasks.filter(t => t.status === "running").length;
  const waitingReviewTasks = snapshot.tasks.filter(t => t.status === "waiting_review").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section className="status-grid">
        <article className="card highlight">
          <span className="label">当前成员</span>
          <strong>{member?.name}</strong>
          <p>{member?.role}</p>
        </article>
        <article className="card">
          <span className="label">项目名称</span>
          <strong>{snapshot.project.name}</strong>
          <p>{snapshot.project.repositoryName}</p>
        </article>
        <article className="card">
          <span className="label">计划版本</span>
          <strong>{snapshot.project.planVersion > 0 ? `v${snapshot.project.planVersion}` : "尚未生成"}</strong>
          <p>当前处于：需求确认阶段</p>
        </article>
        <article className="card">
          <span className="label">任务概览</span>
          <strong>执行中 {runningTasks} / 待评审 {waitingReviewTasks}</strong>
          <p>已确认需求 {confirmedReqs} 条</p>
        </article>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">最近活动</p>
            <h2>操作时间线</h2>
          </div>
          <button
            type="button"
            onClick={() => void (window as any).teamApi.openSecondMemberWindow()}
          >
            打开另一成员窗口
          </button>
        </div>
        <div className="requirement-list">
          {snapshot.events.slice(0, 5).map((event) => (
            <article className="requirement" key={event.id}>
              <div>
                <strong>{event.summary}</strong>
                <p style={{ fontSize: "12px", color: "#666" }}>
                  {event.actorId === "member-a" ? "成员甲" : "成员乙"} · {new Date(event.createdAt).toLocaleTimeString()}
                </p>
              </div>
            </article>
          ))}
          {snapshot.events.length === 0 && <p>暂无操作记录</p>}
        </div>
      </section>
    </div>
  );
}
