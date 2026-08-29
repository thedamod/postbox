import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const body = await request.json();
    const { client } = getBackend();
    const rule = client.rules.update(parseId((await params).id), {
      name: body.name,
      condition: body.condition,
      tagId: body.tagId,
      enabled: body.enabled,
    });
    return ok({ rule });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    client.rules.remove(parseId((await params).id));
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}