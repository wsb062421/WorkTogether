import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSnapshot } from "@shared/contracts";
import { createSeedState } from "../seed";

interface StateRow {
  payload: string;
}

export class SqliteStateStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  load(): AppSnapshot {
    const row = this.database
      .prepare("SELECT payload FROM app_state WHERE id = 1")
      .get() as StateRow | undefined;

    if (!row) {
      const seed = createSeedState();
      this.save(seed);
      return seed;
    }

    return JSON.parse(row.payload) as AppSnapshot;
  }

  save(state: AppSnapshot): void {
    this.database
      .prepare(
        `INSERT INTO app_state (id, payload, updated_at)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           payload = excluded.payload,
           updated_at = excluded.updated_at`
      )
      .run(JSON.stringify(state), state.updatedAt);
  }

  reset(): AppSnapshot {
    const seed = createSeedState();
    this.save(seed);
    return seed;
  }

  close(): void {
    this.database.close();
  }
}
