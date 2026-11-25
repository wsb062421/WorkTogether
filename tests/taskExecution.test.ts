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
import { DemoRepositoryService } from "../src/main/services/DemoRepositoryService";
import { TeamAgentService } from "../src/main/services/TeamAgentService";
import { SqliteStateStore } from "../src/main/storage/SqliteStateStore";

const temporaryDirectories: string[] = [];

function createStore(): SqliteStateStore {
  const directory = mkdtempSync(join(process.cwd(), ".tmp-day3-task-"));
  temporaryDirectories.push(directory);
  return new SqliteStateStore(join(directory, "state.sqlite"));
}

function planDraft(): GeneratedPlanDraft {
  return {
    summary: "生成三个演示任务。",
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
    commit: "a".repeat(40),
    filePath: "app/inventory.py",
    command: "python -m pytest -q tests/test_inventory.py",
    exitCode: 0,
    passed: true,
    durationMs: 12,
    stdout: "1 passed",
    stderr: ""
  };
}

async function createService(
  repository: DemoRepositoryService
): Promise<{
  store: SqliteStateStore;
  service: TeamAgentService;
  task: PlanTask;
}> {
  const store = createStore();
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

describe("TeamAgentService task execution", () => {
  it("runs the complete A-side execution chain against the demo repository", async () => {
    const directory = mkdtempSync(
      join(process.cwd(), ".tmp-day3-integration-")
    );
    temporaryDirectories.push(directory);
    const store = new SqliteStateStore(join(directory, "state.sqlite"));
    const repository = new DemoRepositoryService(
      join(directory, "workspace"),
      join(process.cwd(), "demo-template"),
      process.cwd()
    );
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
      await service.initialize();
      await service.generatePlan({ actorId: "member-a" });
      const task = service.getSnapshot("member-a").tasks[0];
      const result = await service.executeTask({
        actorId: "member-b",
        taskId: task.id
      });
      const snapshot = service.getSnapshot("member-a");

      expect(result.testResult.passed).toBe(true);
      expect(result.testResult.stdout).toContain("1 passed");
      expect(result.codeLink.filePath).toBe("app/inventory.py");
      expect(result.codeLink.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(snapshot.tasks[0].status).toBe("waiting_review");
      expect(snapshot.testResults).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("stores code and test evidence and moves the task to review", async () => {
    const repository = {
      executeTask: vi.fn(async (_taskId: string, _action) => ({
        ...successfulExecution({} as PlanTask)
      }))
    } as unknown as DemoRepositoryService;
    const { store, service, task } = await createService(repository);

    try {
      const result = await service.executeTask({
        actorId: "member-b",
        taskId: task.id
      });
      const snapshot = service.getSnapshot("member-a");

      expect(result.testResult.passed).toBe(true);
      expect(snapshot.codeLinks).toHaveLength(1);
      expect(snapshot.testResults).toHaveLength(1);
      expect(snapshot.tasks[0].status).toBe("waiting_review");
      expect(
        snapshot.events.some(
          (event) =>
            event.type === "task_executed" &&
            event.summary.includes("pytest 通过")
        )
      ).toBe(true);
    } finally {
      store.close();
    }
  });

  it("rejects a duplicate execution while the same task is running", async () => {
    let finish!: (value: ReturnType<typeof successfulExecution>) => void;
    const pending = new Promise<ReturnType<typeof successfulExecution>>(
      (resolve) => {
        finish = resolve;
      }
    );
    const repository = {
      executeTask: vi.fn(() => pending)
    } as unknown as DemoRepositoryService;
    const { store, service, task } = await createService(repository);

    try {
      const first = service.executeTask({
        actorId: "member-b",
        taskId: task.id
      });
      await Promise.resolve();
      await expect(
        service.executeTask({
          actorId: "member-a",
          taskId: task.id
        })
      ).rejects.toThrow("正在执行");

      finish(successfulExecution(task));
      await expect(first).resolves.toMatchObject({
        testResult: { passed: true }
      });
    } finally {
      store.close();
    }
  });

  it("moves a repository exception to tests_failed and allows retry", async () => {
    const executeTask = vi
      .fn()
      .mockRejectedValueOnce(new Error("pytest 环境不可用"))
      .mockResolvedValueOnce(successfulExecution({} as PlanTask));
    const repository = {
      executeTask
    } as unknown as DemoRepositoryService;
    const { store, service, task } = await createService(repository);

    try {
      await expect(
        service.executeTask({
          actorId: "member-b",
          taskId: task.id
        })
      ).rejects.toThrow("pytest 环境不可用");
      expect(service.getSnapshot("member-a").tasks[0].status).toBe(
        "tests_failed"
      );

      const retried = await service.executeTask({
        actorId: "member-b",
        taskId: task.id
      });
      expect(retried.testResult.passed).toBe(true);
      expect(service.getSnapshot("member-a").tasks[0].status).toBe(
        "waiting_review"
      );
    } finally {
      store.close();
    }
  });
});
