import type { EmailStorage, UpsertMessageInput } from "../storage";
import type { StoredMessage } from "../types";
import { classifyLabels } from "../providers/gmail/labels";
import { evaluate } from "./evaluator";
import type { TagRule } from "./rules";

function applyLabels(
  storage: EmailStorage,
  accountId: number,
  messageId: number,
  labels: string[],
) {
  if (labels.length === 0) return;

  const { custom } = classifyLabels(labels);

  for (const name of custom) {
    let tag = storage.getTagByName(accountId, name);

    if (!tag) {
      tag = storage.createTag(accountId, { name });
    }

    storage.attachTag(messageId, tag.id, "label", 1);
  }
}

function messageFromInput(input: UpsertMessageInput, messageId: number): StoredMessage {
  return {
    id: messageId,
    accountId: input.accountId,
    threadId: null,
    providerUid: input.providerUid ?? null,
    messageId: input.messageId ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: input.references,
    from: input.from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    subject: input.subject,
    text: input.text,
    html: input.html,
    date: input.date,
    folder: input.folder,
    flags: input.flags,
    size: input.size ?? null,
    snippet: input.snippet ?? null,
    createdAt: "",
    attachments: [],
    tags: [],
  };
}

function applyRules(
  storage: EmailStorage,
  messageId: number,
  input: UpsertMessageInput,
  enabledRules: TagRule[],
) {
  if (enabledRules.length === 0) return;

  const message = messageFromInput(input, messageId);

  // Stale rule results are replaced on every evaluation.
  storage.clearRuleTags(messageId);

  for (const rule of enabledRules) {
    if (evaluate(rule.condition, message)) {
      storage.attachTag(messageId, rule.tagId, "rule", 1);
    }
  }
}

/**
 * Fast tag path used by the sync engine: the message data and enabled rules
 * are already in hand, so there's no storage re-fetch and no per-message rule
 * listing.
 *
 * - `labels` -> tags derived from the provider's labels
 * - `input`  -> when given, the enabled rules are evaluated against it
 */
export function applyTags(
  storage: EmailStorage,
  messageId: number,
  accountId: number,
  input: UpsertMessageInput | null,
  labels: string[],
  enabledRules: TagRule[],
) {
  applyLabels(storage, accountId, messageId, labels);

  if (input) {
    applyRules(storage, messageId, input, enabledRules);
  }
}

/**
 * Convenience wrapper for one-off re-tagging (e.g. after a rule changes):
 * loads the stored message + rules from the storage, then applies both.
 */
export async function autotagMessage(
  storage: EmailStorage,
  messageId: number,
  labels: string[] = [],
) {
  const message = storage.getMessage(messageId);

  if (!message) return;

  const enabledRules = storage.listTagRules(message.accountId).filter((rule) => rule.enabled);

  applyLabels(storage, message.accountId, messageId, labels);
  applyRules(storage, messageId, toInput(message), enabledRules);
}

function toInput(message: StoredMessage): UpsertMessageInput {
  return {
    accountId: message.accountId,
    folder: message.folder,
    providerUid: message.providerUid ?? null,
    messageId: message.messageId ?? null,
    providerThreadId: undefined,
    inReplyTo: message.inReplyTo ?? null,
    references: message.references,
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    date: message.date,
    size: message.size ?? null,
    flags: message.flags,
    snippet: message.snippet ?? null,
  };
}