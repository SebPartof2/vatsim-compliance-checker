import { getDiscordAccountId } from "./db";
import { getCidFromDiscordId } from "./vatsim";

export const IS_DEV = process.env.NODE_ENV === "development";

/**
 * CIDs allowed to use dev mode (override bar, roster reports) in production.
 * Set DEV_CIDS to a comma-separated list of VATSIM CIDs. In development, dev
 * mode is on for everyone.
 */
export const DEV_CIDS = (process.env.DEV_CIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Resolve the signed-in viewer's real CID and whether dev mode applies to them.
 * Authorization is always based on the viewer's ACTUAL Discord-linked CID, never
 * an overridden one.
 */
export async function resolveViewer(userId: string): Promise<{
  realCid: string | null;
  devEnabled: boolean;
}> {
  const discordId = getDiscordAccountId(userId);
  const link = discordId ? await getCidFromDiscordId(discordId) : null;
  const realCid = link?.status === "linked" ? link.cid : null;
  const devEnabled = IS_DEV || (realCid != null && DEV_CIDS.includes(realCid));
  return { realCid, devEnabled };
}
