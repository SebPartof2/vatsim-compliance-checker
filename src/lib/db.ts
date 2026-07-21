import Database from "better-sqlite3";

/**
 * Shared SQLite connection used by Better Auth and for reading auth data
 * (e.g. the linked Discord account id) elsewhere in the app.
 */
export const db = new Database(process.env.DATABASE_PATH ?? "./sqlite.db");

/**
 * Return the Discord account id (snowflake) linked to a Better Auth user.
 *
 * Better Auth stores each OAuth identity in the `account` table, keyed by
 * `providerId`. For Discord, `accountId` is exactly the Discord user id the
 * VATSIM API expects. Returns null if the user has no Discord account.
 */
export function getDiscordAccountId(userId: string): string | null {
  const row = db
    .prepare(
      "SELECT accountId FROM account WHERE userId = ? AND providerId = 'discord' LIMIT 1",
    )
    .get(userId) as { accountId: string } | undefined;
  return row?.accountId ?? null;
}
