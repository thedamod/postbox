import { NextRequest, NextResponse } from "next/server";

import { fail, getBackend } from "@/lib/api";
import {
  exchangeCode,
  fetchUserProfile,
  getGmailOAuthConfig,
} from "@/lib/backend/oauth";

const HOME = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

function redirectWithError(message: string) {
  return NextResponse.redirect(
    `${HOME}/?auth_error=${encodeURIComponent(message)}`,
  );
}

/**
 * Google redirects here after consent. We exchange the code for tokens, create
 * (or update) the Gmail account, kick off a first sync, and land back on the
 * app.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    const error = request.nextUrl.searchParams.get("error");
    return redirectWithError(error ? `Google: ${error}` : "No authorization code returned.");
  }

  try {
    const config = getGmailOAuthConfig();
    if (!config) return redirectWithError("Gmail login isn't configured.");

    const token = await exchangeCode(config, code);

    if (!token.refresh_token) {
      return redirectWithError(
        "Google didn't return a refresh token. Grant access again (make sure consent is allowed).",
      );
    }

    const profile = await fetchUserProfile(token.access_token);
    const { storage } = getBackend();

    const existing = storage
      .listAccounts()
      .find((account) => account.email === profile.email);

    if (existing) {
      storage.updateAccountToken(existing.id, {
        refreshToken: token.refresh_token,
        displayName: profile.name ?? existing.displayName,
        picture: profile.picture ?? existing.picture,
      });
    } else {
      storage.addAccount({
        provider: "gmail",
        email: profile.email,
        displayName: profile.name ?? null,
        picture: profile.picture ?? null,
        refreshToken: token.refresh_token,
      });
    }

    const account = storage.listAccounts().find((a) => a.email === profile.email);
    if (!account) return redirectWithError("Connected, but the account wasn't stored.");

    // Warm the access-token cache now, then kick off the first sync.
    const { client } = getBackend();
    try {
      await client.deps.auth.getAccessToken(account);
    } catch {
      // Non-fatal: the sync job will report the real error.
    }
    void client.sync.startSyncAccount(account.id);

    return NextResponse.redirect(`${HOME}/?connected=${encodeURIComponent(profile.email)}`);
  } catch (error) {
    return redirectWithError(error instanceof Error ? error.message : String(error));
  }
}
