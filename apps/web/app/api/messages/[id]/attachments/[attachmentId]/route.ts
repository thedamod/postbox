import { NextRequest } from "next/server";

import { fail, getBackend, ok, parseId } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { id, attachmentId } = await params;
    const { client } = getBackend();
    const file = await client.downloadAttachment(parseId(id), parseId(attachmentId));

    return new Response(Buffer.from(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}