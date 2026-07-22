import type { D1DatabaseBinding, D1PreparedStatement } from "@/lib/storage/d1";

type DatabaseSync = import("node:sqlite").DatabaseSync;
type StatementSync = import("node:sqlite").StatementSync;
type SQLInputValue = import("node:sqlite").SQLInputValue;

const SQLITE_DATABASES_KEY = Symbol.for("qveris.storage.sqlite.databases.v1");
const sqliteDatabases = ((globalThis as typeof globalThis & Partial<Record<symbol, Map<string, SQLiteDatabaseBinding>>>)[SQLITE_DATABASES_KEY] ??=
  new Map<string, SQLiteDatabaseBinding>());

export function getSQLiteD1() {
  const databasePath = process.env.SQLITE_DATABASE_PATH ?? "/data/earnings.db";
  const migrationsDir = process.env.SQLITE_MIGRATIONS_DIR ?? `${process.cwd()}/drizzle`;
  const cached = sqliteDatabases.get(databasePath);
  if (cached) return cached;

  const database = createSQLiteD1({ databasePath, migrationsDir });
  sqliteDatabases.set(databasePath, database);
  return database;
}

export function createSQLiteD1(options: { databasePath: string; migrationsDir: string }) {
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");

  fs.mkdirSync(path.dirname(options.databasePath), { recursive: true });
  const database = new DatabaseSync(options.databasePath, { timeout: 5_000 });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  applyMigrations(database, options.migrationsDir, fs, path);
  return new SQLiteDatabaseBinding(database);
}

export class SQLiteDatabaseBinding implements D1DatabaseBinding {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string): D1PreparedStatement {
    return new SQLitePreparedStatement(this.database.prepare(sql));
  }

  close() {
    this.database.close();
  }
}

class SQLitePreparedStatement implements D1PreparedStatement {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]) {
    this.values = values.map(toSQLiteValue);
    return this;
  }

  async first<T = Record<string, unknown>>() {
    const row = this.statement.get(...this.values) as Record<string, unknown> | undefined;
    return row ? normalizeRow<T>(row) : null;
  }

  async all<T = Record<string, unknown>>() {
    const rows = this.statement.all(...this.values) as Record<string, unknown>[];
    return { results: rows.map(normalizeRow<T>) };
  }

  async run() {
    return this.statement.run(...this.values);
  }
}

function normalizeRow<T>(row: Record<string, unknown>) {
  return { ...row } as T;
}

function applyMigrations(
  database: DatabaseSync,
  migrationsDir: string,
  fs: typeof import("node:fs"),
  path: typeof import("node:path"),
) {
  database.exec(`CREATE TABLE IF NOT EXISTS _local_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    database.prepare("SELECT name FROM _local_migrations").all().map((row) => String(row.name)),
  );
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const recordMigration = database.prepare("INSERT INTO _local_migrations (name, applied_at) VALUES (?, ?)");

  for (const name of migrationFiles) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8")
      .replaceAll("--> statement-breakpoint", "\n");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      recordMigration.run(name, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function toSQLiteValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) {
    return value;
  }
  throw new TypeError(`Unsupported SQLite bind value: ${typeof value}`);
}
