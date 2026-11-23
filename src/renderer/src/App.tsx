import { useEffect, useState } from "react";
import type {
  AppSnapshot,
  MemberId
} from "@shared/contracts";

function currentMember(): MemberId {
  return new URLSearchParams(window.location.search).get("member") ===
    "member-b"
    ? "member-b"
    : "member-a";
}

export default function App() {
  const [memberId] = useState<MemberId>(currentMember);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await window.teamApi.getSnapshot(memberId);
        if (active) {
          setSnapshot(next);
          setError(null);
        }
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : String(reason)
          );
        }
      }
    };

    void load();
    const unsubscribe = window.teamApi.onStateChanged(() => {
      void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [memberId]);

  const member = snapshot?.members.find((item) => item.id === memberId);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">WorkTogether</div>
        <p className="sidebar-note">协作智能体基础工程</p>
        <nav>
          <span className="nav-item active">工程状态</span>
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">共享接口与 IPC 验证</p>
            <h1>{snapshot?.project.name ?? "正在连接本地服务"}</h1>
          </div>
          <div className="member-chip">
            <span className="dot" />
            {member?.name ?? memberId}
          </div>
        </header>

        {error ? (
          <section className="card error-card">
            <h2>无法读取本地状态</h2>
            <p>{error}</p>
          </section>
        ) : snapshot ? (
          <>
            <section className="status-grid">
              <article className="card highlight">
                <span className="label">主进程连接</span>
                <strong>已建立</strong>
                <p>渲染层已通过 preload 获取真实本地状态。</p>
              </article>
              <article className="card">
                <span className="label">当前项目</span>
                <strong>{snapshot.project.name}</strong>
                <p>{snapshot.project.repositoryName}</p>
              </article>
              <article className="card">
                <span className="label">共享需求</span>
                <strong>{snapshot.requirements.length} 条</strong>
                <p>
                  已确认{" "}
                  {
                    snapshot.requirements.filter(
                      (item) => item.status === "confirmed"
                    ).length
                  }{" "}
                  条
                </p>
              </article>
              <article className="card">
                <span className="label">工程版本</span>
                <strong>v0.1 骨架</strong>
                <p>共享契约 v1.0 已接入。</p>
              </article>
            </section>

            <section className="card">
              <div className="section-title">
                <div>
                  <p className="eyebrow">基础能力</p>
                  <h2>首批共享状态</h2>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void window.teamApi.openSecondMemberWindow()
                  }
                >
                  打开另一成员窗口
                </button>
              </div>
              <div className="requirement-list">
                {snapshot.requirements.map((requirement) => (
                  <article
                    className="requirement"
                    key={requirement.id}
                  >
                    <div>
                      <strong>{requirement.title}</strong>
                      <p>{requirement.content}</p>
                    </div>
                    <span className={`pill ${requirement.status}`}>
                      {requirement.status === "confirmed"
                        ? "已确认"
                        : requirement.status === "proposed"
                          ? "待确认"
                          : requirement.status === "rejected"
                            ? "已否决"
                            : "已修改"}
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className="handoff-note">
              <strong>开发交接提示</strong>
              <p>
                B 可以在此渲染骨架基础上实现五个正式页面；页面统一的
                API 是 <code>window.teamApi</code>，业务类型位于{" "}
                <code>src/shared/contracts.ts</code>。
              </p>
            </section>
          </>
        ) : (
          <section className="card loading-card">
            <div className="spinner" />
            <h2>正在读取本地共享状态</h2>
          </section>
        )}
      </section>
    </main>
  );
}
