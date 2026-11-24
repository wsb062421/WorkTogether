// src/renderer/App.tsx
import { useEffect, useState } from "react";
import type { AppSnapshot, MemberId } from "@shared/contracts";
import { teamApi } from "./adapters";
import Layout, { type PageKey } from "./components/Layout";
import OverviewPage from "./pages/OverviewPage";
import RequirementsPage from "./pages/RequirementsPage";
import TasksPage from "./pages/TasksPage";
import ImpactPage from "./pages/ImpactPage";
import DeliveryPage from "./pages/DeliveryPage";

function currentMember(): MemberId {
  return new URLSearchParams(window.location.search).get("member") === "member-b"
    ? "member-b"
    : "member-a";
}

export default function App() {
  const [memberId] = useState<MemberId>(currentMember);
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await teamApi.getSnapshot(memberId);
        if (active) {
          setSnapshot(next);
          setError(null);
        }
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    };

    void load();
    const unsubscribe = teamApi.onStateChanged(() => {
      void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [memberId]);

  const handleReset = async () => {
    if (window.confirm("确定要重置演示数据吗？所有当前状态将丢失。")) {
      try {
        await teamApi.resetDemo();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    }
  };

  const renderPage = () => {
    if (!snapshot) return null;
    switch (activePage) {
      case "overview":
        return <OverviewPage snapshot={snapshot} memberId={memberId} />;
      case "requirements":
        return <RequirementsPage snapshot={snapshot} memberId={memberId} />;
      case "tasks":
        return <TasksPage snapshot={snapshot} memberId={memberId} />;
      case "impact":
        return <ImpactPage snapshot={snapshot} memberId={memberId} />;
      case "delivery":
        return <DeliveryPage snapshot={snapshot} memberId={memberId} />;
      default:
        return null;
    }
  };

  return (
    <Layout
      snapshot={snapshot}
      memberId={memberId}
      activePage={activePage}
      error={error}
      onNavigate={setActivePage}
      onReset={handleReset}
    >
      {snapshot ? renderPage() : (
        <section className="card loading-card">
          <div className="spinner" />
          <h2>正在读取本地共享状态</h2>
        </section>
      )}
    </Layout>
  );
}
