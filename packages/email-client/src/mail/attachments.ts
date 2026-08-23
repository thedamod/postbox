import type { ClientDeps } from "../deps";
import type { EmailAttachment } from "../types";

export type AttachmentMetadata = EmailAttachment & { id: number };

export function listAttachmentsForMessage(
  deps: ClientDeps,
  messageId: number,
): AttachmentMetadata[] {
  const message = deps.storage.getMessage(messageId);

  if (!message) {
    throw new Error(`Message "${messageId}" does not exist.`);
  }

  return message.attachments as AttachmentMetadata[];
}

export function getAttachment(
  deps: ClientDeps,
  messageId: number,
  attachmentId: number,
): AttachmentMetadata {
  const attachment = listAttachmentsForMessage(deps, messageId).find(
    (entry) => entry.id === attachmentId,
  );

  if (!attachment) {
    throw new Error(`Attachment "${attachmentId}" does not exist on message "${messageId}".`);
  }

  return attachment;
}

export async function download(
  deps: ClientDeps,
  messageId: number,
  attachmentId: number,
): Promise<{ filename: string; contentType: string; data: Uint8Array }> {
  const attachment = getAttachment(deps, messageId, attachmentId);
  const data = await deps.attachments.read(messageId, attachmentId);

  if (!data) {
    throw new Error("Attachment is not stored.");
  }

  return {
    filename: attachment.filename ?? "attachment",
    contentType: attachment.contentType ?? "application/octet-stream",
    data,
  };
}