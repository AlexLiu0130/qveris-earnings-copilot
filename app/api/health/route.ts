import { NextResponse } from "next/server";

import { getD1 } from "@/lib/storage/d1";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getD1();
    if (!db) throw new Error("D1 binding DB is unavailable");
    const result = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    if (result?.ok !== 1) throw new Error("D1 health query failed");

    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check failed", {
      error: error instanceof Error ? error.message : "UnknownError",
    });
    return NextResponse.json(
      { status: "unhealthy", database: "unavailable" },
      { status: 503 },
    );
  }
}
