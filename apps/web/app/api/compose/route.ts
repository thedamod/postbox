import { NextRequest } from "next/server";

import { ApiError, fail, getBackend, ok } from "@/lib/api";
import { sendMessage } from "@/lib/backend/dev-mail";

import type { OutgoingAttachment } from "@postbox/email-client";

type AttachmentInput = {
  filename?: string;
  contentType?: string;
  contentBase64?: string;
};

function toAttachment(input: AttachmentInput): OutgoingAttachment {
  const filename = input.filename?.trim() || undefined;
  const contentType = input.contentType?.trim() || undefined;

  if (input.contentBase64) {
    const content = Buffer.from(input.contentBase64, "base64");
    return { filename, contentType, content };
  }

  return { filename, contentType };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.accountId || !body.subject || !body.to) {
      throw new ApiError(400, "accountId, subject and to are required.");
    }

    const attachments: OutgoingAttachment[] = Array.isArray(body.attachments)
      ? body.attachments.map(toAttachment)
      : [];

    const { client } = getBackend();
    const result = await sendMessage(client, {
      accountId: Number(body.accountId),
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      text: body.text,
      html: body.html,
      inReplyTo: body.inReplyTo,
      references: body.references,
      attachments,
    });

    return ok({ result });
  } catch (error) {
    return fail(error);
  }
}
