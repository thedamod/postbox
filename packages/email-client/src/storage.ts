import type {
  Address,
  EmailAccount,
  EmailAttachment,
  MessageFlags,
  StoredMessage,
  StoredThread,
} from "./types";
import type { Tag } from "./tags/service";
import type { TagRule } from "./tags/rules";

/**
 * The storage boundary.
 *
 * `@postbox/email-client` owns the email domain logic (sync, threading, tags,
 * search, composing) and speaks to *this* interface — never to a concrete
 * database or filesystem. Each host (web server, React Native app, CLI)
 * provides an implementation backed by its own SQLite/Expo-SQLite/whatever.
 *
 * Attachment *bytes* are handled separately by {@link AttachmentStore}, so
 * this package stays free of file-storage concerns.
 */

// ------------------------------------------------------------------ input

export type UpsertMessageInput = {
  accountId: number;
  folder: string;
  providerUid?: number | null;
  messageId?: string | null;
  providerThreadId?: string | null;
  inReplyTo?: string | null;
  references: string[];
  from: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  subject: string;
  text: string | null;
  html: string | null;
  date: string | null;
  size?: number | null;
  flags: MessageFlags;
  snippet?: string | null;
  labels?: string[];
};

export type OutgoingMessageInput = {
  accountId: number;
  folder: string;
  threadId?: number | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references: string[];
  from: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  subject: string;
  text?: string | null;
  html?: string | null;
  date?: string | null;
  flags?: Partial<MessageFlags>;
};

export type UpsertOptions = {
  /**
   * Write attachment bytes and return their metadata records. Runs for new
   * messages only; the returned records are persisted by the storage layer.
   */
  resolveAttachments?: (messageId: number) => Promise<EmailAttachment[]>;
  /** Synchronous callback run inside the final write transaction (autotag etc.). */
  afterWrite?: (messageId: number) => void;
};

export type SyncState = {
  accountId: number;
  folder: string;
  lastUid: number;
  uidvalidity: number | null;
  lastSyncAt: string | null;
  /** Lowest UID synced; the frontier for progressively loading older mail. */
  minUid: number | null;
};

export type ThreadListOptions = {
  limit?: number;
  offset?: number;
  folder?: string;
};

export type SearchIndexResult = {
  total: number;
  /** Stored message ids, best-match first. */
  ids: number[];
};

// ----------------------------------------------------------------- storage

export interface EmailStorage {
  // ------------------------------------------------------------ accounts

  listAccounts(): EmailAccount[];
  getAccount(id: number): EmailAccount | null;
  addAccount(input: {
    provider: string;
    email: string;
    displayName?: string | null;
    picture?: string | null;
    refreshToken: string;
  }): EmailAccount;
  updateAccount(id: number, patch: { displayName?: string | null; picture?: string | null }): void;
  removeAccount(id: number): void;

  // ------------------------------------------------------------ sync state

  getSyncState(accountId: number, folder: string): SyncState | null;
  saveSyncState(state: SyncState): void;
  clearSyncState(accountId: number, folder: string): void;

  // ------------------------------------------------------------ key/value

  /**
   * Host-provided string store (sync revisions, seeds, token caches).
   * The sync engine persists its per-account revision here so clients can
   * poll cheaply for changes.
   */
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  deleteMeta(key: string): void;

  // ------------------------------------------------------------- messages

  getMessage(id: number): StoredMessage | null;
  /** Read search/list result rows in one query, without loading heavy detail data. */
  getMessages(ids: number[]): StoredMessage[];
  getMessageByProviderUid(
    accountId: number,
    folder: string,
    providerUid: number,
  ): StoredMessage | null;
  findMessageIdByHeader(accountId: number, messageId: string): number | null;
  /** Thread id for an existing message header, used to thread replies. */
  findThreadIdByMessageHeader(accountId: number, messageId: string): number | null;
  updateFlagsIfChanged(
    messageId: number,
    flags: { seen: boolean; starred: boolean },
  ): void;
  setMessageFlag(messageId: number, flag: "seen" | "starred", value: boolean): void;
  setMessageFolder(messageId: number, folder: string): void;
  addMessageFolder(messageId: number, accountId: number, folder: string): void;
  moveMessageFolder(messageId: number, accountId: number, from: string, to: string): void;
  /**
   * Find-or-create the thread and message in a single transaction. Returns
   * the message id. Attachment records come back via `resolveAttachments`
   * (new messages only).
   */
  upsertMessage(input: UpsertMessageInput, opts?: UpsertOptions): Promise<number>;
  insertOutgoingMessage(input: OutgoingMessageInput): number;
  listMessagesByThread(threadId: number): StoredMessage[];
  countMessagesByFolder(
    accountId: number,
    folder: string,
    opts?: { unreadOnly?: boolean },
  ): number;

  // -------------------------------------------------------------- threads

  getThread(id: number): StoredThread | null;
  listThreads(accountId: number, opts?: ThreadListOptions): StoredThread[];

  // --------------------------------------------------- attachments metadata

  listAttachmentsForMessage(messageId: number): EmailAttachment[];

  // ---------------------------------------------------------------- tags

  listTags(accountId: number): Tag[];
  getTag(id: number): Tag | null;
  getTagByName(accountId: number, name: string): Tag | null;
  createTag(
    accountId: number,
    input: { name: string; description?: string | null; color?: string | null },
  ): Tag;
  updateTag(
    id: number,
    patch: { name?: string; description?: string | null; color?: string | null },
  ): Tag;
  removeTag(id: number): void;
  attachTag(messageId: number, tagId: number, source?: string, confidence?: number): void;
  detachTag(messageId: number, tagId: number): void;
  tagsForMessage(messageId: number): Tag[];
  /** Remove rule-derived tags for a message before re-evaluating rules. */
  clearRuleTags(messageId: number): void;

  // ------------------------------------------------------------ tag rules

  listTagRules(accountId: number): TagRule[];
  getTagRule(id: number): TagRule | null;
  createTagRule(input: {
    accountId: number;
    name: string;
    condition: TagRule["condition"];
    tagId: number;
    enabled?: boolean;
  }): TagRule;
  updateTagRule(
    id: number,
    patch: {
      name?: string;
      condition?: TagRule["condition"];
      tagId?: number;
      enabled?: boolean;
    },
  ): TagRule;
  removeTagRule(id: number): void;

  // --------------------------------------------------------------- search

  indexMessage(messageId: number, input: UpsertMessageInput): void;
  removeFromSearch(messageId: number): void;
  searchMessages(accountId: number, query: string, opts?: { limit?: number; offset?: number }): SearchIndexResult;
}

/**
 * Owns attachment bytes (local files, object storage, whatever the host
 * chooses). The email client never touches the filesystem directly.
 */
export interface AttachmentStore {
  /**
   * Persist an attachment for a message and return its metadata record,
   * or `null` when there is nothing to store.
   */
  save(
    messageId: number,
    attachment: {
      filename?: string;
      contentType?: string;
      size?: number;
      partId?: string;
      contentId?: string;
      content?: Uint8Array;
      related?: boolean;
      contentDisposition?: string;
    },
    index: number,
  ): Promise<EmailAttachment | null>;

  /** Read an attachment's bytes back (for download / forward). */
  read(messageId: number, attachmentId: number): Promise<Uint8Array | null>;
}
