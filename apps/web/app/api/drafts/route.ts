import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok } from "@/lib/api";
import { saveDraftMessage } from "@/lib/backend/dev-mail";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.accountId || !body.subject) {
      throw new ApiError(400, "accountId and subject are required.");
    }

    const { client } = getBackend();
    const result = await saveDraftMessage(client, {
      accountId: Number(body.accountId),
      to: body.to ?? [],
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
    });

    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}