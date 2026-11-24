// src/renderer/components/Layout.tsx
import type { AppSnapshot, MemberId } from "@shared/contracts";

export type PageKey = "overview" | "requirements" | "tasks" | "impact" | "delivery";

interface LayoutProps {
  snapshot: AppSnapshot | null;
  memberId: MemberId;
  activePage: PageKey;
  error: string | null;
  onNavigate: (page: PageKey) => void;
  onReset: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: "overview", label: "项目总览" },
  { key: "requirements", label: "需求与计划" },
  { key: "tasks", label: "任务执行" },
  { key: "impact", label: "变更与交接" },
  { key: "delivery", label: "评审与交付" },
];

export default function Layout({
  snapshot,
  memberId,
  activePage,
  error,
  onNavigate,
  onReset,
  children,
}: LayoutProps) {
  const member = snapshot?.members.find((item) => item.id === memberId);
  const otherMember = snapshot?.members.find((item) => item.id !== memberId);
  const planVersion = snapshot?.project.planVersion
    ? `v${snapshot.project.planVersion}`
    : "尚未生成";

  return (
    <main className="shell">
      {/* 左侧导航 */}
      <aside className="sidebar">
        <div className="brand">WorkTogether</div>
        <p className="sidebar-note">协作智能体演示系统</p>
        <nav>
          {NAV_ITEMS.map((item) => (
            <span
              key={item.key}
              className={`nav-item ${activePage === item.key ? "active" : ""}`}
              onClick={() => onNavigate(item.key)}
              style={{ cursor: "pointer", display: "block", padding: "10px 16px", margin: "4px 0", borderRadius: "4px" }}
            >
              {item.label}
            </span>
          ))}
        </nav>
        <div style={{ marginTop: "auto", paddingTop: "24px" }}>
          <button
            type="button"
            onClick={onReset}
            style={{ width: "100%", padding: "8px", color: "#b91c1c", border: "1px solid #fca5a5", backgroundColor: "#fef2f2", borderRadius: "4px", cursor: "pointer" }}
          >
            重置演示数据
          </button>
        </div>
      </aside>

      {/* 主内容区 */}
      <section className="content">
        {/* 顶部状态栏 */}
        <header className="topbar">
          <div>
            <p className="eyebrow">当前成员：{member?.name ?? memberId}</p>
            <h1>{snapshot?.project.name ?? "正在连接本地服务"}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="member-chip" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", backgroundColor: "#f3f4f6", borderRadius: "20px" }}>
              <span className="dot" style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: member?.status === "online" ? "#10b981" : "#ef4444" }} />
              <span>{member?.name}</span>
              <span style={{ fontSize: "12px", color: "#666" }}>({member?.role})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#666" }}>
              <span>计划：{planVersion}</span>
              <span>|</span>
              <span>
                另一成员：
                <span style={{ color: otherMember?.status === "online" ? "#10b981" : "#ef4444" }}>
                  {otherMember?.name}（{otherMember?.status === "online" ? "在线" : "中断"}）
                </span>
              </span>
            </div>
          </div>
        </header>

        {/* 全局错误提示 */}
        {error && (
          <section className="card error-card" style={{ backgroundColor: "#fef2f2", borderColor: "#fca5a5", marginBottom: "16px" }}>
            <h2>操作失败</h2>
            <p>{error}</p>
          </section>
        )}

        {/* 页面内容 */}
        <div style={{ marginTop: "24px" }}>{children}</div>
      </section>
    </main>
  );
}
