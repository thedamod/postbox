import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "1");
    const q = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0), 0);

    const { client } = getBackend();
    const result = client.search(accountId, { q, limit, offset });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
