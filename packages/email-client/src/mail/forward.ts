import { getMessage } from "./messages";
import { ensurePrefix } from "./replies";
import { send } from "./compose";
import type { ClientDeps } from "../deps";
import type { OutgoingAttachment, SendResult } from "../provider";
import type { Address, AddressInput } from "../types";

export type ForwardOptions = {
  to: AddressInput[];
  body?: string;
  attachments?: OutgoingAttachment[];
  /**
   * Resolve the original message's non-inline attachments into outgoing
   * attachments. The email client stays file-agnostic; hosts wire this to
   * their AttachmentStore.
   */
  resolveOriginalAttachments?: (messageId: number) => Promise<OutgoingAttachment[]>;
};

function buildForwardBody(original: {
  from: Address[];
  date: string | null;
  subject: string;
  text: string | null;
}): string {
  const sender = original.from.map((entry) => `${entry.name ?? ""} ${entry.address}`.trim()).join(", ") || "(unknown)";
  const date = original.date ? new Date(original.date).toLocaleString() : "";

  return [
    `---------- Forwarded message ----------`,
    `From: ${sender}`,
    `Date: ${date}`,
    `Subject: ${original.subject}`,
    "",
    original.text ?? "",
  ].join("\n");
}

export async function forward(
  deps: ClientDeps,
  messageId: number,
  opts: ForwardOptions,
): Promise<SendResult> {
  const original = getMessage(deps, messageId);

  const attachments: OutgoingAttachment[] = opts.attachments
    ?? (opts.resolveOriginalAttachments
      ? await opts.resolveOriginalAttachments(messageId)
      : []);

  return send(deps, {
    accountId: original.accountId,
    to: opts.to,
    subject: ensurePrefix(original.subject, "Fwd:"),
    text: opts.body ?? buildForwardBody(original),
    attachments,
  });
}