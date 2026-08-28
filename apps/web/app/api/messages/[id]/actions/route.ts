import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { client } = getBackend();
    const messageId = parseId((await params).id);
    const body = await request.json();

    switch (body.action) {
      case "read":
        return ok({ message: await client.markRead(messageId) });
      case "unread":
        return ok({ message: await client.markUnread(messageId) });
      case "star":
        return ok({ message: await client.star(messageId) });
      case "unstar":
        return ok({ message: await client.unstar(messageId) });
      case "trash":
      case "delete":
        return ok({ message: await client.trash(messageId) });
      case "move":
        if (typeof body.folder !== "string" || !body.folder) {
          throw new ApiError(400, "folder is required.");
        }
        return ok({ message: await client.move(messageId, body.folder) });
      case "reply":
        return ok({ result: await client.reply(messageId, { body: body.body }) });
      case "replyAll":
        return ok({ result: await client.replyAll(messageId, { body: body.body }) });
      case "forward":
        if (!body.to) throw new ApiError(400, "to is required.");
        return ok({ result: await client.forward(messageId, { to: body.to, body: body.body }) });
      default:
        throw new ApiError(400, `Unknown action "${body.action}".`);
    }
  } catch (error) {
    return fail(error);
  }
}
