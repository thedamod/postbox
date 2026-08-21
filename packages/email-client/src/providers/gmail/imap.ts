import { ImapFlow, type FetchMessageObject } from "imapflow";

import type { AuthProvider } from "../../auth";
import type {
  EmailAccount,
  EmailFolder,
  FetchedMessage,
} from "../../types";
import type {
  FetchOptions,
  FetchResult,
  FetchedSource,
  MoveMessageInput,
  ProviderSession,
  SetFlagsInput,
} from "../../provider";

type FetchedMessageObject = FetchMessageObject & {
  threadId?: string;
  labels?: Set<string>;
};

export class GmailImapSession implements ProviderSession {
  readonly provider = "gmail";
  readonly account: EmailAccount;

  private client?: ImapFlow;
  private lock?: { release: () => void };

  constructor(account: EmailAccount, private auth: AuthProvider) {
    this.account = account;
  }

  private getClient(): ImapFlow {
    if (!this.client) {
      throw new Error("Gmail IMAP session is not connected.");
    }
    return this.client;
  }

  async connect() {
    const accessToken = await this.auth.getAccessToken(this.account);

    this.client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      logger: false,
      auth: {
        user: this.account.email,
        accessToken,
      },
    });

    await this.client.connect();
  }

  async listFolders(): Promise<EmailFolder[]> {
    const client = this.getClient();
    const list = await client.list();

    const folders: EmailFolder[] = [];

    for (const mbox of list) {
      folders.push({
        path: mbox.path,
        name: mbox.path.split(mbox.delimiter ?? "/").pop() ?? mbox.path,
        specialUse: mbox.specialUse ?? null,
      });
    }

    return folders;
  }

  private async openMailbox(path: string): Promise<{ release: () => void }> {
    const client = this.getClient();
    this.lock = await client.getMailboxLock(path);
    return this.lock;
  }

  async fetchMailbox(opts: FetchOptions): Promise<FetchResult> {
    const client = this.getClient();
    const lock = await this.openMailbox(opts.path);

    try {
      const mailbox = client.mailbox;

      if (!mailbox) {
        throw new Error(`Mailbox "${opts.path}" is not available.`);
      }

      const exists = mailbox.exists;
      const uidValidity = mailbox.uidValidity ?? null;

      if (exists === 0) {
        return { messages: [], exists: 0, uidValidity, lastUid: 0 };
      }

      const full = opts.full || !opts.sinceUid;
      const limit = Math.max(opts.limit ?? 2000, 1);

      let range: string;
      let uidMode: boolean;

      if (opts.full) {
        // Sequence range of the most recent `limit` messages.
        const start = Math.max(1, exists - limit + 1);
        range = `${start}:*`;
        uidMode = false;
      } else if (opts.olderThanUid != null) {
        // A UID window just below the older-mail frontier.
        const hi = opts.olderThanUid - 1;
        const lo = Math.max(1, hi - limit + 1);
        range = `${lo}:${hi}`;
        uidMode = true;
      } else {
        range = `${opts.sinceUid! + 1}:*`;
        uidMode = true;
      }

      const includeSource = opts.includeSource !== false;

      const query = {
        uid: true,
        flags: true,
        size: true,
        envelope: true,
        internalDate: true,
        threadId: true,
        labels: true,
        ...(includeSource ? { source: true } : {}),
      };

      const raw = uidMode
        ? await client.fetchAll(range, query, { uid: true })
        : await client.fetchAll(range, query);

      const messages: FetchedMessage[] = [];

      let lastUid = opts.full ? 0 : (opts.sinceUid ?? 0);

      for (const message of raw) {
        lastUid = Math.max(lastUid, message.uid);

        const typed = message as FetchedMessageObject;

        messages.push({
          uid: message.uid,
          path: opts.path,
          flags: [...(message.flags ?? [])],
          providerThreadId: typed.threadId
            ? String(typed.threadId)
            : undefined,
          labels: typed.labels ? [...typed.labels] : [],
          size: message.size,
          internalDate:
            typeof message.internalDate === "string"
              ? new Date(message.internalDate)
              : message.internalDate,
          messageId: message.envelope?.messageId
            ? message.envelope.messageId.replace(/[<>]/g, "").trim() || undefined
            : undefined,
          source: includeSource ? message.source : undefined,
        });
      }

      return { messages, exists, uidValidity, lastUid };
    } finally {
      lock.release();
      this.lock = undefined;
    }
  }

  async fetchSources(opts: { path: string; uids: number[] }): Promise<FetchedSource[]> {
    const client = this.getClient();
    const lock = await this.openMailbox(opts.path);

    try {
      if (opts.uids.length === 0) return [];

      const raw = await client.fetchAll(opts.uids, { source: true }, { uid: true });

      return raw
        .filter((message) => message.source != null)
        .map((message) => ({ uid: message.uid, source: message.source! }));
    } finally {
      lock.release();
      this.lock = undefined;
    }
  }

  async setMessageFlags(opts: SetFlagsInput) {
    const client = this.getClient();
    const lock = await this.openMailbox(opts.path);

    try {
      if (opts.add?.length) {
        await client.messageFlagsAdd([opts.uid], opts.add, { uid: true });
      }

      if (opts.remove?.length) {
        await client.messageFlagsRemove([opts.uid], opts.remove, { uid: true });
      }
    } finally {
      lock.release();
      this.lock = undefined;
    }
  }

  async moveMessage(opts: MoveMessageInput) {
    const client = this.getClient();
    const lock = await this.openMailbox(opts.path);

    try {
      await client.messageMove([opts.uid], opts.destination, { uid: true });
    } finally {
      lock.release();
      this.lock = undefined;
    }
  }

  async append(path: string, raw: string | Buffer, flags: string[] = []) {
    const client = this.getClient();
    await client.append(path, raw, flags);
  }

  async logout() {
    if (this.lock) {
      this.lock.release();
      this.lock = undefined;
    }

    if (this.client) {
      await this.client.logout();
      this.client = undefined;
    }
  }
}
