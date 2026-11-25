import {
  mkdtempSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStateStore } from "../src/main/storage/SqliteStateStore";

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = mkdtempSync(join(process.cwd(), ".tmp-storage-"));
  temporaryDirectories.push(directory);
  return join(directory, "state.sqlite");
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("SqliteStateStore", () => {
  it("creates the initial snapshot when the database is empty", () => {
    const store = new SqliteStateStore(temporaryDatabasePath());
    try {
      const snapshot = store.load();
      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.project.name).toBe("迷你库存协作开发");
      expect(snapshot.members).toHaveLength(2);
      expect(snapshot.events.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("persists state across database close and reopen", () => {
    const databasePath = temporaryDatabasePath();
    const first = new SqliteStateStore(databasePath);
    const snapshot = first.load();
    snapshot.project.planVersion = 7;
    snapshot.updatedAt = "2026-11-23T00:00:00.000Z";
    first.save(snapshot);
    first.close();

    const reopened = new SqliteStateStore(databasePath);
    try {
      const restored = reopened.load();
      expect(restored.project.planVersion).toBe(7);
      expect(restored.updatedAt).toBe("2026-11-23T00:00:00.000Z");
    } finally {
      reopened.close();
    }
  });

  it("resets business state to the fixed two-member demo", () => {
    const store = new SqliteStateStore(temporaryDatabasePath());
    try {
      const snapshot = store.load();
      snapshot.project.planVersion = 3;
      snapshot.requirements = [];
      store.save(snapshot);

      const reset = store.reset();
      expect(reset.project.planVersion).toBe(0);
      expect(reset.members.map((member) => member.id)).toEqual([
        "member-a",
        "member-b"
      ]);
      expect(reset.requirements).toHaveLength(3);
    } finally {
      store.close();
    }
  });
});
