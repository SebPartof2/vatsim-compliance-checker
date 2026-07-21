/**
 * VATSIM / VATUSA lookups.
 *
 * Flow:
 *   1. Discord user id  -> VATSIM member (gives us the CID)
 *   2. CID              -> VATUSA user profile (name, rating, facility)
 *
 * All calls happen server-side; these APIs are not CORS-friendly and we don't
 * want to leak anything to the browser.
 */

/** VATSIM controller rating table (id -> short/long text). */
export const CONTROLLER_RATINGS: Record<
  number,
  { short: string; long: string }
> = {
  [-1]: { short: "INA", long: "Inactive" },
  0: { short: "SUS", long: "Suspended" },
  1: { short: "OBS", long: "Pilot/Observer" },
  2: { short: "S1", long: "Tower Trainee" },
  3: { short: "S2", long: "Tower Controller" },
  4: { short: "S3", long: "TMA Controller" },
  5: { short: "C1", long: "Enroute Controller" },
  6: { short: "C2", long: "Senior Controller" },
  7: { short: "C3", long: "Senior Controller" },
  8: { short: "I1", long: "Instructor" },
  9: { short: "I2", long: "Senior Instructor" },
  10: { short: "I3", long: "Senior Instructor" },
  11: { short: "SUP", long: "Supervisor" },
  12: { short: "ADM", long: "Administrator" },
};

export function ratingInfo(rating: number): { short: string; long: string } {
  return CONTROLLER_RATINGS[rating] ?? { short: "?", long: "Unknown" };
}

/**
 * Build an error message that names the failing VATSIM endpoint and flags 429s
 * so rate limiting is obvious and attributable to a specific call.
 */
function vatsimError(endpoint: string, status: number): string {
  const hint =
    status === 429 ? " — rate limited (10 req/min), try again shortly" : "";
  return `VATSIM ${endpoint} returned ${status}${hint}.`;
}

/** Result of resolving a Discord id against VATSIM. */
export type VatsimLinkResult =
  | { status: "linked"; cid: string }
  | { status: "not-linked" }
  | { status: "error"; message: string };

interface VatsimMemberResponse {
  id: string; // discord id
  user_id: string; // CID
}

/**
 * Cache of resolved Discord id -> CID. A link is effectively permanent, so we
 * hold successful lookups for 48h to avoid re-hitting a rate-limited endpoint.
 * We only cache SUCCESSES — "not-linked" is re-checked live so a user who links
 * their Discord isn't stuck seeing the not-linked message for two days.
 */
const CID_CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const cidCache = new Map<string, { cid: string; at: number }>();

/**
 * Look up the VATSIM CID linked to a Discord account.
 * Returns "not-linked" when VATSIM responds 404 { detail: "Not Found" }.
 */
