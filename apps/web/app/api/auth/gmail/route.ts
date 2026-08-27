import { NextResponse } from "next/server";

import { fail } from "@/lib/api";
import { buildAuthUrl, getGmailOAuthConfig } from "@/lib/backend/oauth";

/** Kick off the Google consent flow. */
export async function GET() {
  try {
    const config = getGmailOAuthConfig();

    if (!config) {
      return NextResponse.json(
        {
          error:
            "Gmail login isn't configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to enable it.",
        },
        { status: 503 },
      );
    }

    return NextResponse.redirect(buildAuthUrl(config));
  } catch (error) {
    return fail(error);
  }
}