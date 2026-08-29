import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ accountId: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const accountId = parseId((await params).accountId);
    if (request.nextUrl.searchParams.get("wait") === "1") {
      const result = await client.sync.syncAccount(
        accountId,
        request.nextUrl.searchParams.get("folder") ?? undefined,
      );
      return ok({ result });
    }
    const job = client.sync.startSyncAccount(accountId);
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}