export async function getCidFromDiscordId(
  discordId: string,
): Promise<VatsimLinkResult> {
  const cached = cidCache.get(discordId);
  if (cached && Date.now() - cached.at < CID_CACHE_TTL_MS) {
    return { status: "linked", cid: cached.cid };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.vatsim.net/v2/members/discord/${encodeURIComponent(discordId)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch (err) {
    return {
      status: "error",
      message: `Could not reach VATSIM: ${(err as Error).message}`,
    };
  }

  if (res.status === 404) {
    return { status: "not-linked" };
  }
  if (!res.ok) {
    return {
      status: "error",
      message: vatsimError(`GET /v2/members/discord/${discordId}`, res.status),
    };
  }

  const data = (await res.json()) as VatsimMemberResponse;
  if (!data.user_id) {
    return { status: "not-linked" };
  }

  const cid = String(data.user_id);
  cidCache.set(discordId, { cid, at: Date.now() });
  return { status: "linked", cid };
}

/** A subdivision the controller is authorized to visit. */
export interface VatusaVisitingFacility {
  id: number;
  facility: string; // facility code, e.g. "ZSE"
  created_at: string; // ISO timestamp the visit was granted
}

/** Subset of the VATUSA user payload we care about. */
export interface VatusaUser {
  cid: number;
  fname: string;
  lname: string;
  rating: number;
  facility: string;
  facility_join?: string; // ISO timestamp they joined their home facility
  rating_short?: string;
  visiting_facilities?: VatusaVisitingFacility[];
}

export type VatusaResult =
  | { status: "ok"; user: VatusaUser }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** A single past ATC connection, flattened from the VATSIM /atc payload. */
export interface AtcSession {
  id: number;
  callsign: string;
  start: string; // ISO
  end: string | null; // ISO, null if somehow still open
  rating: number;
  server: string;
  artcc?: { id: string; name: string } | null; // matched via vNAS prefix
}

export type AtcSessionsResult =
  | { status: "ok"; items: AtcSession[]; count: number }
  | { status: "error"; message: string };

/** VATSIM rate-limits to ~10 requests/minute; back off and retry on 429. */
const RATE_LIMIT_BACKOFF_MS = 6500;
const MAX_RETRIES_ON_429 = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a page of a member's previous ATC sessions.
 * `limit` has no documented maximum, so callers can request everything in one
 * shot (see getAllAtcSessions). `count` is the member's total session count.
 * We deliberately never persist these — callers fetch on demand.
 */
export async function getAtcSessions(
  cid: string | number,
  limit: number,
  offset: number,
): Promise<AtcSessionsResult> {
  const safeLimit = Math.max(Math.trunc(limit) || 1, 1);
  const safeOffset = Math.max(Math.trunc(offset) || 0, 0);

  const url = `https://api.vatsim.net/v2/members/${encodeURIComponent(String(cid))}/atc?limit=${safeLimit}&offset=${safeOffset}`;

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      return {
        status: "error",
        message: `Could not reach VATSIM: ${(err as Error).message}`,
      };
    }

    if (res.status === 429 && attempt < MAX_RETRIES_ON_429) {
      await sleep(RATE_LIMIT_BACKOFF_MS);
      continue;
    }
    break;
  }

  if (!res.ok) {
    return {
      status: "error",
      message: vatsimError(`GET /v2/members/${cid}/atc`, res.status),
    };
  }

  const body = (await res.json()) as {
    items?: Array<{
      connection_id?: {
        id?: number;
        callsign?: string;
        start?: string;
        end?: string | null;
        rating?: number;
        server?: string;
      };
    }>;
    count?: number;
  };

  const items: AtcSession[] = (body.items ?? []).map((it) => {
    const c = it.connection_id ?? {};
    return {
      id: c.id ?? 0,
      callsign: c.callsign ?? "?",
      start: c.start ?? "",
      end: c.end ?? null,
      rating: c.rating ?? 0,
      server: c.server ?? "",
    };
  });

  return { status: "ok", items, count: body.count ?? items.length };
}

/**
 * Fetch ALL of a member's ATC sessions in just two requests: one tiny call to
 * learn the total `count`, then one call with `limit=count` to pull the rest.
 * This keeps us well within VATSIM's rate limit. Still never persisted — the
 * caller holds the result only for the current view.
 */
export async function getAllAtcSessions(
  cid: string | number,
): Promise<AtcSessionsResult> {
  // 1) Cheap probe for the total count.
  const head = await getAtcSessions(cid, 1, 0);
  if (head.status !== "ok") return head;
  if (head.count <= head.items.length) return head; // 0 or 1 session

  // 2) One call for everything.
  return getAtcSessions(cid, head.count, 0);
}

/** A VATUSA facility (subdivision). */
export interface VatusaFacility {
  id: string;
  name: string;
}

export type FacilityResult =
  | { status: "ok"; facility: VatusaFacility }
  | { status: "not-found" }
  | { status: "error"; message: string };

/** Fetch a VATUSA facility by its id (e.g. "ZNY", "HCF"). */
export async function getFacility(id: string): Promise<FacilityResult> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.vatusa.net/v2/facility/${encodeURIComponent(id)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch (err) {
    return {
      status: "error",
      message: `Could not reach VATUSA: ${(err as Error).message}`,
    };
  }

  if (res.status === 404) {
    return { status: "not-found" };
  }
  if (!res.ok) {
    return { status: "error", message: `VATUSA API returned ${res.status}.` };
  }

  const body = (await res.json()) as {
    data?: { facility?: { info?: VatusaFacility } };
  };
  const info = body?.data?.facility?.info;
  if (!info?.id) {
    return { status: "not-found" };
  }
  return { status: "ok", facility: { id: info.id, name: info.name } };
}

/**
 * Format a facility for display, e.g. "New York ARTCC (ZNY)".
 *
 * The VATUSA `name` already includes "ARTCC" where applicable (and omits it for
 * combined facilities like Honolulu), so we just pair it with the id.
 */
export function formatFacilityName(id: string, name: string): string {
  return `${name} (${id})`;
}

/**
 * Special VATUSA "facilities" that aren't real subdivisions. The facility API
 * returns "not active" for these, so we resolve their names locally.
 */
export const SPECIAL_FACILITIES: Record<string, string> = {
  ZHQ: "Headquarters",
  ZAE: "Academy",
  ZZI: "Inactive",
  // ZZN: TBD
};

/** International controllers home to VATUSA are coded ZZN. */
export const INTERNATIONAL_FACILITY = "ZZN";

