import type { EmailAccount } from "@postbox/email-client/domain";
import { getBackend } from "@/lib/backend/mail-client";
import { FOLDER_DEFS } from "./folders";
import { storageFolderForView, storedThreadToDetail, threadToView } from "./adapters";
import type { MailProvider } from "./provider";
import type {
  ComposeInput,
  DraftInput,
  FolderCounts,
  MailAccount,
  MailboxInfo,
  MailFolderId,
  MailViewId,
  ThreadDetail,
  ThreadListPage,
  ThreadListQuery,
} from "./types";
import type { MailCollection } from "./types";
import { pageThreads } from "./list-query";

const ACCOUNT_CAPABILITIES: MailAccount["capabilities"] = [
  "read",
  "send",
  "drafts",
  "markUnread",
  "star",
  "archive",
  "spam",
  "trash",
  "attachments",
  "collections",
  "sort",
];

export function toMailAccount(account: EmailAccount): MailAccount {
  return {
    id: String(account.id),
    connector: "gmail",
    email: account.email,
    displayName: account.displayName || account.email,
    image: account.picture ?? null,
    status: "connected",
    capabilities: ACCOUNT_CAPABILITIES,
    syncRevision: 0,
  };
}

/** Resolve an account, defaulting to the first connected account. */
export function resolveMailAccount(accountId?: string | null): MailAccount {
  const { client } = getBackend();
  const accounts = client.listAccounts();
  if (accounts.length === 0) {
    throw new Error("No connected accounts. Connect Gmail to get started.");
  }
  const match =
    (accountId ? accounts.find((a) => String(a.id) === accountId) : null) ??
    accounts[0]!;
  return toMailAccount(match);
}

export function listMailAccounts(): MailAccount[] {
  const { client } = getBackend();
  return client.listAccounts().map(toMailAccount);
}

/**
 * Provider-neutral entry point (mirrors redakt `getMailProvider`): resolves
 * the account, then returns the shared storage-backed `MailProvider`.
 */
export function getMailProvider(accountId?: string | null): MailProvider {
  const account = resolveMailAccount(accountId);
  return createStorageProvider(account);
}

