// src/renderer/src/App.tsx
import { useCallback, useEffect, useState } from "react";
import type { AppSnapshot, MemberId } from "@shared/contracts";
import { teamApi } from "../adapters";
import Layout, { type PageKey } from "../components/Layout";
import OverviewPage from "../pages/OverviewPage";
import RequirementsPage from "../pages/RequirementsPage";
import TasksPage from "../pages/TasksPage";
import ImpactPage from "../pages/ImpactPage";
import DeliveryPage from "../pages/DeliveryPage";

function currentMember(): MemberId {
  return new URLSearchParams(window.location.search).get("member") === "member-b"
    ? "member-b"
    : "member-a";
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export default function App() {
  const [memberId] = useState<MemberId>(currentMember);
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await teamApi.getSnapshot(memberId);
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [memberId]);

  useEffect(() => {
    void load();
    return teamApi.onStateChanged(() => {
      void load();
    });
  }, [load]);

  const handleReset = async () => {
    if (window.confirm("确定要重置演示数据吗？所有当前状态将丢失。")) {
      try {
        await teamApi.resetDemo();
      } catch (reason) {
        setError(errorMessage(reason));
      }
    }
  };

  const renderPage = () => {
    if (!snapshot) return null;
    switch (activePage) {
      case "overview":
        return <OverviewPage snapshot={snapshot} memberId={memberId} />;
      case "requirements":
        return <RequirementsPage snapshot={snapshot} memberId={memberId} onNavigate={setActivePage} />;
      case "tasks":
        return <TasksPage snapshot={snapshot} memberId={memberId} onNavigate={setActivePage} />;
      case "impact":
        return <ImpactPage snapshot={snapshot} memberId={memberId} />;
      case "delivery":
        return <DeliveryPage snapshot={snapshot} memberId={memberId} />;
      default:
        return null;
    }
  };

  // 首次加载失败时不能一直显示“加载中”：给出原因、当前状态和重新加载入口
  const renderFallback = () => {
    if (error) {
      return (
        <section className="card error-card">
          <h2>无法读取项目数据</h2>
          <p>{error}</p>
          <p>当前没有可显示的项目快照，页面内容未被修改。请重新加载；若仍失败，请重启应用。</p>
          <button type="button" onClick={() => void load()}>
            重新加载
          </button>
        </section>
      );
    }
    return (
      <section className="card loading-card">
        <div className="spinner" />
        <h2>正在读取项目数据</h2>
      </section>
    );
  };

  return (
    <Layout
      snapshot={snapshot}
      memberId={memberId}
      activePage={activePage}
      error={snapshot ? error : null}
      onNavigate={setActivePage}
      onReset={handleReset}
    >
      {snapshot ? renderPage() : renderFallback()}
    </Layout>
  );
}
