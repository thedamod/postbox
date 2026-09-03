import { NextRequest } from "next/server";

import { readAccountSyncState } from "@postbox/email-client";

import { fail, getBackend, ok, parseId } from "@/lib/api";

/**
 * Cheap revision poll: returns the account's sync revision and last sync
 * time without touching the provider. Clients compare `revision` against
 * their last seen value to decide whether a refresh is needed.
 */
export async function GET(request: NextRequest) {
  try {
    const { client } = getBackend();
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "");
    const account = client.getAccount(accountId);
    if (!account) {
      return ok({ revision: 0, lastSyncAt: null, exists: false });
    }
    return ok({ ...readAccountSyncState(client.deps, accountId), exists: true });
  } catch (error) {
    return fail(error);
  }
}
