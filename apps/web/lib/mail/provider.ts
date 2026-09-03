import type {
  ComposeInput,
  DraftInput,
  FolderCounts,
  MailAccount,
  MailboxInfo,
  MailCollection,
  MailViewId,
  SendResult,
  ThreadDetail,
  ThreadListPage,
  ThreadListQuery,
} from "./types";

/**
 * Provider-neutral mail contract for the frontend: routes and components
 * program against this interface, and `getMailProvider()` resolves the
 * storage-backed implementation. Domain administration is out of scope.
 */
export interface MailProvider {
  readonly account: MailAccount;
  getMailbox(): Promise<MailboxInfo>;
  listThreads(folder: MailViewId, query?: ThreadListQuery): Promise<ThreadListPage>;
  getThread(id: string): Promise<ThreadDetail | null>;
  getFolderCounts(): Promise<FolderCounts>;
  listCollections(): Promise<MailCollection[]>;
  setThreadUnread(id: string, unread: boolean): Promise<boolean>;
  setThreadStarred(id: string, starred: boolean): Promise<boolean>;
  archiveThread(id: string, fromFolder: MailViewId): Promise<boolean>;
  moveThread(
    id: string,
    destination: "inbox" | "spam" | "trash",
    fromFolder: MailViewId,
  ): Promise<boolean>;
  send(input: ComposeInput): Promise<SendResult>;
  saveDraft(input: DraftInput): Promise<{ id: string }>;
}
