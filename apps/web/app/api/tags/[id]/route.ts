import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const tag = client.tags.get(parseId((await params).id));
    return ok({ tag });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const body = await request.json();
    const { client } = getBackend();
    const tag = client.tags.update(parseId((await params).id), {
      name: body.name,
      description: body.description,
      color: body.color,
    });
    return ok({ tag });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    client.tags.remove(parseId((await params).id));
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
}