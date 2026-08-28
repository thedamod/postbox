import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const message = client.getMessage(parseId((await params).id));
    if (!message) throw new ApiError(404, "Message not found.");
    return ok({ message });
  } catch (error) {
    return fail(error);
  }
}