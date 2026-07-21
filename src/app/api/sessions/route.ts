import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllAtcSessions } from "@/lib/vatsim";
import { matchCallsignsToArtccs } from "@/lib/vnas";

/**
 * Returns ALL of a member's previous ATC sessions, each enriched with the
 * ARTCC that owns its callsign prefix. Fetched on demand from VATSIM (nothing
 * is persisted server-side); the client holds them only for the current view
 * to drive stats and the filtered session list.
 *
 * Requires a logged-in session so we aren't an open proxy; the CID is public
 * VATSIM data.
 *
 * GET /api/sessions?cid=<cid>
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cid = searchParams.get("cid");
  if (!cid || !/^\d+$/.test(cid)) {
    return NextResponse.json({ error: "Invalid or missing cid" }, { status: 400 });
  }

  const result = await getAllAtcSessions(cid);
  if (result.status === "error") {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  // Enrich each session with the ARTCC that owns its callsign prefix.
  const matches = await matchCallsignsToArtccs(
    result.items.map((s) => s.callsign),
  );
  const items = result.items.map((s) => ({
    ...s,
    artcc: matches[s.callsign] ?? null,
  }));

  return NextResponse.json(
    { items, count: result.count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
