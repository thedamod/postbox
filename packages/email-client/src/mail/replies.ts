import { send, type ComposeOptions } from "./compose";
import { getMessage } from "./messages";
import { getAccountOrThrow, type ClientDeps } from "../deps";
import type { OutgoingAttachment, SendResult } from "../provider";
import type { Address, StoredMessage } from "../types";

const PREFIX_RE = /^(re|fw|fwd|r)(\s*\[[^\]]*\])?:/i;

export function ensurePrefix(subject: string, prefix: "Re:" | "Fwd:"): string {
  const cleaned = subject.replace(/\s+/g, " ").trim();

  if (!cleaned) return prefix.replace(":", "");

  if (PREFIX_RE.test(cleaned)) {
    return cleaned;
  }

  return `${prefix} ${cleaned}`;
}

function uniqueAddresses(list: Address[]): Address[] {
  const seen = new Set<string>();
  const result: Address[] = [];

  for (const entry of list) {
    const key = entry.address.toLowerCase();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function isOwnAddress(account: { email: string; displayName?: string | null }, address: Address) {
  const email = address.address.toLowerCase();
  const name = address.name?.toLowerCase();

  if (account.email.toLowerCase() === email) return true;

  if (account.displayName && name && account.displayName.toLowerCase() === name) {
    return true;
  }

  return false;
}

export type ReplyOptions = {
  body: string;
  html?: string;
  includeAll?: boolean;
  attachments?: OutgoingAttachment[];
};

/**
 * Build the recipient set for a reply / reply-all.
 *
 * Reply:
 *   to = original Reply-To (if any), else original From.
 *
 * Reply All:
 *   to = original Reply-To (if any), else original From
 *   cc = original To + original Cc + original Reply-To, minus your own addresses
 */
export function collectReplyRecipients(
  original: StoredMessage,
  account: { email: string; displayName?: string | null },
  includeAll: boolean,
): { to: Address[]; cc: Address[] } {
  const replyTarget = original.replyTo.length > 0 ? original.replyTo : original.from;
  const to = uniqueAddresses(replyTarget);

  if (!includeAll) {
    return { to, cc: [] };
  }

  const cc = uniqueAddresses(
    [...original.to, ...original.cc, ...original.replyTo].filter(
      (address) => !isOwnAddress(account, address),
    ),
  ).filter(
    (address) =>
      !to.some((entry) => entry.address.toLowerCase() === address.address.toLowerCase()),
  );

  return { to, cc };
}

export async function replyTo(
  deps: ClientDeps,
  messageId: number,
  opts: ReplyOptions,
): Promise<SendResult> {
  const original = getMessage(deps, messageId);
  const account = getAccountOrThrow(deps, original.accountId);

  const { to, cc } = collectReplyRecipients(original, account, opts.includeAll ?? false);

  const references = [...original.references, original.messageId].filter(
    (id): id is string => typeof id === "string" && id !== "",
  );

  return send(deps, {
    accountId: original.accountId,
    to,
    cc,
    subject: ensurePrefix(original.subject, "Re:"),
    text: opts.body,
    html: opts.html,
    inReplyTo: original.messageId ?? undefined,
    references,
    attachments: opts.attachments,
  });
}

export function replyAll(deps: ClientDeps, messageId: number, opts: ReplyOptions) {
  return replyTo(deps, messageId, { ...opts, includeAll: true });
}

export type { ComposeOptions };