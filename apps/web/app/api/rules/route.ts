import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, parseId } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "1");
    const { client } = getBackend();
    return ok({ rules: client.rules.list(accountId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.accountId || !body.name || !body.condition || !body.tagId) {
      throw new ApiError(400, "accountId, name, condition and tagId are required.");
    }

    const { client } = getBackend();
    const rule = client.rules.create({
      accountId: Number(body.accountId),
      name: body.name,
      condition: body.condition,
      tagId: Number(body.tagId),
      enabled: body.enabled,
    });

    return ok({ rule }, 201);
  } catch (error) {
    return fail(error);
  }
}