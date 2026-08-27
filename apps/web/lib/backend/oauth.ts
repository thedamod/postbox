import type { AuthProvider, EmailAccount } from "@postbox/email-client";

import { loadRootEnv } from "./env";
import type { NodeMailStorage } from "./sqlite-storage";

loadRootEnv();

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SCOPES = [
  // IMAP + SMTP protocol access require the full mail scope, not the gmail.*
  // REST API scopes (which is why auth otherwise fails with
  // AUTHENTICATIONFAILED / "535 BadCredentials").
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/contacts.readonly",
].join(" ");

export type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Read OAuth config from env. Returns null when Gmail login isn't configured. */
export function getGmailOAuthConfig(): GmailOAuthConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/auth/gmail/callback`;

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

/** The Google consent-screen URL for a given config. */
export function buildAuthUrl(config: GmailOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(config: GmailOAuthConfig, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(config: GmailOAuthConfig, refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Basic profile of the just-authed user, from the userinfo endpoint. */
export async function fetchUserProfile(accessToken: string) {
  const res = await fetch(`${USERINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);

  if (!res.ok) throw new Error(`Failed to fetch Google profile (${res.status}).`);

  return (await res.json()) as { email: string; name?: string; picture?: string };
}

/**
 * Real auth provider for Gmail accounts: exchanges the stored refresh token for
 * a short-lived access token (cached in the meta table), which the IMAP/SMTP
 * providers use as the SASL XOAUTH2 credential.
 *
 * Demo accounts (@example.com) have no real Google credentials and are passed
 * through unchanged so the dev seed keeps working when OAuth is configured.
 */
export class GmailOAuthAuthProvider implements AuthProvider {
  constructor(
    private storage: NodeMailStorage,
    private config: GmailOAuthConfig,
  ) {}

  async getAccessToken(account: EmailAccount): Promise<string> {
    if (account.email.endsWith("@example.com")) {
      return account.refreshToken;
    }

    const cacheKey = `oauth:access:${account.id}`;
    const cachedRaw = this.storage.getMeta(cacheKey);

    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as { token: string; expiresAt: number };
      // Refresh a few minutes early to avoid races at the boundary.
      if (cached.expiresAt > Date.now() + 60_000) {
        return cached.token;
      }
    }

    const { accessToken, expiresIn } = await refreshAccessToken(this.config, account.refreshToken);

    this.storage.setMeta(
      cacheKey,
      JSON.stringify({ token: accessToken, expiresAt: Date.now() + expiresIn * 1000 }),
    );

    return accessToken;
  }
}
