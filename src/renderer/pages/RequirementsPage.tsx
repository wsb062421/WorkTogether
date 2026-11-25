// src/renderer/pages/RequirementsPage.tsx
import type { AppSnapshot, MemberId } from "@shared/contracts";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
}

export default function RequirementsPage({ snapshot, memberId }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">需求管理</p>
            <h2>需求列表</h2>
          </div>
          <button type="button" disabled style={{ padding: "6px 12px", opacity: 0.5 }}>新建需求（待实现）</button>
        </div>
        <div className="requirement-list">
          {snapshot.requirements.map((req) => (
            <article className="requirement" key={req.id} style={{ padding: "12px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{req.title}</strong>
                <span className={`pill ${req.status}`} style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "12px", backgroundColor: req.status === "confirmed" ? "#d1fae5" : "#fef3c7", color: req.status === "confirmed" ? "#065f46" : "#92400e" }}>
                  {req.status === "confirmed" ? "已确认" : req.status === "proposed" ? "待确认" : req.status === "rejected" ? "已否决" : "已修改"}
                </span>
              </div>
              <p style={{ margin: "8px 0", color: "#4b5563" }}>{req.content}</p>
              <p style={{ fontSize: "12px", color: "#9ca3af" }}>
                提出者：{req.authorId === "member-a" ? "成员甲" : "成员乙"} · 版本 v{req.version}
              </p>
            </article>
          ))}
          {snapshot.requirements.length === 0 && <p>当前还没有需求</p>}
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">计划管理</p>
            <h2>开发计划</h2>
          </div>
          <button type="button" disabled style={{ padding: "6px 12px", opacity: 0.5 }}>生成计划（待实现）</button>
        </div>
        {snapshot.plan ? (
          <div>
            <p>版本：v{snapshot.plan.version} · 来源：{snapshot.plan.sourceLabel}</p>
            <p>{snapshot.plan.summary}</p>
            <ul>
              {snapshot.tasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong> · 负责人：{task.ownerId === "member-a" ? "成员甲" : "成员乙"} · 状态：{task.status}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ color: "#999" }}>尚未生成计划，请先确认至少一条需求。</p>
        )}
      </section>
    </div>
  );
}
