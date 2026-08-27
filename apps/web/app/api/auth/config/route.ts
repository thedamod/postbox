import { NextResponse } from "next/server";

import { getGmailOAuthConfig } from "@/lib/backend/oauth";

export async function GET() {
  const oauth = getGmailOAuthConfig();

  return NextResponse.json({
    oauthConfigured: Boolean(oauth),
    loginUrl: "/api/auth/gmail",
  });
}