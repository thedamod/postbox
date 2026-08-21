import type {
  AddressInput,
  EmailAccount,
  EmailFolder,
  FetchedMessage,
} from "./types";

/**
 * The provider boundary.
 *
 * Implementations (e.g. `providers/gmail`) speak to a concrete backend
 * (Gmail IMAP/SMTP). Everything above the provider layer only ever sees this
 * interface plus the types in `types.ts`.
 */

export type OutgoingAttachment =
  | {
      filename?: string;
      contentType?: string;
      content?: string | Uint8Array;
      contentId?: string;
    }
  | {
      filename?: string;
      path?: string;
    };

export type SendOptions = {
  to: AddressInput[];
  cc?: AddressInput[];
  bcc?: AddressInput[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutgoingAttachment[];
};

export type SendResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

export type FetchOptions = {
  path: string;
  /** Only fetch messages with UID greater than this value. */
  sinceUid?: number;
  /** Full sync of the mailbox (ignores sinceUid, bounded by `limit`). */
  full?: boolean;
  /** Max messages to fetch during a full sync. */
  limit?: number;
  /** Fetch a batch of messages with UID lower than this value (older mail). */
  olderThanUid?: number;
  /**
   * Fetch headers/envelope/flags only, skipping the raw RFC822 source.
   * Defaults to `true`. Use `false` for a cheap metadata pass, then call
   * `fetchSources` for just the messages you actually need to store.
   */
  includeSource?: boolean;
};

/** Raw RFC822 source for a single message, keyed by UID. */
export type FetchedSource = {
  uid: number;
  /** Raw RFC822 source, present when requested. */
  source: Uint8Array;
};

export type FetchResult = {
  messages: FetchedMessage[];
  /** Number of messages in the mailbox at fetch time. */
  exists: number;
  /** Mailbox UIDVALIDITY; changes mean the mailbox was reset. */
  uidValidity: bigint | null;
  /** Highest UID seen in this fetch (0 when the mailbox is empty). */
  lastUid: number;
};

export type SetFlagsInput = {
  path: string;
  uid: number;
  add?: string[];
  remove?: string[];
};

export type MoveMessageInput = {
  path: string;
  uid: number;
  destination: string;
};

export interface ProviderSession {
  readonly provider: string;
  readonly account: EmailAccount;

  connect(): Promise<void>;

  /** List folders (mailboxes) available on the account. */
  listFolders(): Promise<EmailFolder[]>;

  /**
   * Fetch raw messages from a mailbox. The session must have a mailbox open
   * or open one itself.
   */
  fetchMailbox(opts: FetchOptions): Promise<FetchResult>;

  /**
   * Download the raw RFC822 source for specific UIDs, used after a
   * metadata-only `fetchMailbox` pass to fetch bodies for new messages only.
   */
  fetchSources(opts: { path: string; uids: number[] }): Promise<FetchedSource[]>;

  /** Set/unset IMAP flags (e.g. `\Seen`, `\Starred`) on a message. */
  setMessageFlags(opts: SetFlagsInput): Promise<void>;

  /** Move a message to another mailbox, preserving provider state. */
  moveMessage(opts: MoveMessageInput): Promise<void>;

  /** Append a raw RFC822 message to a mailbox (used for drafts). */
  append(path: string, raw: string | Uint8Array, flags?: string[]): Promise<void>;

  logout(): Promise<void>;
}

export interface MailProvider {
  readonly name: string;

  open(account: EmailAccount): ProviderSession;

  /** Send a message for an account. */
  send(account: EmailAccount, opts: SendOptions): Promise<SendResult>;

  /** Build the raw RFC822 message without sending it (used for drafts). */
  buildRaw(account: EmailAccount, opts: SendOptions): Promise<Uint8Array>;
}
