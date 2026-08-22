import type { ClientDeps } from "./deps";
import type { AuthProvider } from "./auth";
import type { ProviderRegistry } from "./deps";
import { createSyncEngine, type SyncEngine } from "./sync";
import * as folders from "./mail/folders";
import * as messages from "./mail/messages";
import * as threads from "./mail/threads";
import * as compose from "./mail/compose";
import * as replies from "./mail/replies";
import * as forwardService from "./mail/forward";
import * as attachments from "./mail/attachments";
import * as search from "./search";
import { createTagService, type TagService } from "./tags/service";
import { createTagRuleService, type TagRuleService } from "./tags/rules";
import { autotagMessage } from "./tags/autotag";
import type {
  AttachmentStore,
  EmailStorage,
  UpsertOptions,
} from "./storage";
import type {
  EmailAccount,
  StoredMessage,
  StoredThread,
} from "./types";
import type {
  OutgoingAttachment,
  SendOptions,
  SendResult,
} from "./provider";

export type { ClientDeps } from "./deps";

export class MailClient {
  readonly deps: ClientDeps;
  readonly sync: SyncEngine;
  readonly tags: TagService;
  readonly rules: TagRuleService;

  constructor(deps: ClientDeps) {
    this.deps = deps;
    this.sync = createSyncEngine(deps);
    this.tags = createTagService(deps.storage);
    this.rules = createTagRuleService(deps.storage);
  }

  // ------------------------------------------------------------- accounts

  listAccounts(): EmailAccount[] {
    return this.deps.storage.listAccounts();
  }

  getAccount(id: number): EmailAccount | null {
    return this.deps.storage.getAccount(id);
  }

  addAccount(input: {
    provider: string;
    email: string;
    displayName?: string | null;
    picture?: string | null;
    refreshToken: string;
  }): EmailAccount {
    return this.deps.storage.addAccount(input);
  }

  updateAccount(id: number, patch: { displayName?: string | null; picture?: string | null }): void {
    this.deps.storage.updateAccount(id, patch);
  }

  removeAccount(id: number): void {
    this.deps.storage.removeAccount(id);
  }

  // ---------------------------------------------------------------- mail

  listFolders(accountId: number) {
    return folders.listFolders(this.deps, accountId);
  }

  getMessage(id: number): StoredMessage {
    return messages.getMessage(this.deps, id);
  }

  markRead(id: number): Promise<StoredMessage> {
    return messages.markRead(this.deps, id);
  }

  markUnread(id: number): Promise<StoredMessage> {
    return messages.markUnread(this.deps, id);
  }

  star(id: number): Promise<StoredMessage> {
    return messages.star(this.deps, id);
  }

  unstar(id: number): Promise<StoredMessage> {
    return messages.unstar(this.deps, id);
  }

  trash(id: number): Promise<StoredMessage> {
    return messages.trash(this.deps, id);
  }

  move(id: number, folder: string): Promise<StoredMessage> {
    return messages.move(this.deps, id, folder);
  }

  listThreads(accountId: number, opts?: { limit?: number; offset?: number; folder?: string }): StoredThread[] {
    return threads.listThreads(this.deps, accountId, opts);
  }

  getThread(threadId: number): { thread: StoredThread; messages: StoredMessage[] } {
    return threads.getThread(this.deps, threadId);
  }

  send(opts: compose.ComposeOptions): Promise<SendResult> {
    return compose.send(this.deps, opts);
  }

  saveDraft(opts: compose.ComposeOptions): Promise<{ ok: true; folder: string }> {
    return compose.saveDraft(this.deps, opts);
  }

  reply(messageId: number, opts: replies.ReplyOptions): Promise<SendResult> {
    return replies.replyTo(this.deps, messageId, opts);
  }

  replyAll(messageId: number, opts: replies.ReplyOptions): Promise<SendResult> {
    return replies.replyAll(this.deps, messageId, opts);
  }

  forward(messageId: number, opts: forwardService.ForwardOptions): Promise<SendResult> {
    return forwardService.forward(this.deps, messageId, {
      ...opts,
      // Default resolver: pull non-inline attachments from the AttachmentStore.
      resolveOriginalAttachments: opts.resolveOriginalAttachments ?? ((originalMessageId) =>
        resolveOriginalAttachments(this.deps, originalMessageId)),
    });
  }

  listAttachments(messageId: number) {
    return attachments.listAttachmentsForMessage(this.deps, messageId);
  }

  getAttachment(messageId: number, attachmentId: number) {
    return attachments.getAttachment(this.deps, messageId, attachmentId);
  }

  downloadAttachment(messageId: number, attachmentId: number) {
    return attachments.download(this.deps, messageId, attachmentId);
  }

  // --------------------------------------------------------------- search

  search(accountId: number, opts: search.SearchOptions): search.SearchResult {
    return search.query(this.deps, accountId, opts);
  }

  // ----------------------------------------------------------------- tags

  testRule(ruleId: number, messageId: number): boolean {
    return this.rules.test(ruleId, messageId);
  }

  autotag(messageId: number, labels: string[] = []) {
    return autotagMessage(this.deps.storage, messageId, labels);
  }
}

async function resolveOriginalAttachments(
  deps: ClientDeps,
  messageId: number,
): Promise<OutgoingAttachment[]> {
  const stored = deps.storage.getMessage(messageId);
  if (!stored) return [];

  const outgoing: OutgoingAttachment[] = [];

  for (const attachment of stored.attachments) {
    if (attachment.isInline || attachment.id == null) continue;

    const data = await deps.attachments.read(messageId, attachment.id);
    if (!data) continue;

    outgoing.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: data,
    });
  }

  return outgoing;
}

export type { UpsertOptions };
