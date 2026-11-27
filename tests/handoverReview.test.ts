import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanTask } from "@shared/contracts";
import type {
  GeneratedPlanDraft
} from "../src/main/services/planning/DeepSeekPlanner";
import type { DeepSeekPlanner } from "../src/main/services/planning/DeepSeekPlanner";
import type { DemoRepositoryService } from "../src/main/services/DemoRepositoryService";
import { TeamAgentService } from "../src/main/services/TeamAgentService";
import { SqliteStateStore } from "../src/main/storage/SqliteStateStore";

const temporaryDirectories: string[] = [];

function planDraft(): GeneratedPlanDraft {
  return {
    summary: "生成交接与评审测试任务。",
    source: "fallback",
    sourceLabel: "离线备用计划",
    tasks: [
      {
        demoAction: "inventory_summary",
        title: "库存汇总",
        description: "汇总库存。",
        acceptanceCriteria: ["pytest 通过"]
      },
      {
        demoAction: "discount_rule",
        title: "折扣规则",
        description: "计算折扣。",
        acceptanceCriteria: ["pytest 通过"]
      },
      {
        demoAction: "stock_validation",
        title: "库存校验",
        description: "校验库存。",
        acceptanceCriteria: ["pytest 通过"]
      }
    ]
  };
}

function successfulExecution(task: PlanTask) {
  return {
    diff: "+ fixed",
    commit: "b".repeat(40),
    filePath: "app/inventory.py",
    command: "python -m pytest -q tests/test_inventory.py",
    exitCode: 0,
    passed: true,
    durationMs: 10,
    stdout: "1 passed",
    stderr: ""
  };
}

async function createFixture() {
  const directory = mkdtempSync(join(process.cwd(), ".tmp-day4-"));
  temporaryDirectories.push(directory);
  const store = new SqliteStateStore(join(directory, "state.sqlite"));
  const repository = {
    executeTask: vi.fn(async (_taskId: string, _action) =>
      successfulExecution({} as PlanTask)
    ),
    resetWorkspace: vi.fn(async () => undefined)
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
  await service.generatePlan({ actorId: "member-a" });
  return {
    store,
    repository,
    service,
    task: service.getSnapshot("member-a").tasks[0]
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

describe("day 4 handover and review", () => {
  it("completes interrupt, explicit handover, execution, review and merge", async () => {
    const { store, service, task } = await createFixture();

    try {
      await service.startTask({
        actorId: "member-a",
        taskId: task.id
      });
      await expect(
        service.interruptTask({
          actorId: "member-b",
          taskId: task.id
        })
      ).rejects.toThrow("只有当前负责人成员甲");

      const handover = await service.interruptTask({
        actorId: "member-a",
        taskId: task.id
      });
      expect(handover.fromMemberId).toBe("member-a");
      expect(handover.toMemberId).toBe("member-b");
      expect(service.getSnapshot("member-a").tasks[0].status).toBe(
        "waiting_handover"
      );

      await expect(
        service.resumeTask({
          actorId: "member-a",
          taskId: task.id,
          handoverId: handover.id
        })
      ).rejects.toThrow("原负责人不能接管");

      const otherTask = service.getSnapshot("member-a").tasks[1];
      await expect(
        service.resumeTask({
          actorId: "member-b",
          taskId: otherTask.id,
          handoverId: handover.id
        })
      ).rejects.toThrow("交接记录与当前任务不匹配");

      const resumed = await service.resumeTask({
        actorId: "member-b",
        taskId: task.id,
        handoverId: handover.id
      });
      expect(resumed.ownerId).toBe("member-b");
      expect(resumed.status).toBe("ready");

      const execution = await service.executeTask({
        actorId: "member-b",
        taskId: task.id
      });
      expect(execution.task.status).toBe("waiting_review");

      await expect(
        service.submitReview({
          actorId: "member-b",
          taskId: task.id,
          decision: "approve",
          comment: ""
        })
      ).rejects.toThrow("执行者不能评审自己的任务");

      const reviewed = await service.submitReview({
        actorId: "member-a",
        taskId: task.id,
        decision: "approve",
        comment: "证据完整"
      });
      expect(reviewed.status).toBe("reviewed");

      await expect(
        service.mergeTask({
          actorId: "member-b",
          taskId: task.id
        })
      ).rejects.toThrow("执行者不能合并自己的任务");

      const merged = await service.mergeTask({
        actorId: "member-a",
        taskId: task.id
      });
      expect(merged.status).toBe("merged");

      const snapshot = service.getSnapshot("member-a");
      expect(snapshot.handovers).toHaveLength(1);
      expect(snapshot.handovers[0].resumedAt).not.toBeNull();
      expect(
        snapshot.events.map((event) => event.type)
      ).toEqual(
        expect.arrayContaining([
          "task_interrupted",
          "task_resumed",
          "task_reviewed",
          "task_merged"
        ])
      );
    } finally {
      store.close();
    }
  });

  it("requires test and confirmed requirements before approving", async () => {
    const { store, service, task } = await createFixture();

    try {
      await service.startTask({
        actorId: "member-a",
        taskId: task.id
      });
      await expect(
        service.submitReview({
          actorId: "member-b",
          taskId: task.id,
          decision: "approve",
          comment: ""
        })
      ).rejects.toThrow("不在可评审状态");

      await service.executeTask({
        actorId: "member-a",
        taskId: task.id
      });
      const requirementId = task.requirementIds[0];
      await service.changeRequirement({
        actorId: "member-b",
        requirementId,
        content: "相同商品按照仓库位置分别汇总。",
        reason: "仓库位置影响库存统计。"
      });

      await expect(
        service.submitReview({
          actorId: "member-b",
          taskId: task.id,
          decision: "approve",
          comment: ""
        })
      ).rejects.toThrow("需要先重新执行");

      await service.executeTask({
        actorId: "member-a",
        taskId: task.id
      });
      await expect(
        service.submitReview({
          actorId: "member-b",
          taskId: task.id,
          decision: "approve",
          comment: ""
        })
      ).rejects.toThrow("关联需求未处于已确认状态");
    } finally {
      store.close();
    }
  });

  it("resets all day 4 state and the demo repository", async () => {
    const { store, repository, service, task } = await createFixture();

    try {
      await service.executeTask({
        actorId: "member-a",
        taskId: task.id
      });
      await service.interruptTask({
        actorId: "member-a",
        taskId: task.id
      });
      expect(service.getSnapshot("member-a").tasks.length).toBe(3);

      await service.resetDemo();
      const snapshot = service.getSnapshot("member-a");
      expect(snapshot.plan).toBeNull();
      expect(snapshot.tasks).toHaveLength(0);
      expect(snapshot.codeLinks).toHaveLength(0);
      expect(snapshot.testResults).toHaveLength(0);
      expect(snapshot.handovers).toHaveLength(0);
      expect(repository.resetWorkspace).toHaveBeenCalledOnce();
    } finally {
      store.close();
    }
  });
});
