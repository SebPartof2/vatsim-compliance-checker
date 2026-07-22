import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";

/**
 * Public base URL of the app. Prefer an explicit BETTER_AUTH_URL; otherwise
 * fall back to Railway's injected public domain so the OAuth callback and
 * cookies resolve correctly in production without extra config.
 */
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : undefined);

/**
 * Better Auth server instance.
 *
 * We only need Discord as an identity provider. Discord's numeric account id
 * (the "Discord user id") is what the VATSIM API keys off of; Better Auth
 * already persists it in the `account` table, so we read it from there via
 * `getDiscordAccountId` rather than duplicating it onto the user record.
 */
export const auth = betterAuth({
  database: db,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: baseURL ? [baseURL] : undefined,
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    },
  },
  advanced: {
    ipAddress: {
      // Railway (and most PaaS proxies) terminate TLS and forward the client
      // IP here. Without this, Better Auth rate limiting falls back to one
      // shared bucket for every visitor.
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  // Ensures Set-Cookie headers from server actions/route handlers are applied.
  plugins: [nextCookies()],
});
