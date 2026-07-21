/**
 * vNAS ARTCC matching.
 *
 * The vNAS data feed (https://data-api.vnas.vatsim.net/api/artccs/) is ~15 MB
 * and lists every ARTCC's facility tree. We only need a tiny derived index:
 * the set of position *prefixes* (the part of a callsign before the first
 * underscore, e.g. "JFK" in "JFK_TWR") mapped to the ARTCC that owns them.
 *
 * That index is ~9 KB, so we build it once server-side and memoize it in
 * memory (Next's fetch cache won't hold the 15 MB source — it caps at 2 MB).
 */

export interface ArtccMatch {
  id: string; // ARTCC id, e.g. "ZNY"
  name: string; // e.g. "New York ARTCC"
}

interface ArtccIndex {
  prefixToArtcc: Record<string, string>; // prefix -> ARTCC id
  artccNames: Record<string, string>; // ARTCC id -> display name
  builtAt: number;
}

interface VnasFacility {
  id?: string;
  name?: string;
  positions?: Array<{ callsign?: string }>;
  childFacilities?: VnasFacility[];
}

const VNAS_URL = "https://data-api.vnas.vatsim.net/api/artccs/";
const TTL_MS = 24 * 60 * 60 * 1000; // rebuild at most once a day

/**
 * vNAS ARTCC id -> VATUSA facility code, where the two systems diverge.
 * Honolulu Control Facility (HCF) is split into two ARTCCs in vNAS:
 *   ZHN (Hawaii) and ZUA (Guam CERAP) — both belong to HCF.
 */
const VNAS_TO_VATUSA: Record<string, string> = {
  ZHN: "HCF",
  ZUA: "HCF",
};

/** Canonical display names for reconciled (VATUSA) facility codes. */
const RECONCILED_NAMES: Record<string, string> = {
  HCF: "Honolulu Control Facility",
};

/**
 * Position prefixes that must map to an ARTCC but never appear in the vNAS feed
 * (e.g. because they aren't controlled via CRC), so we add them manually.
 *   ZAK = Oakland Oceanic, controlled outside CRC, belongs to ZOA.
 * These override anything derived from the feed.
 */
const EXTRA_PREFIXES: Record<string, string> = {
  ZAK: "ZOA",
};

/** Resolve a vNAS ARTCC id to the VATUSA facility code it belongs to. */
function toVatusaFacility(artccId: string): string {
  return VNAS_TO_VATUSA[artccId] ?? artccId;
}

let indexCache: ArtccIndex | null = null;
let inflight: Promise<ArtccIndex> | null = null;

/** The prefix of a callsign: everything before the first underscore. */
export function callsignPrefix(callsign: string): string {
  return (callsign ?? "").split("_")[0].toUpperCase();
}

/** Recursively collect every position callsign in a facility tree. */
function collectCallsigns(fac: VnasFacility, out: string[]): void {
  for (const p of fac.positions ?? []) {
    if (p.callsign) out.push(p.callsign);
  }
  for (const child of fac.childFacilities ?? []) {
    collectCallsigns(child, out);
  }
}

async function buildIndex(): Promise<ArtccIndex> {
  const res = await fetch(VNAS_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`vNAS API returned ${res.status}`);
  }

  const artccs = (await res.json()) as Array<{
    id: string;
    facility: VnasFacility;
  }>;

  const prefixToArtcc: Record<string, string> = {};
  const artccNames: Record<string, string> = {};

  for (const art of artccs) {
    // Reconcile vNAS ids to VATUSA facility codes (e.g. ZHN/ZUA -> HCF).
    const facilityId = toVatusaFacility(art.id);
    artccNames[facilityId] =
      RECONCILED_NAMES[facilityId] ?? art.facility?.name ?? facilityId;

    const callsigns: string[] = [];
    collectCallsigns(art.facility, callsigns);

    for (const cs of callsigns) {
      const prefix = callsignPrefix(cs);
      if (!prefix) continue;

      const existing = prefixToArtcc[prefix];
      if (!existing) {
        prefixToArtcc[prefix] = facilityId;
      } else if (existing !== facilityId && prefix === facilityId) {
        // Collision: prefer the ARTCC whose own id equals the prefix
        // (e.g. "ZSE" appears under ZOA but belongs to ZSE).
        prefixToArtcc[prefix] = facilityId;
      }
    }
  }

  // Manual prefixes absent from the feed take precedence.
  for (const [prefix, artccId] of Object.entries(EXTRA_PREFIXES)) {
    prefixToArtcc[prefix] = artccId;
    if (!artccNames[artccId]) artccNames[artccId] = artccId;
  }

  return { prefixToArtcc, artccNames, builtAt: Date.now() };
}

/** Memoized index accessor; dedupes concurrent builds. */
async function getIndex(): Promise<ArtccIndex> {
  if (indexCache && Date.now() - indexCache.builtAt < TTL_MS) {
    return indexCache;
  }
  if (inflight) return inflight;

  inflight = buildIndex()
    .then((idx) => {
      indexCache = idx;
      inflight = null;
      return idx;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  return inflight;
}

/**
 * Match a list of callsigns to their ARTCCs by position prefix.
 * Returns a map keyed by callsign; unmatched callsigns map to null. If the
 * vNAS feed is unreachable, every entry is null (matching is best-effort).
 */
export async function matchCallsignsToArtccs(
  callsigns: string[],
): Promise<Record<string, ArtccMatch | null>> {
  let idx: ArtccIndex;
  try {
    idx = await getIndex();
  } catch {
    return Object.fromEntries(callsigns.map((cs) => [cs, null]));
  }

  const out: Record<string, ArtccMatch | null> = {};
  for (const cs of callsigns) {
    const prefix = callsignPrefix(cs);
    const id = prefix ? idx.prefixToArtcc[prefix] : undefined;
    out[cs] = id ? { id, name: idx.artccNames[id] ?? id } : null;
  }
  return out;
}
