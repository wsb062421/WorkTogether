// src/renderer/pages/TasksPage.tsx
import type { AppSnapshot, MemberId } from "@shared/contracts";

interface Props {
  snapshot: AppSnapshot;
  memberId: MemberId;
}

export default function TasksPage({ snapshot }: Props) {
  return (
    <div className="card">
      <div className="section-title">
        <div>
          <p className="eyebrow">任务执行</p>
          <h2>任务列表与执行证据</h2>
        </div>
      </div>
      {snapshot.tasks.length === 0 ? (
        <p style={{ color: "#999" }}>暂无任务，请先生成计划。</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px" }}>
          <div>
            <h3>任务列表</h3>
            {snapshot.tasks.map((task) => (
              <div key={task.id} style={{ padding: "8px", borderBottom: "1px solid #eee" }}>
                <strong>{task.title}</strong>
                <p style={{ fontSize: "12px" }}>状态：{task.status}</p>
              </div>
            ))}
          </div>
          <div>
            <h3>执行证据</h3>
            {snapshot.codeLinks.length === 0 ? (
              <p style={{ color: "#999" }}>尚未执行任务</p>
            ) : (
              snapshot.codeLinks.map((link) => (
                <div key={link.id} style={{ marginBottom: "12px" }}>
                  <p>文件：{link.filePath} · Commit：{link.commit}</p>
                  <pre style={{ backgroundColor: "#f9fafb", padding: "8px", overflow: "auto", fontSize: "12px" }}>{link.diff}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
