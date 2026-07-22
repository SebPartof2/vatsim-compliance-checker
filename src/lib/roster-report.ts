/**
 * Background roster currency reports.
 *
 * Checking currency for a whole roster needs one VATSIM call per member, and
 * VATSIM allows ~10/min shared across the server. So we don't do this inline:
 * a job is started, runs in the background at LOW priority (interactive
 * dashboard loads always jump ahead), and the client polls for progress and
 * results.
 *
 * Jobs live in memory — fine for the single-instance/SQLite deployment model.
 */

import { getAllAtcSessions } from "./vatsim";
import { matchCallsignsToArtccs } from "./vnas";
import { getFacilityRoster } from "./roster";
import {
  getCurrencyRequirement,
  requiredHours,
  currentPeriodWindow,
} from "./currency";

const ONE_HOUR_MS = 3_600_000;
/** Keep finished reports around so re-opening the page is instant. */
const JOB_TTL_MS = 60 * 60 * 1000;

export interface MemberCurrency {
  cid: number;
  name: string;
  /** Numeric VATSIM rating, so callers can sort by seniority. */
  rating: number;
  ratingShort: string;
  membership: "home" | "visit";
  status: "pending" | "done" | "error";
  /** Time controlled at this facility within the window. */
  ms?: number;
  /** null = no known requirement for this facility/role. */
  requiredMs?: number | null;
  met?: boolean | null;
  error?: string;
}

export interface ReportJob {
  key: string;
  facility: string;
  quarterKey: string;
  windowLabel: string;
  status: "running" | "done" | "error";
  total: number;
  completed: number;
  members: MemberCurrency[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const jobs = new Map<string, ReportJob>();

function jobKey(facility: string, quarterKey: string): string {
  return `${facility.toUpperCase()}|${quarterKey}`;
}

/** "2026-q3" -> Date at the start of that quarter. */
function quarterKeyToDate(key: string): Date {
  const m = /^(\d{4})-q([1-4])$/.exec(key);
  if (!m) return new Date();
  return new Date(Number(m[1]), (Number(m[2]) - 1) * 3, 1);
}

export function getReport(
  facility: string,
  quarterKey: string,
): ReportJob | null {
  return jobs.get(jobKey(facility, quarterKey)) ?? null;
}

/**
 * Start (or return an existing) report. Safe to call repeatedly — a running
 * job is reused, and a recently finished one is returned as-is.
 */
export function startReport(facility: string, quarterKey: string): ReportJob {
  const code = facility.toUpperCase();
  const key = jobKey(code, quarterKey);

  const existing = jobs.get(key);
  if (existing) {
    const fresh =
      existing.status === "running" ||
      Date.now() - (existing.finishedAt ?? 0) < JOB_TTL_MS;
    if (fresh) return existing;
  }

  const job: ReportJob = {
    key,
    facility: code,
    quarterKey,
    windowLabel: "",
    status: "running",
    total: 0,
    completed: 0,
    members: [],
    startedAt: Date.now(),
  };
  jobs.set(key, job);
  void runReport(job); // fire-and-forget; client polls for progress
  return job;
}

async function runReport(job: ReportJob): Promise<void> {
  try {
    const roster = await getFacilityRoster(job.facility);
    if (roster.status !== "ok") {
      job.status = "error";
      job.error = roster.message;
      job.finishedAt = Date.now();
      return;
    }

    // One window for the whole report (the facility's own period basis).
    const req = getCurrencyRequirement(job.facility);
    const win = currentPeriodWindow(
      req?.period ?? "quarter",
      quarterKeyToDate(job.quarterKey),
    );
    job.windowLabel = win.label;

    job.members = roster.members.map((m) => ({
      cid: m.cid,
      name: `${m.fname} ${m.lname}`.trim(),
      rating: m.rating,
      ratingShort: m.ratingShort,
      membership: m.membership,
      status: "pending" as const,
    }));
    job.total = job.members.length;

    for (const entry of job.members) {
      try {
        // LOW priority: interactive requests preempt this.
        const res = await getAllAtcSessions(entry.cid, "low");
        if (res.status !== "ok") throw new Error(res.message);

        const matches = await matchCallsignsToArtccs(
          res.items.map((s) => s.callsign),
        );

        let ms = 0;
        for (const s of res.items) {
          if (matches[s.callsign]?.id !== job.facility) continue;
          const start = new Date(s.start).getTime();
          if (Number.isNaN(start) || start < win.start || start >= win.end) {
            continue;
          }
          if (!s.end) continue;
          const d = new Date(s.end).getTime() - start;
          if (d > 0) ms += d;
        }

        const hours = req
          ? requiredHours(req, entry.membership === "home")
          : null;

        entry.ms = ms;
        entry.requiredMs = hours == null ? null : hours * ONE_HOUR_MS;
        entry.met = hours == null ? null : ms >= hours * ONE_HOUR_MS;
        entry.status = "done";
      } catch (err) {
        entry.status = "error";
        entry.error = (err as Error).message;
      }
      job.completed += 1;
    }

    job.status = "done";
    job.finishedAt = Date.now();
  } catch (err) {
    job.status = "error";
    job.error = (err as Error).message;
    job.finishedAt = Date.now();
  }
}
