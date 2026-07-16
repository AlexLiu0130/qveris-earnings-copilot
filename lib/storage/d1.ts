import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface D1DatabaseBinding {
  prepare(sql: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export type D1PersistenceErrorCode =
  | "D1_BINDING_MISSING"
  | "D1_READ_FAILED"
  | "D1_WRITE_FAILED"
  | "D1_SNAPSHOT_ID_CONFLICT"
  | "D1_EVENT_FACT_CONFLICT";

export class D1PersistenceError extends Error {
  override name = "D1PersistenceError";
  override cause?: unknown;

  constructor(message: string, readonly code: D1PersistenceErrorCode, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

let testD1: D1DatabaseBinding | null | undefined;

export function getD1(): D1DatabaseBinding | null {
  if (testD1 !== undefined) {
    if (testD1 || !isProductionRuntime()) return testD1;
    throw new D1PersistenceError("D1 binding DB is required in production", "D1_BINDING_MISSING");
  }

  try {
    const db = (getCloudflareContext().env as { DB?: unknown }).DB;
    if (isD1(db)) return db;
  } catch (error) {
    if (isProductionRuntime()) {
      throw new D1PersistenceError("D1 binding DB is unavailable in production", "D1_BINDING_MISSING", error);
    }
    return null;
  }
  if (isProductionRuntime()) {
    throw new D1PersistenceError("D1 binding DB is required in production", "D1_BINDING_MISSING");
  }
  return null;
}

export function __setD1ForTests(db: D1DatabaseBinding | null | undefined) {
  testD1 = db;
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isD1PersistenceError(error: unknown): error is D1PersistenceError {
  return error instanceof D1PersistenceError;
}

function isD1(value: unknown): value is D1DatabaseBinding {
  return !!value && typeof value === "object" && typeof (value as D1DatabaseBinding).prepare === "function";
}
