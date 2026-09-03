/**
 * Provider-neutral mail types for the web frontend.
 *
 * Frontend mail types: views, threads,
 * messages, queries, and accounts are expressed in frontend terms so routes,
 * loaders, and components never depend on a specific mail engine. Adapters in
 * `./adapters` translate `StoredThread` / `StoredMessage` from
 * `@postbox/email-client` into these shapes.
 */

export type MailFolderId =
  | "inbox"
  | "starred"
  | "sent"
  | "drafts"
  | "all"
  | "spam"
  | "trash"
  | "archived";

export type MailCollectionViewId = `collection:${string}`;
export type MailViewId = MailFolderId | MailCollectionViewId;

export type MailCollectionKind = "folder" | "label";

export type MailCollection = {
  id: string;
  name: string;
  kind: MailCollectionKind;
  color?: string;
  total?: number;
  unread?: number;
};

export type MailConnectorId = "gmail";

export type MailCapability =
  | "read"
  | "send"
  | "drafts"
  | "markUnread"
  | "star"
  | "archive"
  | "spam"
  | "trash"
  | "attachments"
  | "collections"
  | "sort";

export type MailAccount = {
  id: string;
  connector: MailConnectorId;
  email: string;
  displayName: string;
  image?: string | null;
  status: "connected";
  capabilities: MailCapability[];
  syncRevision: number;
};

export type Address = {
  name: string;
  email: string;
};

export type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  inline?: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  bcc?: Address[];
  date: string;
  subject: string;
  snippet: string;
  text?: string;
  html?: string | null;
  attachments: Attachment[];
  unread: boolean;
  starred: boolean;
};

export type Thread = {
  id: string;
  folder: MailFolderId | string;
  subject: string;
  from: Address;
  snippet: string;
  date: string;
  unread: boolean;
  favorite?: boolean;
  collectionIds?: string[];
  hasAttachment?: boolean;
  messageCount: number;
};

export type ThreadSort = "date" | "from" | "subject";

export type ThreadListQuery = {
  q?: string;
  unread?: boolean;
  hasAttachment?: boolean;
  sort?: ThreadSort;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type ThreadListPage = {
  threads: Thread[];
  total: number;
  unread: number;
  hasMore: boolean;
};

export type FolderCounts = Record<MailFolderId, number>;

export type ThreadDetail = Thread & {
  messages: Message[];
};

export type ComposeInput = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  threadId?: string;
  draftId?: string;
};

export type DraftInput = Omit<ComposeInput, "draftId"> & {
  id?: string;
};

export type SendResult = {
  id: string;
  threadId: string;
  sentAt: string;
};

export type MailboxInfo = {
  email: string;
  name: string;
  connector?: MailConnectorId;
};
