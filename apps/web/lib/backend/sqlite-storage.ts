import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AttachmentStore,
  EmailStorage,
  OutgoingMessageInput,
  SearchIndexResult,
  SyncState,
  ThreadListOptions,
  UpsertMessageInput,
  UpsertOptions,
} from "@postbox/email-client";
import type {
  Address,
  EmailAccount,
  EmailAttachment,
  StoredMessage,
  StoredThread,
} from "@postbox/email-client";
import type { Tag } from "@postbox/email-client";
import type { TagRule } from "@postbox/email-client";

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "mail.db");
const ATTACHMENTS_DIR = join(DATA_DIR, "attachments");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  picture TEXT,
  refresh_token TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  provider_uid INTEGER,
  message_id TEXT,
  thread_id INTEGER,
  provider_thread_id TEXT,
  in_reply_to TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  from_json TEXT NOT NULL DEFAULT '[]',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  reply_to_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL,
  text TEXT,
  html TEXT,
  date TEXT,
  size INTEGER,
  seen INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  snippet TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (account_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_account_folder ON messages(account_id, folder, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_header ON messages(account_id, message_id);

CREATE TABLE IF NOT EXISTS message_folders (
  message_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  PRIMARY KEY (message_id, folder)
);

CREATE INDEX IF NOT EXISTS idx_message_folders_account_folder
  ON message_folders(account_id, folder, message_id);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  provider_part TEXT,
  filename TEXT,
  content_type TEXT,
  content_id TEXT,
  size INTEGER,
  is_inline INTEGER NOT NULL DEFAULT 0,
  part_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id INTEGER NOT NULL,
  folder TEXT NOT NULL,
  last_uid INTEGER NOT NULL DEFAULT 0,
  uidvalidity INTEGER,
  last_sync_at TEXT,
  min_uid INTEGER,
  PRIMARY KEY (account_id, folder)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_tags (
  message_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  source TEXT,
  confidence REAL,
  PRIMARY KEY (message_id, tag_id)
);

CREATE TABLE IF NOT EXISTS tag_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  subject,
  from_json,
  to_json,
  snippet,
  text
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const nowIso = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value);

type MessageRow = {
  id: number;
  account_id: number;
  folder: string;
  provider_uid: number | null;
  message_id: string | null;
  thread_id: number | null;
  provider_thread_id: string | null;
  in_reply_to: string | null;
  references_json: string;
  from_json: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  reply_to_json: string;
  subject: string;
  text: string | null;
  html: string | null;
  date: string | null;
  size: number | null;
  seen: number;
  starred: number;
  draft: number;
  sent: number;
  snippet: string | null;
  created_at: string;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function messageFromRow(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    accountId: row.account_id,
    threadId: row.thread_id,
    providerUid: row.provider_uid,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    references: parseJson<string[]>(row.references_json, []),
    from: parseJson<Address[]>(row.from_json, []),
    to: parseJson<Address[]>(row.to_json, []),
    cc: parseJson<Address[]>(row.cc_json, []),
    bcc: parseJson<Address[]>(row.bcc_json, []),
    replyTo: parseJson<Address[]>(row.reply_to_json, []),
    subject: row.subject,
    text: row.text,
    html: row.html,
    date: row.date,
    folder: row.folder,
    flags: {
      seen: row.seen === 1,
      starred: row.starred === 1,
      draft: row.draft === 1,
      sent: row.sent === 1,
    },
    size: row.size,
    snippet: row.snippet,
    createdAt: row.created_at,
    attachments: [],
  };
}

function messageColumns(input: UpsertMessageInput | OutgoingMessageInput) {
  return {
    folder: input.folder,
    provider_uid: "providerUid" in input ? input.providerUid ?? null : null,
    message_id: "messageId" in input ? input.messageId ?? null : null,
    thread_id: "threadId" in input ? input.threadId ?? null : null,
    provider_thread_id: "providerThreadId" in input ? input.providerThreadId ?? null : null,
    in_reply_to: input.inReplyTo ?? null,
    references_json: json(input.references),
    from_json: json(input.from),
    to_json: json(input.to),
    cc_json: json(input.cc),
    bcc_json: json(input.bcc),
    reply_to_json: json(input.replyTo),
    subject: input.subject,
    text: input.text ?? null,
    html: input.html ?? null,
    date: "date" in input && input.date ? input.date : null,
    size: "size" in input ? input.size ?? null : null,
    seen: (input.flags?.seen ?? false) ? 1 : 0,
    starred: (input.flags?.starred ?? false) ? 1 : 0,
    draft: (input.flags?.draft ?? false) ? 1 : 0,
    sent: (input.flags?.sent ?? false) ? 1 : 0,
    snippet: "snippet" in input ? input.snippet ?? null : null,
  };
}

function attachmentPath(messageId: number, attachmentId: number): string {
  return join(ATTACHMENTS_DIR, String(messageId), String(attachmentId));
}

/** Node backend: SQLite {@link EmailStorage} + filesystem {@link AttachmentStore}. */
export class NodeMailStorage implements EmailStorage, AttachmentStore {
  private db: DatabaseSync;

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true });
    mkdirSync(ATTACHMENTS_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec(SCHEMA);
    this.migrate();
  }

  private migrate(): void {
    const accountColumns = this.db.prepare(`PRAGMA table_info(accounts)`).all() as unknown as Array<{ name: string }>;
    if (!accountColumns.some((column) => column.name === "picture")) {
      this.db.exec(`ALTER TABLE accounts ADD COLUMN picture TEXT`);
    }
    const columns = this.db.prepare(`PRAGMA table_info(sync_state)`).all() as unknown as Array<{
      name: string;
    }>;

    if (!columns.some((column) => column.name === "min_uid")) {
      this.db.exec(`ALTER TABLE sync_state ADD COLUMN min_uid INTEGER`);
    }

    this.db.exec(
      `INSERT OR IGNORE INTO message_folders (message_id, account_id, folder)
       SELECT id, account_id, folder FROM messages WHERE folder IS NOT NULL`,
    );
    this.db.exec(`UPDATE messages SET thread_id = id WHERE thread_id IS NULL`);
  }

  // ------------------------------------------------------------ accounts

  listAccounts(): EmailAccount[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider, email, display_name, picture, refresh_token, created_at
         FROM accounts ORDER BY id ASC`,
      )
      .all() as unknown as Array<{
      id: number;
      provider: string;
      email: string;
      display_name: string | null;
      picture: string | null;
      refresh_token: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      email: row.email,
      displayName: row.display_name,
      picture: row.picture,
      refreshToken: row.refresh_token,
      createdAt: row.created_at,
    }));
  }

  getAccount(id: number): EmailAccount | null {
    const row = this.db
      .prepare(
        `SELECT id, provider, email, display_name, picture, refresh_token, created_at
         FROM accounts WHERE id = ?`,
      )
      .get(id) as unknown as
      | {
          id: number;
          provider: string;
          email: string;
          display_name: string | null;
          picture: string | null;
          refresh_token: string;
          created_at: string;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      provider: row.provider,
      email: row.email,
      displayName: row.display_name,
      picture: row.picture,
      refreshToken: row.refresh_token,
      createdAt: row.created_at,
    };
  }

  addAccount(input: {
    provider: string;
    email: string;
    displayName?: string | null;
    picture?: string | null;
    refreshToken: string;
  }): EmailAccount {
    const result = this.db
      .prepare(
        `INSERT INTO accounts (provider, email, display_name, picture, refresh_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.provider, input.email, input.displayName ?? null, input.picture ?? null, input.refreshToken, nowIso());

    const account = this.getAccount(Number(result.lastInsertRowid));
    if (!account) throw new Error("Failed to create account.");
    return account;
  }

  updateAccount(id: number, patch: { displayName?: string | null; picture?: string | null }): void {
    this.db
      .prepare(`UPDATE accounts SET display_name = ?, picture = ? WHERE id = ?`)
      .run(patch.displayName ?? null, patch.picture ?? null, id);
  }

  /** Replace the OAuth refresh token after a re-auth (and optionally the display name). */
  updateAccountToken(
    id: number,
    patch: { refreshToken: string; displayName?: string | null; picture?: string | null },
  ): void {
    this.db
      .prepare(`UPDATE accounts SET refresh_token = ?, display_name = ?, picture = ? WHERE id = ?`)
      .run(patch.refreshToken, patch.displayName ?? null, patch.picture ?? null, id);
  }

  removeAccount(id: number): void {
    this.transaction(() => {
      const attachments = this.db
        .prepare(
          `SELECT a.id, a.message_id FROM attachments a
           JOIN messages m ON m.id = a.message_id WHERE m.account_id = ?`,
        )
        .all(id) as unknown as Array<{ id: number; message_id: number }>;

      for (const attachment of attachments) {
        try {
          rmSync(attachmentPath(attachment.message_id, attachment.id), { force: true });
        } catch {
          // ignore
        }
      }

      this.db
        .prepare(`DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`)
        .run(id);
      this.db
        .prepare(`DELETE FROM message_tags WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`)
        .run(id);
      this.db
        .prepare(`DELETE FROM messages_fts WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`)
        .run(id);
      this.db.prepare(`DELETE FROM message_folders WHERE account_id = ?`).run(id);
      this.db.prepare(`DELETE FROM messages WHERE account_id = ?`).run(id);
      this.db.prepare(`DELETE FROM sync_state WHERE account_id = ?`).run(id);
      this.db.prepare(`DELETE FROM tag_rules WHERE account_id = ?`).run(id);
      this.db
        .prepare(`DELETE FROM message_tags WHERE tag_id IN (SELECT id FROM tags WHERE account_id = ?)`)
        .run(id);
      this.db.prepare(`DELETE FROM tags WHERE account_id = ?`).run(id);
      this.db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
    });
  }

  // ------------------------------------------------------------ sync state

  getSyncState(accountId: number, folder: string): SyncState | null {
    const row = this.db
      .prepare(
        `SELECT last_uid, uidvalidity, last_sync_at, min_uid FROM sync_state
         WHERE account_id = ? AND folder = ?`,
      )
      .get(accountId, folder) as unknown as
      | {
          last_uid: number;
          uidvalidity: number | null;
          last_sync_at: string | null;
          min_uid: number | null;
        }
      | undefined;

    if (!row) return null;

    return {
      accountId,
      folder,
      lastUid: row.last_uid,
      uidvalidity: row.uidvalidity,
      lastSyncAt: row.last_sync_at,
      minUid: row.min_uid,
    };
  }

  saveSyncState(state: SyncState): void {
    this.db
      .prepare(
        `INSERT INTO sync_state (account_id, folder, last_uid, uidvalidity, last_sync_at, min_uid)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, folder) DO UPDATE SET
           last_uid = excluded.last_uid,
           uidvalidity = excluded.uidvalidity,
           last_sync_at = excluded.last_sync_at,
           min_uid = excluded.min_uid`,
      )
      .run(
        state.accountId,
        state.folder,
        state.lastUid,
        state.uidvalidity,
        state.lastSyncAt,
        state.minUid,
      );
  }

  clearSyncState(accountId: number, folder: string): void {
    this.db.prepare(`DELETE FROM sync_state WHERE account_id = ? AND folder = ?`).run(accountId, folder);
  }

  // ------------------------------------------------------------- messages

  getMessage(id: number): StoredMessage | null {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as unknown as
      | MessageRow
      | undefined;

    if (!row) return null;

    const message = messageFromRow(row);
    message.attachments = this.listAttachmentsForMessage(id);
    message.tags = this.tagsForMessage(id).map((tag) => tag.name);
    return message;
  }

  getMessages(ids: number[]): StoredMessage[] {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE id IN (${placeholders})`)
      .all(...ids) as unknown as MessageRow[];

    return rows.map(messageFromRow);
  }

  getMessageByProviderUid(accountId: number, folder: string, providerUid: number): StoredMessage | null {
    const row = this.db
      .prepare(`SELECT * FROM messages WHERE account_id = ? AND folder = ? AND provider_uid = ?`)
      .get(accountId, folder, providerUid) as unknown as MessageRow | undefined;

    if (!row) return null;
    return this.getMessage(row.id);
  }

  findMessageIdByHeader(accountId: number, messageId: string): number | null {
    const row = this.db
      .prepare(`SELECT id FROM messages WHERE account_id = ? AND message_id = ? LIMIT 1`)
      .get(accountId, messageId) as unknown as { id: number } | undefined;

    return row?.id ?? null;
  }

  findThreadIdByMessageHeader(accountId: number, messageId: string): number | null {
    const row = this.db
      .prepare(
        `SELECT thread_id FROM messages WHERE account_id = ? AND message_id = ?
         AND thread_id IS NOT NULL LIMIT 1`,
      )
      .get(accountId, messageId) as unknown as { thread_id: number | null } | undefined;

    return row?.thread_id ?? null;
  }

  updateFlagsIfChanged(messageId: number, flags: { seen: boolean; starred: boolean }): void {
    this.db
      .prepare(`UPDATE messages SET seen = ?, starred = ? WHERE id = ?`)
      .run(flags.seen ? 1 : 0, flags.starred ? 1 : 0, messageId);
  }

  setMessageFlag(messageId: number, flag: "seen" | "starred", value: boolean): void {
    this.db.prepare(`UPDATE messages SET ${flag} = ? WHERE id = ?`).run(value ? 1 : 0, messageId);
  }

  setMessageFolder(messageId: number, folder: string): void {
    this.db.prepare(`UPDATE messages SET folder = ? WHERE id = ?`).run(folder, messageId);
  }

  addMessageFolder(messageId: number, accountId: number, folder: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO message_folders (message_id, account_id, folder) VALUES (?, ?, ?)`)
      .run(messageId, accountId, folder);
  }

  moveMessageFolder(messageId: number, accountId: number, from: string, to: string): void {
    this.transaction(() => {
      this.db
        .prepare(`DELETE FROM message_folders WHERE message_id = ? AND account_id = ? AND folder = ?`)
        .run(messageId, accountId, from);
      this.db
        .prepare(`INSERT OR IGNORE INTO message_folders (message_id, account_id, folder) VALUES (?, ?, ?)`)
        .run(messageId, accountId, to);
      this.db.prepare(`UPDATE messages SET folder = ? WHERE id = ?`).run(to, messageId);
    });
  }

  async upsertMessage(input: UpsertMessageInput, opts?: UpsertOptions): Promise<number> {
    const existing = input.messageId
      ? (this.db
          .prepare(`SELECT id FROM messages WHERE account_id = ? AND message_id = ? LIMIT 1`)
          .get(input.accountId, input.messageId) as unknown as { id: number } | undefined)
      : null;

    if (existing) {
      const id = existing.id;
      const c = messageColumns(input);

      this.db
        .prepare(
          `UPDATE messages SET
            folder = ?, provider_uid = ?, message_id = ?, provider_thread_id = ?, in_reply_to = ?,
            references_json = ?, from_json = ?, to_json = ?, cc_json = ?, bcc_json = ?, reply_to_json = ?,
            subject = ?, text = ?, html = ?, date = ?, size = ?, seen = ?, starred = ?, draft = ?, sent = ?,
            snippet = ?
           WHERE id = ?`,
        )
        .run(
          c.folder,
          c.provider_uid,
          c.message_id,
          c.provider_thread_id,
          c.in_reply_to,
          c.references_json,
          c.from_json,
          c.to_json,
          c.cc_json,
          c.bcc_json,
          c.reply_to_json,
          c.subject,
          c.text,
          c.html,
          c.date,
          c.size,
          c.seen,
          c.starred,
          c.draft,
          c.sent,
          c.snippet,
          id,
        );

      if (opts?.afterWrite) opts.afterWrite(id);
      this.indexMessage(id, input);
      this.addMessageFolder(id, input.accountId, c.folder);
      return id;
    }

    let threadId: number | null = null;

    if (input.providerThreadId) {
      const group = this.db
        .prepare(`SELECT MIN(id) AS id FROM messages WHERE account_id = ? AND provider_thread_id = ?`)
        .get(input.accountId, input.providerThreadId) as unknown as { id: number | null } | undefined;
      threadId = group?.id ?? null;
    }

    const c = messageColumns(input);
    const result = this.db
      .prepare(
        `INSERT INTO messages (
          account_id, folder, provider_uid, message_id, thread_id, provider_thread_id, in_reply_to,
          references_json, from_json, to_json, cc_json, bcc_json, reply_to_json,
          subject, text, html, date, size, seen, starred, draft, sent, snippet, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.accountId,
        c.folder,
        c.provider_uid,
        c.message_id,
        threadId,
        c.provider_thread_id,
        c.in_reply_to,
        c.references_json,
        c.from_json,
        c.to_json,
        c.cc_json,
        c.bcc_json,
        c.reply_to_json,
        c.subject,
        c.text,
        c.html,
        c.date,
        c.size,
        c.seen,
        c.starred,
        c.draft,
        c.sent,
        c.snippet,
        nowIso(),
      );

    const id = Number(result.lastInsertRowid);

    if (input.providerThreadId) {
      this.db
        .prepare(`UPDATE messages SET thread_id = ? WHERE account_id = ? AND provider_thread_id = ?`)
        .run(id, input.accountId, input.providerThreadId);
    } else {
      this.db.prepare(`UPDATE messages SET thread_id = ? WHERE id = ?`).run(id, id);
    }

    this.addMessageFolder(id, input.accountId, c.folder);

    if (opts?.resolveAttachments) {
      const attachments = await opts.resolveAttachments(id);
      for (const attachment of attachments) {
        if (attachment.id == null) continue;
        this.db.prepare(`UPDATE attachments SET message_id = ? WHERE id = ?`).run(id, attachment.id);
      }
    }

    if (opts?.afterWrite) opts.afterWrite(id);
    this.indexMessage(id, input);

    return id;
  }

  insertOutgoingMessage(input: OutgoingMessageInput): number {
    const c = messageColumns(input);
    const result = this.db
      .prepare(
        `INSERT INTO messages (
          account_id, folder, message_id, thread_id, in_reply_to,
          references_json, from_json, to_json, cc_json, bcc_json, reply_to_json,
          subject, text, html, date, seen, starred, draft, sent, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.accountId,
        c.folder,
        c.message_id,
        c.thread_id,
        c.in_reply_to,
        c.references_json,
        c.from_json,
        c.to_json,
        c.cc_json,
        c.bcc_json,
        c.reply_to_json,
        c.subject,
        c.text,
        c.html,
        c.date,
        c.seen,
        c.starred,
        c.draft,
        c.sent,
        nowIso(),
      );

    const id = Number(result.lastInsertRowid);

    if (c.thread_id == null) {
      this.db.prepare(`UPDATE messages SET thread_id = ? WHERE id = ?`).run(id, id);
    }
    this.addMessageFolder(id, input.accountId, c.folder);

    if (input.messageId) {
      this.indexMessage(id, input);
    }

    return id;
  }

  listMessagesByThread(threadId: number): StoredMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC`)
      .all(threadId) as unknown as MessageRow[];

    return rows.map((row) => this.getMessage(row.id) ?? messageFromRow(row));
  }

  countMessagesByFolder(accountId: number, folder: string, opts?: { unreadOnly?: boolean }): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM messages m
         WHERE m.account_id = ? AND EXISTS (
           SELECT 1 FROM message_folders mf
           WHERE mf.message_id = m.id AND mf.account_id = m.account_id AND mf.folder = ?
         )
         ${opts?.unreadOnly ? "AND seen = 0" : ""}`,
      )
      .get(accountId, folder) as unknown as { count: number };

    return row.count;
  }

  // -------------------------------------------------------------- threads

  getThread(id: number): StoredThread | null {
    const row = this.db
      .prepare(
        `SELECT
           m.thread_id AS id,
           m.account_id,
           COUNT(*) AS message_count,
           SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END) AS unread_count,
           MAX(m.date) AS last_message_at,
           (SELECT s.subject FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS subject,
           (SELECT s.snippet FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS snippet,
           (SELECT s.from_json FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS last_from_json
         FROM messages m
         WHERE m.thread_id = ? AND m.thread_id IS NOT NULL
         GROUP BY m.thread_id`,
      )
      .get(id) as unknown as ThreadAggRow | undefined;

    return row ? threadFromRow(row) : null;
  }

  listThreads(accountId: number, opts?: ThreadListOptions): StoredThread[] {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const where = opts?.folder
      ? `WHERE m.account_id = ? AND m.thread_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM message_folders mf
           WHERE mf.message_id = m.id AND mf.account_id = m.account_id AND mf.folder = ?
         )`
      : `WHERE m.account_id = ? AND m.thread_id IS NOT NULL`;

    const params: Array<string | number> = opts?.folder ? [accountId, opts.folder] : [accountId];

    const rows = this.db
      .prepare(
        `SELECT
           m.thread_id AS id,
           m.account_id,
           COUNT(*) AS message_count,
           SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END) AS unread_count,
           MAX(m.date) AS last_message_at,
           (SELECT s.subject FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS subject,
           (SELECT s.snippet FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS snippet,
           (SELECT s.from_json FROM messages s WHERE s.thread_id = m.thread_id ORDER BY s.date DESC, s.id DESC LIMIT 1) AS last_from_json
         FROM messages m
         ${where}
         GROUP BY m.thread_id
         ORDER BY last_message_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as unknown as ThreadAggRow[];

    return rows.map(threadFromRow);
  }

  countThreads(accountId: number, folder?: string): number {
    const where = folder
      ? `WHERE account_id = ? AND thread_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM message_folders mf
           WHERE mf.message_id = messages.id AND mf.account_id = messages.account_id AND mf.folder = ?
         )`
      : `WHERE account_id = ? AND thread_id IS NOT NULL`;

    const params: Array<string | number> = folder ? [accountId, folder] : [accountId];

    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM (
           SELECT thread_id FROM messages ${where} GROUP BY thread_id
         )`,
      )
      .get(...params) as unknown as { count: number };

    return Number(row.count);
  }

  /** Whether any synced folder still has older mail left to load (frontier > 1). */
  hasOlderMail(accountId: number): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM sync_state WHERE account_id = ? AND min_uid > 1`,
      )
      .get(accountId) as unknown as { c: number };

    return Number(row.c) > 0;
  }

  // ------------------------------------------------ attachments (metadata)

  listAttachmentsForMessage(messageId: number): EmailAttachment[] {
    const rows = this.db
      .prepare(
        `SELECT id, provider_part, filename, content_type, content_id, size, is_inline
         FROM attachments WHERE message_id = ? ORDER BY part_index ASC`,
      )
      .all(messageId) as unknown as Array<{
      id: number;
      provider_part: string | null;
      filename: string | null;
      content_type: string | null;
      content_id: string | null;
      size: number | null;
      is_inline: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      providerPart: row.provider_part ?? undefined,
      filename: row.filename ?? undefined,
      contentType: row.content_type ?? undefined,
      contentId: row.content_id ?? undefined,
      size: row.size ?? undefined,
      isInline: row.is_inline === 1,
    }));
  }

  // ------------------------------------------------------------ AttachmentStore

  async save(
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
  ): Promise<EmailAttachment | null> {
    const result = this.db
      .prepare(
        `INSERT INTO attachments (message_id, provider_part, filename, content_type, content_id, size, is_inline, part_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        messageId,
        attachment.partId ?? null,
        attachment.filename ?? null,
        attachment.contentType ?? null,
        attachment.contentId ?? null,
        attachment.size ?? null,
        attachment.related || attachment.contentDisposition === "inline" ? 1 : 0,
        index,
      );

    const id = Number(result.lastInsertRowid);

    if (attachment.content) {
      const dir = join(ATTACHMENTS_DIR, String(messageId));
      mkdirSync(dir, { recursive: true });
      writeFileSync(attachmentPath(messageId, id), Buffer.from(attachment.content));
    }

    return {
      id,
      providerPart: attachment.partId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      contentId: attachment.contentId,
      size: attachment.size,
      isInline: Boolean(attachment.related || attachment.contentDisposition === "inline"),
    };
  }

  async read(messageId: number, attachmentId: number): Promise<Uint8Array | null> {
    const row = this.db
      .prepare(`SELECT id FROM attachments WHERE id = ? AND message_id = ?`)
      .get(attachmentId, messageId) as unknown as { id: number } | undefined;

    if (!row) return null;

    try {
      return readFileSync(attachmentPath(messageId, attachmentId));
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- tags

  listTags(accountId: number): Tag[] {
    const rows = this.db
      .prepare(`SELECT * FROM tags WHERE account_id = ? ORDER BY name ASC`)
      .all(accountId) as unknown as TagRow[];

    return rows.map(tagFromRow);
  }

  getTag(id: number): Tag | null {
    const row = this.db.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as unknown as
      | TagRow
      | undefined;
    return row ? tagFromRow(row) : null;
  }

  getTagByName(accountId: number, name: string): Tag | null {
    const row = this.db.prepare(`SELECT * FROM tags WHERE account_id = ? AND name = ?`).get(accountId, name) as
      | TagRow
      | undefined;
    return row ? tagFromRow(row) : null;
  }

  createTag(
    accountId: number,
    input: { name: string; description?: string | null; color?: string | null },
  ): Tag {
    const result = this.db
      .prepare(`INSERT INTO tags (account_id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(accountId, input.name, input.description ?? null, input.color ?? null, nowIso());

    const tag = this.getTag(Number(result.lastInsertRowid));
    if (!tag) throw new Error("Failed to create tag.");
    return tag;
  }

  updateTag(
    id: number,
    patch: { name?: string; description?: string | null; color?: string | null },
  ): Tag {
    this.db
      .prepare(
        `UPDATE tags SET name = COALESCE(?, name), description = COALESCE(?, description),
         color = COALESCE(?, color) WHERE id = ?`,
      )
      .run(patch.name ?? null, patch.description ?? null, patch.color ?? null, id);

    const tag = this.getTag(id);
    if (!tag) throw new Error(`Tag "${id}" does not exist.`);
    return tag;
  }

  removeTag(id: number): void {
    this.transaction(() => {
      this.db.prepare(`DELETE FROM message_tags WHERE tag_id = ?`).run(id);
      this.db.prepare(`DELETE FROM tag_rules WHERE tag_id = ?`).run(id);
      this.db.prepare(`DELETE FROM tags WHERE id = ?`).run(id);
    });
  }

  attachTag(messageId: number, tagId: number, source?: string, confidence?: number): void {
    this.db
      .prepare(
        `INSERT INTO message_tags (message_id, tag_id, source, confidence) VALUES (?, ?, ?, ?)
         ON CONFLICT (message_id, tag_id) DO UPDATE SET
           source = excluded.source, confidence = excluded.confidence`,
      )
      .run(messageId, tagId, source ?? null, confidence ?? null);
  }

  detachTag(messageId: number, tagId: number): void {
    this.db.prepare(`DELETE FROM message_tags WHERE message_id = ? AND tag_id = ?`).run(messageId, tagId);
  }

  tagsForMessage(messageId: number): Tag[] {
    const rows = this.db
      .prepare(
        `SELECT t.* FROM tags t
         JOIN message_tags mt ON mt.tag_id = t.id
         WHERE mt.message_id = ? ORDER BY t.name ASC`,
      )
      .all(messageId) as unknown as TagRow[];

    return rows.map(tagFromRow);
  }

  clearRuleTags(messageId: number): void {
    this.db.prepare(`DELETE FROM message_tags WHERE message_id = ? AND source = 'rule'`).run(messageId);
  }

  // ------------------------------------------------------------ tag rules

  listTagRules(accountId: number): TagRule[] {
    const rows = this.db
      .prepare(`SELECT * FROM tag_rules WHERE account_id = ? ORDER BY name ASC`)
      .all(accountId) as unknown as TagRuleRow[];

    return rows.map(tagRuleFromRow);
  }

  getTagRule(id: number): TagRule | null {
    const row = this.db.prepare(`SELECT * FROM tag_rules WHERE id = ?`).get(id) as unknown as
      | TagRuleRow
      | undefined;
    return row ? tagRuleFromRow(row) : null;
  }

  createTagRule(input: {
    accountId: number;
    name: string;
    condition: TagRule["condition"];
    tagId: number;
    enabled?: boolean;
  }): TagRule {
    const result = this.db
      .prepare(
        `INSERT INTO tag_rules (account_id, name, condition_json, tag_id, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.accountId, input.name, json(input.condition), input.tagId, input.enabled === false ? 0 : 1, nowIso());

    const rule = this.getTagRule(Number(result.lastInsertRowid));
    if (!rule) throw new Error("Failed to create rule.");
    return rule;
  }

  updateTagRule(
    id: number,
    patch: {
      name?: string;
      condition?: TagRule["condition"];
      tagId?: number;
      enabled?: boolean;
    },
  ): TagRule {
    this.db
      .prepare(
        `UPDATE tag_rules SET
           name = COALESCE(?, name),
           condition_json = COALESCE(?, condition_json),
           tag_id = COALESCE(?, tag_id),
           enabled = COALESCE(?, enabled)
         WHERE id = ?`,
      )
      .run(
        patch.name ?? null,
        patch.condition ? json(patch.condition) : null,
        patch.tagId ?? null,
        patch.enabled === undefined ? null : patch.enabled ? 1 : 0,
        id,
      );

    const rule = this.getTagRule(id);
    if (!rule) throw new Error(`Rule "${id}" does not exist.`);
    return rule;
  }

  removeTagRule(id: number): void {
    this.db.prepare(`DELETE FROM tag_rules WHERE id = ?`).run(id);
  }

  // --------------------------------------------------------------- search

  indexMessage(
    messageId: number,
    input: {
      subject: string;
      from: Address[];
      to: Address[];
      snippet?: string | null;
      text?: string | null;
    },
  ): void {
    this.db.prepare(`DELETE FROM messages_fts WHERE message_id = ?`).run(messageId);
    this.db
      .prepare(
        `INSERT INTO messages_fts (message_id, subject, from_json, to_json, snippet, text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(messageId, input.subject, json(input.from), json(input.to), input.snippet ?? "", input.text ?? "");
  }

  removeFromSearch(messageId: number): void {
    this.db.prepare(`DELETE FROM messages_fts WHERE message_id = ?`).run(messageId);
  }

  searchMessages(
    accountId: number,
    query: string,
    opts?: { limit?: number; offset?: number },
  ): SearchIndexResult {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
    const offset = Math.max(opts?.offset ?? 0, 0);

    const rows = this.db
      .prepare(
        `SELECT f.message_id AS id, COUNT(*) OVER () AS total FROM messages_fts f
         JOIN messages m ON m.id = f.message_id
         WHERE m.account_id = ? AND messages_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`,
      )
      .all(accountId, query, limit, offset) as unknown as Array<{ id: number; total: number }>;

    return {
      total: rows[0]?.total ?? 0,
      ids: rows.map((row) => row.id),
    };
  }

  // -------------------------------------------------------------- helpers

  /** No-op hook so `mail_client.ts` can seed once per database. */
  getMeta(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as unknown as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .run(key, value);
  }

  deleteMeta(key: string): void {
    this.db.prepare(`DELETE FROM meta WHERE key = ?`).run(key);
  }

  private transaction(fn: () => void): void {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

// ------------------------------------------------------------ row mappers

type TagRow = {
  id: number;
  account_id: number;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
};

function tagFromRow(row: TagRow): Tag {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
  };
}

type TagRuleRow = {
  id: number;
  account_id: number;
  name: string;
  condition_json: string;
  tag_id: number;
  enabled: number;
  created_at: string;
};

function tagRuleFromRow(row: TagRuleRow): TagRule {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    condition: parseJson<TagRule["condition"]>(row.condition_json, {
      field: "subject",
      op: "contains",
      value: "",
    }),
    tagId: row.tag_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

type ThreadAggRow = {
  id: number;
  account_id: number;
  message_count: number;
  unread_count: number | null;
  last_message_at: string | null;
  subject: string | null;
  snippet: string | null;
  last_from_json: string | null;
};

function threadFromRow(row: ThreadAggRow): StoredThread {
  return {
    id: row.id,
    accountId: row.account_id,
    providerThreadId: String(row.id),
    subject: row.subject ?? "(no subject)",
    lastMessageAt: row.last_message_at,
    snippet: row.snippet,
    messageCount: row.message_count,
    unreadCount: row.unread_count ?? 0,
    lastFrom: parseJson<Address[]>(row.last_from_json ?? "[]", []),
  };
}