/**
 * Resolve a facility code to a display label ("Seattle ARTCC (ZSE)"),
 * falling back to the raw code if the lookup fails. Known special codes
 * (Headquarters, Academy, Inactive) are resolved without hitting the API.
 */
export async function resolveFacilityLabel(code: string): Promise<string> {
  const special = SPECIAL_FACILITIES[code.toUpperCase()];
  if (special) return `${special} (${code})`;

  const f = await getFacility(code);
  return f.status === "ok"
    ? formatFacilityName(f.facility.id, f.facility.name)
    : code;
}

/** VATSIM member division/subdivision, from /v2/members/:cid. */
async function getMemberDivision(
  cid: string,
): Promise<{ divisionId: string | null; subdivisionId: string | null } | null> {
  try {
    const res = await fetch(
      `https://api.vatsim.net/v2/members/${encodeURIComponent(cid)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) {
      console.warn(vatsimError(`GET /v2/members/${cid}`, res.status));
      return null;
    }
    const d = (await res.json()) as {
      division_id?: string | null;
      subdivision_id?: string | null;
    };
    return {
      divisionId: d.division_id ?? null,
      subdivisionId: d.subdivision_id ?? null,
    };
  } catch {
    return null;
  }
}

/** Fetch code -> name maps for VATSIM divisions and subdivisions (cached daily). */
async function getDivisionNames(): Promise<Record<string, string>> {
  try {
    const res = await fetch("https://api.vatsim.net/api/divisions/", {
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      console.warn(vatsimError("GET /api/divisions/", res.status));
      return {};
    }
    const arr = (await res.json()) as Array<{ id: string; name: string }>;
    return Object.fromEntries(arr.map((d) => [d.id, d.name]));
  } catch {
    return {};
  }
}

async function getSubdivisionNames(): Promise<Record<string, string>> {
  try {
    const res = await fetch("https://api.vatsim.net/api/subdivisions/", {
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      console.warn(vatsimError("GET /api/subdivisions/", res.status));
      return {};
    }
    const arr = (await res.json()) as Array<{
      code: string;
      fullname: string;
    }>;
    return Object.fromEntries(arr.map((s) => [s.code, s.fullname]));
  } catch {
    return {};
  }
}

/**
 * Build a rich label for an international (ZZN) controller by resolving their
 * VATSIM division and subdivision, e.g.
 *   "Europe (except UK) (EUD) — Austria (AUST)".
 * Falls back to "International (ZZN)" if the extra data can't be fetched.
 */
export async function resolveInternationalLabel(
  cid: string | number,
): Promise<string> {
  const fallback = `International (${INTERNATIONAL_FACILITY})`;

  const member = await getMemberDivision(String(cid));
  if (!member || (!member.divisionId && !member.subdivisionId)) {
    return fallback;
  }

  const [divisions, subdivisions] = await Promise.all([
    getDivisionNames(),
    member.subdivisionId
      ? getSubdivisionNames()
      : Promise.resolve({} as Record<string, string>),
  ]);

  const parts: string[] = [];
  if (member.divisionId) {
    const name = divisions[member.divisionId] ?? member.divisionId;
    parts.push(`${name} (${member.divisionId})`);
  }
  if (member.subdivisionId) {
    const name = subdivisions[member.subdivisionId] ?? member.subdivisionId;
    parts.push(`${name} (${member.subdivisionId})`);
  }

  return parts.length ? parts.join(" — ") : fallback;
}

/**
 * Resolve the label for a controller's HOME facility. Identical to
 * `resolveFacilityLabel` except international (ZZN) controllers are expanded to
 * their VATSIM division/subdivision, which requires their CID.
 */
export async function resolveHomeFacilityLabel(
  code: string,
  cid: string | number,
): Promise<string> {
  if (code.toUpperCase() === INTERNATIONAL_FACILITY) {
    return resolveInternationalLabel(cid);
  }
  return resolveFacilityLabel(code);
}

/** Fetch a VATUSA user profile by CID. */
export async function getVatusaUser(cid: string): Promise<VatusaResult> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.vatusa.net/v2/user/${encodeURIComponent(cid)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
  } catch (err) {
    return {
      status: "error",
      message: `Could not reach VATUSA: ${(err as Error).message}`,
    };
  }

  if (res.status === 404) {
    return { status: "not-found" };
  }
  if (!res.ok) {
    return { status: "error", message: `VATUSA API returned ${res.status}.` };
  }

  const body = (await res.json()) as { data?: VatusaUser };
  if (!body?.data) {
    return { status: "not-found" };
  }
  return { status: "ok", user: body.data };
}
