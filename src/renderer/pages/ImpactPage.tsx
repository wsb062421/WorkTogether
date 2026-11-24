// src/renderer/pages/ImpactPage.tsx
import type { AppSnapshot } from "@shared/contracts";

interface Props {
  snapshot: AppSnapshot;
  memberId: string;
}

export default function ImpactPage({ snapshot }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">变更影响</p>
            <h2>需求变更记录</h2>
          </div>
        </div>
        {snapshot.impacts.length === 0 ? (
          <p style={{ color: "#999" }}>尚无需求变更</p>
        ) : (
          snapshot.impacts.map((impact) => (
            <div key={impact.createdAt} style={{ padding: "12px", borderBottom: "1px solid #eee" }}>
              <strong>{impact.requirement.title}</strong>
              <p>{impact.summary}</p>
              <p style={{ fontSize: "12px", color: "#666" }}>影响任务：{impact.affectedTasks.map((t) => t.title).join(", ")}</p>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">中断交接</p>
            <h2>交接记录</h2>
          </div>
        </div>
        {snapshot.handovers.length === 0 ? (
          <p style={{ color: "#999" }}>当前没有等待交接的任务</p>
        ) : (
          snapshot.handovers.map((handover) => (
            <div key={handover.id} style={{ padding: "12px", borderBottom: "1px solid #eee" }}>
              <strong>任务：{handover.taskId}</strong>
              <p>原负责人：{handover.fromMemberId}</p>
              <p>已完成：{handover.completed.join(", ")}</p>
              <p>待办：{handover.pending.join(", ")}</p>
              <button type="button" disabled style={{ padding: "4px 8px", opacity: 0.5 }}>由当前成员接管（待实现）</button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
