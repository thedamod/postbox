import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ accountId: string }> };

/** Trigger a progressive "load older mail" sync (used by pagination). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const accountId = parseId((await params).accountId);
    const wait = request.nextUrl.searchParams.get("wait") === "1";
    const folder = request.nextUrl.searchParams.get("folder") ?? undefined;

    if (wait) {
      const result = await client.sync.syncOlderAccount(accountId, folder);
      return ok({ result });
    }

    const job = client.sync.startSyncMore(accountId);
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}
