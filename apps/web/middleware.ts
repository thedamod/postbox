import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Dev CORS for the API. The Expo web app (localhost:8081) and any local
 * frontend call these routes cross-origin; without these headers the browser
 * blocks them with "Failed to fetch".
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
