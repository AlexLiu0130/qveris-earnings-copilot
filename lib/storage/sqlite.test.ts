import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSQLiteD1 } from "@/lib/storage/sqlite";

test("SQLite adapter applies migrations and implements the D1 statement contract", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "qveris-sqlite-"));
  const options = {
    databasePath: join(directory, "earnings.db"),
    migrationsDir: join(process.cwd(), "drizzle"),
  };
  let database = createSQLiteD1(options);
  t.after(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const tables = await database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all<{ name: string }>();
  assert.ok(tables.results?.some((row) => row.name === "research_snapshots"));
  assert.ok(tables.results?.some((row) => row.name === "qveris_fetch_cache"));

  await database.prepare(
    `INSERT INTO qveris_fetch_cache (
      cache_key, tool_id, parameters_json, response_json, response_hash,
      execution_id, fetched_at, expires_at, schema_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind("cache-1", "tool", "{}", "{}", "hash", null, "2026-01-01", "2026-01-02", 1).run();

  database.close();
  database = createSQLiteD1(options);

  const row = await database.prepare(
    "SELECT cache_key, schema_version FROM qveris_fetch_cache WHERE cache_key = ?",
  ).bind("cache-1").first<{ cache_key: string; schema_version: number }>();
  assert.deepEqual(row, { cache_key: "cache-1", schema_version: 1 });
});
