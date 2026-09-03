import { NextRequest, NextResponse } from "next/server";

const MAX_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Privacy-safe remote-image proxy for HTML email. Readers' clients never
 * fetch sender-hosted pixels directly (which would leak IP + open tracking),
 * so images load without a per-message approval gate.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");

  if (!raw) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url." }, { status: 400 });
  }

  if ((target.protocol !== "http:" && target.protocol !== "https:") || !isPublicHost(target.hostname)) {
    return NextResponse.json({ error: "Only public http(s) image hosts are allowed." }, { status: 403 });
  }

  if (target.username || target.password) {
    return NextResponse.json({ error: "Credentials in url are not allowed." }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded ${upstream.status}.` },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Upstream did not return an image." }, { status: 502 });
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Image is empty or too large." }, { status: 502 });
    }

    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image." }, { status: 502 });
  }
}

/**
 * SSRF guard: refuse loopback, private, and link-local hosts (literal IPs
 * and well-known local names). DNS-rebinding races are out of scope for a
 * same-origin pixel proxy, but direct IP literals can't dodge this check.
 */
function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  if (host === "localhost" || host === "localhost.localdomain") return false;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return false;
  }
  if (host === "::1" || host === "::" || host === "0.0.0.0") return false;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b! >= 16 && b! <= 31) return false;
    if (a === 100 && b! >= 64 && b! <= 127) return false;
  }

  if (host.includes(":")) return false; // Other IPv6 literals stay disallowed.
  return true;
}
