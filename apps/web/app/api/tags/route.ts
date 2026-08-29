import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, parseId } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const accountId = parseId(request.nextUrl.searchParams.get("accountId") ?? "1");
    const { client } = getBackend();
    return ok({ tags: client.tags.list(accountId) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.accountId || !body.name) {
      throw new ApiError(400, "accountId and name are required.");
    }

    const { client } = getBackend();
    const tag = client.tags.create(Number(body.accountId), {
      name: body.name,
      description: body.description,
      color: body.color,
    });

    return ok({ tag }, 201);
  } catch (error) {
    return fail(error);
  }
}