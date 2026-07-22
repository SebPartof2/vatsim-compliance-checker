/**
 * VATUSA facility roster.
 *
 * `/v2/facility/:id/roster/both` returns home *and* visiting controllers.
 * VATUSA isn't rate-limited the way VATSIM is, but the payload is large, so we
 * memoize it briefly.
 */

export interface RosterMember {
  cid: number;
  fname: string;
  lname: string;
  rating: number;
  ratingShort: string;
  /** "home" = rostered here; "visit" = visiting controller. */
  membership: "home" | "visit";
  facility: string; // the member's own home facility code
  lastActivity: string | null;
}

export type RosterResult =
  | { status: "ok"; members: RosterMember[] }
  | { status: "error"; message: string };

interface RawRosterMember {
  cid?: number;
  fname?: string;
  lname?: string;
  rating?: number;
  rating_short?: string;
  membership?: string;
  facility?: string;
  lastactivity?: string | null;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { members: RosterMember[]; at: number }>();

export async function getFacilityRoster(
  facility: string,
): Promise<RosterResult> {
  const code = facility.toUpperCase();

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { status: "ok", members: hit.members };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.vatusa.net/v2/facility/${encodeURIComponent(code)}/roster/both`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch (err) {
    return {
      status: "error",
      message: `Could not reach VATUSA: ${(err as Error).message}`,
    };
  }

  if (!res.ok) {
    return {
      status: "error",
      message: `VATUSA roster for ${code} returned ${res.status}.`,
    };
  }

  const body = (await res.json()) as { data?: RawRosterMember[] };
  const raw = body?.data;
  if (!Array.isArray(raw)) {
    return { status: "error", message: `No roster found for ${code}.` };
  }

  const members: RosterMember[] = raw
    .filter((m) => typeof m.cid === "number")
    .map((m) => ({
      cid: m.cid as number,
      fname: m.fname ?? "",
      lname: m.lname ?? "",
      rating: m.rating ?? 0,
      ratingShort: m.rating_short ?? "",
      membership: m.membership === "visit" ? "visit" : "home",
      facility: m.facility ?? "",
      lastActivity: m.lastactivity ?? null,
    }));

  cache.set(code, { members, at: Date.now() });
  return { status: "ok", members };
}
