import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveViewer } from "@/lib/dev-mode";
import { getReport, startReport } from "@/lib/roster-report";
import { queueStats } from "@/lib/vatsim-queue";

/**
 * Roster currency reports (dev mode only).
 *
 *   POST /api/roster/report  { facility, quarter }  -> starts (or reuses) a job
 *   GET  /api/roster/report?facility=&quarter=      -> current job state
 *
 * The job runs in the background at low priority; poll GET for progress.
 */

async function authorize(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { devEnabled } = await resolveViewer(session.user.id);
  if (!devEnabled) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { error: null };
}

function parseParams(facility: unknown, quarter: unknown) {
  const f = typeof facility === "string" ? facility.trim().toUpperCase() : "";
  const q = typeof quarter === "string" ? quarter.trim() : "";
  if (!/^[A-Z0-9]{2,4}$/.test(f)) return null;
  if (!/^\d{4}-q[1-4]$/.test(q)) return null;
  return { facility: f, quarter: q };
}

export async function GET(request: Request) {
  const { error } = await authorize(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const parsed = parseParams(
    searchParams.get("facility"),
    searchParams.get("quarter"),
  );
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid facility or quarter" },
      { status: 400 },
    );
  }

  const job = getReport(parsed.facility, parsed.quarter);
  return NextResponse.json(
    { job, queue: queueStats() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { error } = await authorize(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { facility, quarter } = (body ?? {}) as Record<string, unknown>;
  const parsed = parseParams(facility, quarter);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid facility or quarter" },
      { status: 400 },
    );
  }

  const job = startReport(parsed.facility, parsed.quarter);
  return NextResponse.json(
    { job, queue: queueStats() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
