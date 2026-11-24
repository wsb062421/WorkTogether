// src/renderer/pages/DeliveryPage.tsx
import type { AppSnapshot } from "@shared/contracts";

interface Props {
  snapshot: AppSnapshot;
  memberId: string;
}

export default function DeliveryPage({ snapshot }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">评审管理</p>
            <h2>待评审任务</h2>
          </div>
        </div>
        {snapshot.tasks.filter((t) => t.status === "waiting_review").length === 0 ? (
          <p style={{ color: "#999" }}>当前没有待评审的任务</p>
        ) : (
          snapshot.tasks
            .filter((t) => t.status === "waiting_review")
            .map((task) => (
              <div key={task.id} style={{ padding: "12px", borderBottom: "1px solid #eee" }}>
                <strong>{task.title}</strong>
                <p>状态：{task.status}</p>
                <button type="button" disabled style={{ padding: "4px 8px", opacity: 0.5 }}>通过评审（待实现）</button>
              </div>
            ))
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <p className="eyebrow">交付状态</p>
            <h2>已合并任务</h2>
          </div>
        </div>
        {snapshot.tasks.filter((t) => t.status === "merged").length === 0 ? (
          <p style={{ color: "#999" }}>尚无已合并任务</p>
        ) : (
          snapshot.tasks
            .filter((t) => t.status === "merged")
            .map((task) => (
              <div key={task.id} style={{ padding: "12px", borderBottom: "1px solid #eee" }}>
                <strong>{task.title}</strong>
                <p>负责人：{task.ownerId}</p>
              </div>
            ))
        )}
      </section>
    </div>
  );
}
