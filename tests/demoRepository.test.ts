import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DemoRepositoryService } from "../src/main/services/DemoRepositoryService";
import { pythonExecutable } from "./helpers/python";

const temporaryDirectories: string[] = [];

function createWorkspace(): {
  workspace: string;
  service: DemoRepositoryService;
} {
  const workspace = mkdtempSync(join(process.cwd(), ".tmp-day3-repo-"));
  temporaryDirectories.push(workspace);
  return {
    workspace,
    service: new DemoRepositoryService(
      workspace,
      join(process.cwd(), "demo-template"),
      process.cwd()
    )
  };
}

function runTests(workspace: string, testFile: string) {
  return spawnSync(
    pythonExecutable(),
    ["-m", "pytest", "-q", testFile],
    {
      cwd: workspace,
      encoding: "utf8",
      windowsHide: true
    }
  );
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("DemoRepositoryService", () => {
  it("runs a real failing baseline, applies code, runs pytest and commits", async () => {
    const { workspace, service } = createWorkspace();
    await service.resetWorkspace();

    const baseline = runTests(workspace, "tests/test_inventory.py");
    expect(baseline.status).not.toBe(0);

    const result = await service.executeTask(
      "task-inventory",
      "inventory_summary"
    );

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.command).toContain("-m pytest");
    expect(result.diff).toContain("summary.get");
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(service.readFile("app/inventory.py")).toContain(
      'summary[sku] = summary.get(sku, 0) + item["quantity"]'
    );

    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: workspace,
      encoding: "utf8",
      windowsHide: true
    });
    expect(head.stdout.trim()).toBe(result.commit);
  });

  it("keeps failure evidence and allows a clean retry", async () => {
    const { workspace, service } = createWorkspace();
    await service.resetWorkspace();

    writeFileSync(
      join(workspace, "tests", "test_inventory.py"),
      `from app.inventory import summarize_inventory\n\n` +
        `def test_duplicate_sku_quantities_are_summed():\n` +
        `    items = [{"sku": "A-1", "quantity": 2}, {"sku": "A-1", "quantity": 3}]\n` +
        `    assert summarize_inventory(items) == {"A-1": 999}\n`,
      "utf8"
    );

    const failed = await service.executeTask(
      "task-inventory-failed",
      "inventory_summary"
    );
    expect(failed.passed).toBe(false);
    expect(failed.exitCode).not.toBe(0);
    expect(failed.commit).toBe("");
    expect(`${failed.stdout}\n${failed.stderr}`).toContain("failed");

    copyFileSync(
      join(process.cwd(), "demo-template", "tests", "test_inventory.py"),
      join(workspace, "tests", "test_inventory.py")
    );
    const retried = await service.executeTask(
      "task-inventory-retry",
      "inventory_summary"
    );
    expect(retried.passed).toBe(true);
    expect(retried.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
