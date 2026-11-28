import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DemoRepositoryService } from "../src/main/services/DemoRepositoryService";
import { DeepSeekPlanner } from "../src/main/services/planning/DeepSeekPlanner";
import { TeamAgentService } from "../src/main/services/TeamAgentService";
import { SqliteStateStore } from "../src/main/storage/SqliteStateStore";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("full demo flow persistence", () => {
  it("persists change, execution, handover, review and merge across restart", async () => {
    const directory = mkdtempSync(join(process.cwd(), ".tmp-day5-flow-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "state.sqlite");
    const repository = new DemoRepositoryService(
      join(directory, "workspace"),
      join(process.cwd(), "demo-template"),
      process.cwd()
    );
    const planner = new DeepSeekPlanner("", "https://example.invalid");
    const store = new SqliteStateStore(databasePath);
    const service = new TeamAgentService(
      store,
      repository,
      planner,
      () => undefined
    );

    await service.initialize();
    await service.generatePlan({ actorId: "member-a" });
    const initialTasks = service.getSnapshot("member-a").tasks;
    const inventoryTask = initialTasks.find(
      (task) => task.demoAction === "inventory_summary"
    )!;
    const discountTask = initialTasks.find(
      (task) => task.demoAction === "discount_rule"
    )!;

    await service.executeTask({
      actorId: "member-a",
      taskId: inventoryTask.id
    });
    await service.submitReview({
      actorId: "member-b",
      taskId: inventoryTask.id,
      decision: "approve",
      comment: "真实测试通过"
    });
    await service.mergeTask({
      actorId: "member-b",
      taskId: inventoryTask.id
    });

    const requirementId = inventoryTask.requirementIds[0];
    const impact = await service.changeRequirement({
      actorId: "member-a",
      requirementId,
      content: "相同商品按照商品编号与仓库位置分别汇总。",
      reason: "不同仓库需要独立核对库存。"
    });
    expect(impact.affectedTasks.length).toBeGreaterThan(0);
    await service.confirmRequirement({
      actorId: "member-b",
      requirementId
    });

    await service.executeTask({
      actorId: "member-b",
      taskId: discountTask.id
    });
    const handover = await service.interruptTask({
      actorId: "member-b",
      taskId: discountTask.id
    });
    await service.resumeTask({
      actorId: "member-a",
      taskId: discountTask.id,
      handoverId: handover.id
    });
    await service.executeTask({
      actorId: "member-a",
      taskId: discountTask.id
    });
    await service.submitReview({
      actorId: "member-b",
      taskId: discountTask.id,
      decision: "approve",
      comment: "接管后证据完整"
    });
    await service.mergeTask({
      actorId: "member-b",
      taskId: discountTask.id
    });

    store.close();

    const reopenedStore = new SqliteStateStore(databasePath);
    const reopenedService = new TeamAgentService(
      reopenedStore,
      repository,
      planner,
      () => undefined
    );
    try {
      const snapshot = reopenedService.getSnapshot("member-a");
      const restoredInventory = snapshot.tasks.find(
        (task) => task.id === inventoryTask.id
      );
      const restoredDiscount = snapshot.tasks.find(
        (task) => task.id === discountTask.id
      );

      expect(restoredInventory?.status).toBe("merged");
      expect(restoredDiscount?.status).toBe("merged");
      expect(restoredDiscount?.ownerId).toBe("member-a");
      expect(snapshot.handovers).toHaveLength(1);
      expect(snapshot.handovers[0].resumedAt).not.toBeNull();
      expect(snapshot.impacts).toHaveLength(1);
      expect(snapshot.codeLinks.length).toBeGreaterThanOrEqual(3);
      expect(snapshot.testResults.length).toBeGreaterThanOrEqual(3);
      expect(
        snapshot.events.map((event) => event.type)
      ).toEqual(
        expect.arrayContaining([
          "requirement_changed",
          "task_executed",
          "task_interrupted",
          "task_resumed",
          "task_reviewed",
          "task_merged"
        ])
      );
    } finally {
      reopenedStore.close();
    }
  }, 30_000);
});
