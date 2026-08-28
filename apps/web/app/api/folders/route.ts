import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "1");
    const { client } = getBackend();
    return ok({ folders: await client.listFolders(accountId) });
  } catch (error) {
    return fail(error);
  }
}
