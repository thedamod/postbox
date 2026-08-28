import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, parseId, sanitizeAccount } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const account = client.getAccount(parseId((await params).id));
    if (!account) throw new ApiError(404, "Account not found.");
    return ok({ account: sanitizeAccount(account) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const id = parseId((await params).id);

    const body = await request.json();
    client.updateAccount(id, { displayName: body.displayName ?? null });

    const account = client.getAccount(id);
    if (!account) throw new ApiError(404, "Account not found.");
    return ok({ account: sanitizeAccount(account) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    client.removeAccount(parseId((await params).id));
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}