function numericAccountId(account: MailAccount): number {
  const id = Number(account.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid account "${account.id}".`);
  return id;
}

function splitAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function createStorageProvider(account: MailAccount): MailProvider {
  const id = numericAccountId(account);
  return {
    account,
    async getMailbox(): Promise<MailboxInfo> {
      return { email: account.email, name: account.displayName, connector: "gmail" };
    },
    async listThreads(folder: MailViewId, query: ThreadListQuery = {}): Promise<ThreadListPage> {
      const { client, storage } = getBackend();
      if (folder.startsWith("collection:")) {
        // Tag/collection view: filter all threads by tag in memory.
        const collectionId = folder.slice("collection:".length);
        const threads = client.listThreads(id, { limit: 500, offset: 0 });
        const items = threads
          .map((thread) => {
            const { messages } = client.getThread(thread.id);
            return threadToView(thread, messages, folder);
          })
          .filter((thread) => thread.collectionIds?.includes(collectionId));
        return pageThreads(items, query);
      }
      const storageFolder = storageFolderForView(folder);
      if (query.q?.trim()) {
        const results = client.search(id, { q: query.q.trim(), limit: 500 });
        const byThread = new Map<number, typeof results.messages>();
        for (const message of results.messages) {
          if (message.threadId == null) continue;
          const list = byThread.get(message.threadId) ?? [];
          list.push(message);
          byThread.set(message.threadId, list);
        }
        const items = [...byThread.entries()].map(([threadId, messages]) => {
          const thread = storage.getThread(threadId);
          if (!thread) return null;
          return threadToView(thread, messages, folder);
        }).filter((thread) => thread !== null);
        return pageThreads(items, { ...query, limit: query.limit ?? 50, offset: query.offset ?? 0 });
      }
      const limit = query.limit ?? 50;
      const offset = query.offset ?? 0;
      const threads = client.listThreads(id, {
        limit,
        offset,
        folder: storageFolder ?? undefined,
      });
      const items = threads.map((thread) => {
        const { messages } = client.getThread(thread.id);
        return threadToView(thread, messages, folder);
      });
      const total = storage.countThreads(id, storageFolder ?? undefined);
      const unread = items.filter((thread) => thread.unread).length;
      return {
        threads: pageThreads(items, query).threads,
        total,
        unread,
        hasMore: offset + items.length < total || storage.hasOlderMail(id),
      };
    },
    async getThread(threadId: string): Promise<ThreadDetail | null> {
      const { client } = getBackend();
      const numeric = Number(threadId);
      if (!Number.isInteger(numeric) || numeric <= 0) return null;
      try {
        const { thread, messages } = client.getThread(numeric);
        // Preserve originating folder context at the route level; the detail
        // itself is folder-agnostic.
        return storedThreadToDetail(thread, messages, "inbox");
      } catch {
        return null;
      }
    },
    async getFolderCounts(): Promise<FolderCounts> {
      const { storage } = getBackend();
      const counts = {} as FolderCounts;
      for (const def of FOLDER_DEFS) {
        counts[def.id as MailFolderId] =
          def.storageFolder === null
            ? storage.countThreads(id, undefined)
            : storage.countThreads(id, def.storageFolder);
      }
      return counts;
    },
    async listCollections(): Promise<MailCollection[]> {
      const { storage } = getBackend();
      return storage.listTags(id).map((tag) => ({
        id: String(tag.id),
        name: tag.name,
        kind: "label" as const,
        color: tag.color ?? undefined,
      }));
    },
    async setThreadUnread(threadId: string, unread: boolean): Promise<boolean> {
      const { client } = getBackend();
      let thread;
      try {
        thread = client.getThread(Number(threadId));
      } catch {
        return false;
      }
      for (const message of thread.messages) {
        if (unread) await client.markUnread(message.id);
        else await client.markRead(message.id);
      }
      return true;
    },
    async setThreadStarred(threadId: string, starred: boolean): Promise<boolean> {
      const { client } = getBackend();
      let thread;
      try {
        thread = client.getThread(Number(threadId));
      } catch {
        return false;
      }
      const latest = thread.messages[thread.messages.length - 1];
      if (!latest) return false;
      if (starred) await client.star(latest.id);
      else await client.unstar(latest.id);
      return true;
    },
    async archiveThread(threadId: string): Promise<boolean> {
      const { client } = getBackend();
      let thread;
      try {
        thread = client.getThread(Number(threadId));
      } catch {
        return false;
      }
      for (const message of thread.messages) {
        await client.move(message.id, "[Gmail]/All Mail");
      }
      return true;
    },
    async moveThread(threadId: string, destination): Promise<boolean> {
      const { client } = getBackend();
      let thread;
      try {
        thread = client.getThread(Number(threadId));
      } catch {
        return false;
      }
      const folder =
        destination === "inbox"
          ? "INBOX"
          : destination === "spam"
            ? "[Gmail]/Spam"
            : "[Gmail]/Trash";
      for (const message of thread.messages) {
        await client.move(message.id, folder);
      }
      return true;
    },
    async send(input: ComposeInput) {
      const { client } = getBackend();
      const result = await client.send({
        accountId: id,
        to: splitAddresses(input.to),
        cc: splitAddresses(input.cc),
        bcc: splitAddresses(input.bcc),
        subject: input.subject,
        text: input.text,
        html: input.html,
        inReplyTo: input.inReplyTo,
      });
      return {
        id: result.messageId,
        threadId: input.threadId ?? result.messageId,
        sentAt: new Date().toISOString(),
      };
    },
    async saveDraft(input: DraftInput) {
      const { client } = getBackend();
      const result = await client.saveDraft({
        accountId: id,
        to: splitAddresses(input.to),
        cc: splitAddresses(input.cc),
        bcc: splitAddresses(input.bcc),
        subject: input.subject,
        text: input.text,
        html: input.html,
        inReplyTo: input.inReplyTo,
      });
      return { id: result.folder };
    },
  };
}
