import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GeneratedPlanDraft
} from "../src/main/services/planning/DeepSeekPlanner";
import type { Requirement } from "@shared/contracts";
import { TeamAgentService } from "../src/main/services/TeamAgentService";
import type { DeepSeekPlanner } from "../src/main/services/planning/DeepSeekPlanner";
import type { DemoRepositoryService } from "../src/main/services/DemoRepositoryService";
import { SqliteStateStore } from "../src/main/storage/SqliteStateStore";

const temporaryDirectories: string[] = [];

function createStore(): SqliteStateStore {
  const directory = mkdtempSync(join(process.cwd(), ".tmp-day2-"));
  temporaryDirectories.push(directory);
  return new SqliteStateStore(join(directory, "state.sqlite"));
}

function planDraft(): GeneratedPlanDraft {
  return {
    summary: "根据已确认需求生成三个相互关联的开发任务。",
    source: "deepseek",
    sourceLabel: "DeepSeek 实时生成（test）",
    tasks: [
      {
        demoAction: "inventory_summary",
        title: "实现库存汇总",
        description: "按商品编号汇总库存数量。",
        acceptanceCriteria: ["同商品数量相加", "pytest 通过"]
      },
      {
        demoAction: "discount_rule",
        title: "实现折扣计算",
        description: "达到门槛后计算折扣。",
        acceptanceCriteria: ["100 元订单应付 90 元"]
      },
      {
        demoAction: "stock_validation",
        title: "实现库存校验",
        description: "库存不足时拒绝下单。",
        acceptanceCriteria: ["库存不足返回错误"]
      }
    ]
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("TeamAgentService day 2", () => {
  it("creates, confirms and persists requirements while broadcasting changes", async () => {
    const store = createStore();
    const repository = {
      ensureWorkspace: vi.fn()
    } as unknown as DemoRepositoryService;
    const planner = {
      generate: vi.fn()
    } as unknown as DeepSeekPlanner;
    let broadcasts = 0;
    const service = new TeamAgentService(
      store,
      repository,
      planner,
      () => {
        broadcasts += 1;
      }
    );

    try {
      const created = await service.createRequirement({
        actorId: "member-a",
        title: "库存预警",
        content: "库存低于五个时显示预警。"
      });
      expect(created.status).toBe("proposed");

      const confirmed = await service.confirmRequirement({
        actorId: "member-b",
        requirementId: created.id
      });
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.confirmedBy).toBe("member-b");
      expect(broadcasts).toBe(2);
      expect(
        service
          .getSnapshot("member-a")
          .events.filter((event) =>
            event.objectId === created.id &&
            ["requirement_created", "requirement_confirmed"].includes(
                event.type
              )
          )
      ).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("passes only confirmed requirements to the planner and creates three dependent tasks", async () => {
    const store = createStore();
    const repository = {
      ensureWorkspace: vi.fn()
    } as unknown as DemoRepositoryService;
    const generate = vi.fn().mockResolvedValue(planDraft());
    const planner = { generate } as unknown as DeepSeekPlanner;
    let broadcasts = 0;
    const service = new TeamAgentService(
      store,
      repository,
      planner,
      () => {
        broadcasts += 1;
      }
    );

    try {
      const plan = await service.generatePlan({ actorId: "member-a" });
      const snapshot = service.getSnapshot("member-a");
      const confirmedIds = snapshot.requirements
        .filter((requirement) => requirement.status === "confirmed")
        .map((requirement) => requirement.id);

      expect(plan.version).toBe(1);
      expect(plan.source).toBe("deepseek");
      expect(snapshot.tasks).toHaveLength(3);
      expect(snapshot.project.planVersion).toBe(1);
      expect(snapshot.tasks[2].dependencyIds).toEqual([
        snapshot.tasks[0].id
      ]);
      expect(
        snapshot.tasks.flatMap((task) => task.requirementIds)
      ).toEqual(expect.not.arrayContaining(["req-stock"]));
      expect(generate).toHaveBeenCalledOnce();
      const passedRequirements = generate.mock.calls[0][0] as Requirement[];
      expect(passedRequirements.map((item) => item.id)).toEqual(
        confirmedIds
      );
      expect(broadcasts).toBe(1);
    } finally {
      store.close();
    }
  });

  it("rejects plan generation when all requirements are rejected", async () => {
    const store = createStore();
    const repository = {
      ensureWorkspace: vi.fn()
    } as unknown as DemoRepositoryService;
    const planner = {
      generate: vi.fn()
    } as unknown as DeepSeekPlanner;
    const service = new TeamAgentService(
      store,
      repository,
      planner,
      () => undefined
    );

    try {
      for (const requirement of service.getSnapshot("member-a")
        .requirements) {
        await service.rejectRequirement({
          actorId: "member-a",
          requirementId: requirement.id
        });
      }

      await expect(
        service.generatePlan({ actorId: "member-a" })
      ).rejects.toThrow("至少需要一条已确认需求");
      expect(planner.generate).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });

  it("records requirement changes and marks linked tasks for recheck", async () => {
    const store = createStore();
    const repository = {
      ensureWorkspace: vi.fn()
    } as unknown as DemoRepositoryService;
    const planner = {
      generate: vi.fn().mockResolvedValue(planDraft())
    } as unknown as DeepSeekPlanner;
    const service = new TeamAgentService(
      store,
      repository,
      planner,
      () => undefined
    );

    try {
      await service.generatePlan({ actorId: "member-a" });
      const snapshot = service.getSnapshot("member-a");
      const requirementId = snapshot.tasks[0].requirementIds[0];
      const report = await service.changeRequirement({
        actorId: "member-a",
        requirementId,
        content: "相同商品按商品编号和仓库位置分别汇总。",
        reason: "不同仓库需要独立统计。"
      });
      const changed = service.getSnapshot("member-a");

      expect(report.requirement.version).toBe(2);
      expect(report.affectedTasks.length).toBeGreaterThan(0);
      expect(
        changed.tasks
          .filter((task) =>
            task.requirementIds.includes(requirementId)
          )
          .some((task) => task.status === "needs_recheck")
      ).toBe(true);
      expect(changed.impacts).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});
