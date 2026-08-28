import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "1");
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1), 500);
    const offset = Math.max(Number(request.nextUrl.searchParams.get("offset") ?? 0), 0);
    const folder = request.nextUrl.searchParams.get("folder") ?? undefined;

    const { client, storage } = getBackend();
    const threads = client.listThreads(accountId, { limit, offset, folder });
    const total = storage.countThreads(accountId, folder);
    const dbHasMore = offset + threads.length < total;
    const hasMore = dbHasMore || storage.hasOlderMail(accountId);

    return ok({ threads, total, limit, offset, hasMore });
  } catch (error) {
    return fail(error);
  }
}