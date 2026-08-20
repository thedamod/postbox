/**
 * Provider-agnostic email domain types.
 *
 * This module is the contract everything in the email client (and both apps)
 * works against. It must stay free of runtime dependencies so it can be
 * imported from React Native, the web, or a Node backend alike.
 */

export type Address = {
  name?: string;
  address: string;
};

export type AddressInput = string | Address;

export type EmailAccount = {
  id: number;
  provider: string;
  email: string;
  displayName?: string | null;
  /** Google profile image URL, when the account was connected with OAuth. */
  picture?: string | null;
  refreshToken: string;
  createdAt: string;
};

export type EmailFolder = {
  path: string;
  name: string;
  specialUse?: string | null;
  total?: number;
};

export type MessageFlags = {
  seen: boolean;
  starred: boolean;
  draft: boolean;
  sent: boolean;
};

export type EmailAttachment = {
  /** Local database id (present once stored). */
  id?: number;
  /** Provider-specific attachment/part identifier (IMAP body part, Gmail attachmentId). */
  providerPart?: string;
  filename?: string;
  contentType?: string;
  contentId?: string;
  size?: number;
  isInline?: boolean;
  /** Location hint for the stored copy; the AttachmentStore owns the bytes. */
  localPath?: string;
};

export type EmailAttachmentData = EmailAttachment & {
  /** Raw bytes. `Uint8Array` keeps the domain contract React Native-safe;
   * Node implementations pass `Buffer` (a `Uint8Array` subclass). */
  content?: Uint8Array;
};

/** A message as understood by the mail layer (persisted shape). */
export type StoredMessage = {
  id: number;
  accountId: number;
  threadId: number | null;
  providerUid?: number | null;
  messageId?: string | null;
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
  folder: string;
  flags: MessageFlags;
  size?: number | null;
  snippet?: string | null;
  createdAt: string;
  attachments: EmailAttachment[];
  tags?: string[];
};

export type StoredThread = {
  id: number;
  accountId: number;
  providerThreadId: string;
  subject: string;
  lastMessageAt: string | null;
  snippet: string | null;
  messageCount?: number;
  unreadCount?: number;
  /** Sender of the most recent message (drives avatars). */
  lastFrom?: Address[];
};

/** Result of a provider folder scan: raw messages the mail layer parses. */
export type FetchedMessage = {
  uid: number;
  path: string;
  flags: string[];
  providerThreadId?: string;
  labels: string[];
  size?: number;
  internalDate?: Date;
  /** Raw RFC822 source. Absent when a metadata-only fetch was requested. */
  source?: Uint8Array;
  /** Message-ID header (from the IMAP envelope, pre-parse) used for dedupe. */
  messageId?: string;
};
