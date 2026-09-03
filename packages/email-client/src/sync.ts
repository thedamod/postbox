import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";

import { getProvider, type ClientDeps } from "./deps";
import { applyTags } from "./tags/autotag";
import type { TagRule } from "./tags/rules";
import type {
  Address,
  EmailAccount,
  EmailFolder,
  FetchedMessage,
} from "./types";
import type {
  FetchResult,
  ProviderSession,
} from "./provider";

export type NewMessagePreview = {
  /** Local stored message id (for deep-linking). */
  messageId: number;
  subject: string;
  from: string;
  snippet: string;
};

export type SyncFolderResult = {
  path: string;
  newMessages: number;
  lastUid: number;
  /** Already-known messages whose read/starred flags changed remotely. */
  flagsChanged: number;
  /**
   * Fresh arrivals in this folder (mode `"new"` only, capped). Backfill
   * (`"older"`) never produces previews so clients don't notify for history.
   */
  previews: NewMessagePreview[];
};

export type SyncAccountResult = {
  account: string;
  folders: SyncFolderResult[];
  /**
   * Whether anything the UI shows changed: arrivals, flag reconciliations,
   * or a mailbox reset. Clients poll this (plus `revision`) to decide
   * between a cheap no-op and a refresh + notification.
   */
  changed: boolean;
  /** Monotonic per-account counter, persisted in storage meta. */
  revision: number;
  /** Set when the account's sync failed; other accounts still sync. */
  error?: string;
};

export type SyncJobStatus = "running" | "done" | "error";

/** imapflow reports the real reason on `responseText` while `message` stays generic. */
export function describeError(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);

  const parts: string[] = [];

  const oauthError = (cause as { oauthError?: unknown }).oauthError;
  if (oauthError && typeof oauthError === "object") {
    const scope = (oauthError as { scope?: string }).scope;
    const status = (oauthError as { status?: string }).status;
    if (scope) parts.push(`scope: ${scope}`);
    if (status) parts.push(`status: ${status}`);
  }

  const extra = (cause as { responseText?: string }).responseText;
  if (extra) parts.push(extra);

  return [cause.message, ...parts].join(": ");
}

export type SyncJob = {
  id: string;
  /** `null` means every account. */
  accountId: number | null;
  /** Folder restriction for background jobs, if any. */
  folderPath: string | null;
  status: SyncJobStatus;
  startedAt: string;
  finishedAt: string | null;
  result: SyncAccountResult[] | null;
  error: string | null;
};

// Folders are synced in this order. Gmail's "All Mail" (\All) virtual folder
// duplicates every message and makes the first sync enormous, so it's left out;
// Inbox + Sent cover the mail people actually read.
const FOLDER_ORDER = ["\\Inbox", "\\Sent", "\\Drafts", "\\Starred", "\\Trash"];

const ACCOUNT_CONCURRENCY = Number(process.env.MAIL_SYNC_ACCOUNT_CONCURRENCY ?? 2);
const MESSAGE_CONCURRENCY = Number(process.env.MAIL_SYNC_MESSAGE_CONCURRENCY ?? 4);
// How many recent messages a *full* sync pulls per folder. Small so the first
// load is fast; later syncs are incremental (new mail only).
const FULL_SYNC_LIMIT = Number(process.env.MAIL_SYNC_FULL_LIMIT ?? 50);
const MAX_JOB_HISTORY = 20;
// Previews per folder kept for notifications; small on purpose.
const PREVIEW_LIMIT = 5;

function syncRevisionKey(accountId: number): string {
  return `sync_revision:${accountId}`;
}

function syncLastAtKey(accountId: number): string {
  return `sync_last_at:${accountId}`;
}

/** Persisted monotonic counter clients use to detect remote changes. */
export function readSyncRevision(deps: ClientDeps, accountId: number): number {
  const raw = deps.storage.getMeta(syncRevisionKey(accountId));
  const revision = raw == null ? 0 : Number(raw);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

/** Cheap poll state: revision + last successful sync, no provider I/O. */
export function readAccountSyncState(
  deps: ClientDeps,
  accountId: number,
): { revision: number; lastSyncAt: string | null } {
  return {
    revision: readSyncRevision(deps, accountId),
    lastSyncAt: deps.storage.getMeta(syncLastAtKey(accountId)),
  };
}

function bumpSyncRevision(deps: ClientDeps, accountId: number): number {
  const next = readSyncRevision(deps, accountId) + 1;
  deps.storage.setMeta(syncRevisionKey(accountId), String(next));
  return next;
}

function normalizeAddresses(value: Array<{ name?: string; address?: string }>): Address[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry && typeof entry.address === "string")
    .map((entry) => ({
      name: entry.name || undefined,
      address: entry.address!,
    }));
}

function addressValues(
  value: AddressObject | AddressObject[] | undefined,
): Array<{ name?: string; address?: string }> {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => entry.value ?? []);
  }

  return value.value ?? [];
}

function referenceList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value.split(/\s+/).filter(Boolean);
}

function makeSnippet(text: string | null, html: string | null): string | null {
  const source = text || (html ? html.replace(/<[^>]+>/g, " ") : null);

  if (!source) return null;

  return source.replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

function selectSyncFolders(folders: EmailFolder[]): EmailFolder[] {
  const bySpecialUse = new Map<string, EmailFolder>();

  for (const folder of folders) {
    if (folder.specialUse && FOLDER_ORDER.includes(folder.specialUse)) {
      bySpecialUse.set(folder.specialUse, folder);
    }
  }

  if (!bySpecialUse.has("\\Inbox")) {
    const inbox = folders.find((folder) => folder.path === "INBOX");
    if (inbox) bySpecialUse.set("\\Inbox", inbox);
  }

  return FOLDER_ORDER
    .filter((specialUse) => bySpecialUse.has(specialUse))
    .map((specialUse) => bySpecialUse.get(specialUse)!);
}

/** Run `fn` over `items` with at most `limit` promises in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const max = Math.max(1, Math.min(limit, items.length));

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  };

  const workers = Array.from({ length: max }, worker);
  await Promise.all(workers);

  return results;
}

function flagsOf(fetched: FetchedMessage) {
  return {
    seen: fetched.flags.includes("\\Seen"),
    starred: fetched.flags.includes("\\Starred"),
    draft: fetched.flags.includes("\\Draft"),
    sent: fetched.flags.includes("\\Sent"),
  };
}

async function ingestMessage(
  deps: ClientDeps,
  account: EmailAccount,
  fetched: FetchedMessage,
  enabledRules: TagRule[],
): Promise<{ id: number; subject: string; from: string; snippet: string } | null> {
  if (!fetched.source) return null;

  const parsed = await simpleParser(Buffer.from(fetched.source));

  const date = parsed.date ?? fetched.internalDate;

  const input = {
    accountId: account.id,
    folder: fetched.path,
    providerUid: fetched.uid,
    messageId: fetched.messageId ?? parsed.messageId ?? null,
    providerThreadId: fetched.providerThreadId,
    inReplyTo: parsed.inReplyTo || null,
    references: referenceList(parsed.references),
    from: normalizeAddresses(addressValues(parsed.from)),
    to: normalizeAddresses(addressValues(parsed.to)),
    cc: normalizeAddresses(addressValues(parsed.cc)),
    bcc: normalizeAddresses(addressValues(parsed.bcc)),
    replyTo: normalizeAddresses(addressValues(parsed.replyTo)),
    subject: parsed.subject ?? "(no subject)",
    text: parsed.text ?? null,
    html: parsed.html || null,
    date: date ? date.toISOString() : null,
    size: fetched.size ?? null,
    flags: flagsOf(fetched),
    snippet: makeSnippet(parsed.text ?? null, parsed.html || null),
    labels: fetched.labels,
  };

  const messageId = await deps.storage.upsertMessage(input, {
    resolveAttachments: async (id) => {
      const attachments = [];

      if (parsed.attachments?.length) {
        for (let i = 0; i < parsed.attachments.length; i++) {
          const attachment = parsed.attachments[i];
          if (!attachment) continue;
          const saved = await deps.attachments.save(id, attachment, i);
          if (saved) attachments.push(saved);
        }
      }

      return attachments;
    },
  });

  applyTags(deps.storage, messageId, account.id, input, fetched.labels, enabledRules);

  const from = input.from[0];
  return {
    id: messageId,
    subject: input.subject,
    from: from ? (from.name || from.address) : "(unknown)",
    snippet: input.snippet ?? input.subject,
  };
}

export class SyncEngine {
  private deps: ClientDeps;
  private jobs = new Map<string, SyncJob>();
  private counter = 0;
  private active = new Map<string, Promise<SyncAccountResult>>();

  constructor(deps: ClientDeps) {
    this.deps = deps;
  }

  // ------------------------------------------------------- background jobs

  /** Kick off a background sync of one account. Returns immediately. */
  startSyncAccount(accountId: number, folderPath?: string): SyncJob {
    return this.createJob(accountId, "new", folderPath);
  }

  /** Kick off a background "load older mail" sync of one account. */
  startSyncMore(accountId: number, folderPath?: string): SyncJob {
    return this.createJob(accountId, "older", folderPath);
  }

  /** Kick off a background sync of every account. Returns immediately. */
  startSyncAll(): SyncJob {
    return this.createJob(null, "new");
  }

  getJob(id: string): SyncJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): SyncJob[] {
    return [...this.jobs.values()].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }

  private createJob(accountId: number | null, mode: "new" | "older", folderPath?: string): SyncJob {
    const job: SyncJob = {
      id: `job-${++this.counter}`,
      accountId,
      folderPath: folderPath ?? null,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      result: null,
      error: null,
    };

    this.jobs.set(job.id, job);
    this.trimHistory();

    // Multiple accounts can sync concurrently; syncs of the same account
    // coalesce onto a single in-flight run (see `syncAccount`).
    void this.runJob(job, mode);

    return job;
  }

  private async runJob(job: SyncJob, mode: "new" | "older") {
    try {
      job.result =
        job.accountId == null
          ? await this.syncAll()
          : mode === "older"
            ? [await this.syncOlderAccount(job.accountId, job.folderPath ?? undefined)]
            : [await this.syncAccount(job.accountId, job.folderPath ?? undefined)];
      job.status = "done";
    } catch (cause) {
      console.error("[sync] job failed:", cause);
      job.status = "error";
      job.error = describeError(cause);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  }

  private trimHistory() {
    if (this.jobs.size <= MAX_JOB_HISTORY) return;

    const finished = [...this.jobs.entries()]
      .filter(([, job]) => job.status !== "running")
      .sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt));

    for (const [id] of finished) {
      if (this.jobs.size <= MAX_JOB_HISTORY) break;
      this.jobs.delete(id);
    }
  }

  // --------------------------------------------------------- direct syncs

  /**
   * Fully sync one account and await the result. Concurrent requests for the
   * same account share the in-flight run instead of blocking or duplicating.
   */
  async syncAccount(accountId: number, folderPath?: string): Promise<SyncAccountResult> {
    return this.syncAccountWithMode(accountId, "new", folderPath);
  }

  /** Progressively load older mail for one account (pagination). */
  async syncOlderAccount(accountId: number, folderPath?: string): Promise<SyncAccountResult> {
    return this.syncAccountWithMode(accountId, "older", folderPath);
  }

  private async syncAccountWithMode(
    accountId: number,
    mode: "new" | "older",
    folderPath?: string,
  ): Promise<SyncAccountResult> {
    const key = `${accountId}:${mode}:${folderPath ?? "all"}`;
    const existing = this.active.get(key);

    if (existing) return existing;

    const run = this.doSyncAccount(accountId, mode, folderPath);
    this.active.set(key, run);

    try {
      return await run;
    } finally {
      this.active.delete(key);
    }
  }

  /** Fully sync every account and await the results. */
  async syncAll(): Promise<SyncAccountResult[]> {
    const all = this.deps.storage.listAccounts();

    return mapWithConcurrency(
      all,
      ACCOUNT_CONCURRENCY,
      async (account) => {
        try {
          return await this.syncAccount(account.id);
        } catch (cause) {
          // Isolate failures: one broken engine shouldn't block the others
          // from updating the local store.
          return {
            account: account.email,
            folders: [],
            changed: false,
            revision: readSyncRevision(this.deps, account.id),
            error: describeError(cause),
          };
        }
      },
    );
  }

  private async doSyncAccount(
    accountId: number,
    mode: "new" | "older",
    folderPath?: string,
  ): Promise<SyncAccountResult> {
    const deps = this.deps;
    const account = deps.storage.getAccount(accountId);

    if (!account) {
      throw new Error(`Account "${accountId}" does not exist.`);
    }

    const session = getProvider(deps, account.provider).open(account);

    await session.connect();

    try {
       const availableTargets = selectSyncFolders(await session.listFolders());
       const targets = folderPath
         ? availableTargets.filter((folder) => folder.path === folderPath)
         : availableTargets;

       if (folderPath && targets.length === 0) {
         throw new Error(`Folder "${folderPath}" is not available on this account.`);
       }

      // Shared across folders: a message already claimed/stored by one folder
      // (e.g. All Mail vs Inbox) is skipped, not re-parsed.
      const seen = new Set<string>();
      const folders: Array<SyncFolderResult & { reset: boolean }> = [];

      // One connection per account; IMAP allows a single selected mailbox per
      // connection, so folders are synced sequentially on it.
      for (const folder of targets) {
        folders.push(await this.syncFolder(session, account, folder.path, seen, mode));
      }

      const changed = folders.some(
        (folder) => folder.newMessages > 0 || folder.flagsChanged > 0 || folder.reset,
      );
      const revision = changed
        ? bumpSyncRevision(deps, account.id)
        : readSyncRevision(deps, account.id);
      deps.storage.setMeta(syncLastAtKey(account.id), new Date().toISOString());

      return { account: account.email, folders, changed, revision };
    } finally {
      await session.logout();
    }
  }

  private async syncFolder(
    session: ProviderSession,
    account: EmailAccount,
    folderPath: string,
    seen: Set<string>,
    mode: "new" | "older",
  ): Promise<SyncFolderResult & { reset: boolean }> {
    const deps = this.deps;
    const state = deps.storage.getSyncState(account.id, folderPath);

    let fetch: FetchResult;
    let reset = false;

    if (mode === "older") {
      // Load progressively older mail. The frontier is `minUid` (fall back to
      // `lastUid` right after a fresh full sync).
      const minUid = state?.minUid ?? state?.lastUid ?? 0;

      if (minUid <= 1) {
        return { path: folderPath, newMessages: 0, lastUid: state?.lastUid ?? 0, flagsChanged: 0, previews: [], reset: false };
      }

      fetch = await session.fetchMailbox({
        path: folderPath,
        olderThanUid: minUid,
        limit: FULL_SYNC_LIMIT,
        includeSource: false,
      });
    } else {
      // Cheap pass: headers/envelope/flags only, no bodies.
      fetch = await session.fetchMailbox({
        path: folderPath,
        sinceUid: state?.lastUid,
        full: state == null,
        limit: FULL_SYNC_LIMIT,
        includeSource: false,
      });

      const uidValidityChanged =
        state != null &&
        fetch.uidValidity != null &&
        state.uidvalidity != null &&
        Number(fetch.uidValidity) !== state.uidvalidity;

      if (uidValidityChanged) {
        // Mailbox was reset; fall back to a full sync.
        reset = true;
        deps.storage.clearSyncState(account.id, folderPath);
        fetch = await session.fetchMailbox({
          path: folderPath,
          full: true,
          limit: FULL_SYNC_LIMIT,
          includeSource: false,
        });
      }
    }

    const enabledRules = deps.storage.listTagRules(account.id).filter((rule) => rule.enabled);

    // Keep only the messages that aren't already stored, so we never download
    // bodies we already have.
    const pending: FetchedMessage[] = [];
    let flagsChanged = 0;

    for (const message of fetch.messages) {
      const headerId = message.messageId?.trim();

      if (headerId) {
        const dedupeKey = `${account.id}:${headerId}`;

        if (seen.has(dedupeKey)) continue;

        // Same Message-ID already stored (e.g. from All Mail when syncing
        // Inbox). Reconcile read/starred state without re-parsing the body or
        // touching attachments.
        const existingId = deps.storage.findMessageIdByHeader(account.id, headerId);

        if (existingId != null) {
          const incoming = {
            seen: message.flags.includes("\\Seen"),
            starred: message.flags.includes("\\Starred"),
          };
          const existing = deps.storage.getMessage(existingId);
          if (
            existing &&
            (existing.flags.seen !== incoming.seen || existing.flags.starred !== incoming.starred)
          ) {
            flagsChanged += 1;
          }
          deps.storage.addMessageFolder(existingId, account.id, message.path);
          deps.storage.updateFlagsIfChanged(existingId, incoming);
          continue;
        }

        seen.add(dedupeKey);
      }

      pending.push(message);
    }

    let newMessages = 0;
    const previews: NewMessagePreview[] = [];

    if (pending.length > 0) {
      // Batch-download raw sources for only the unknown messages, then ingest
      // them concurrently (parse + attachment I/O overlap; each message's DB
      // write stays its own transaction).
      // Keep source downloads bounded so one large mailbox cannot allocate all
      // message bodies at once during a cold sync.
      const sourceBatchSize = Math.max(1, Math.min(FULL_SYNC_LIMIT, 25));
      for (let start = 0; start < pending.length; start += sourceBatchSize) {
        const batch = pending.slice(start, start + sourceBatchSize);
        const sources = await session.fetchSources({
          path: folderPath,
          uids: batch.map((message) => message.uid),
        });

        const byUid = new Map(sources.map((entry) => [entry.uid, entry.source]));
        const ingested = await mapWithConcurrency(
          batch,
          MESSAGE_CONCURRENCY,
          async (message) => {
            const source = byUid.get(message.uid);
            if (!source) return null;
            return ingestMessage(deps, account, { ...message, source }, enabledRules);
          },
        );

        for (const item of ingested) {
          if (item == null) continue;
          newMessages += 1;
          // Only genuinely new arrivals feed notifications. Backfill
          // ("older") replays history the user already lived through.
          if (mode === "new" && previews.length < PREVIEW_LIMIT) {
            previews.push({
              messageId: item.id,
              subject: item.subject,
              from: item.from,
              snippet: item.snippet.slice(0, 140),
            });
          }
        }
      }
    }

    const fetchedUids = fetch.messages.map((message) => message.uid);
    const fetchedMinUid = fetchedUids.length > 0 ? Math.min(...fetchedUids) : null;

    let nextMinUid: number | null;

    if (mode === "older") {
      const prevMin = state?.minUid ?? state?.lastUid ?? 0;
      nextMinUid = Math.max(1, fetchedMinUid ?? prevMin - FULL_SYNC_LIMIT);
    } else if (fetchedMinUid == null) {
      nextMinUid = state?.minUid ?? 1;
    } else if (state?.minUid == null) {
      nextMinUid = fetchedMinUid;
    } else {
      nextMinUid = Math.min(state.minUid, fetchedMinUid);
    }

    deps.storage.saveSyncState({
      accountId: account.id,
      folder: folderPath,
      lastUid: mode === "older" ? (state?.lastUid ?? 0) : fetch.lastUid,
      uidvalidity:
        fetch.uidValidity == null ? null : Number(fetch.uidValidity),
      lastSyncAt: new Date().toISOString(),
      minUid: nextMinUid,
    });

    return {
      path: folderPath,
      newMessages,
      lastUid: mode === "older" ? (state?.lastUid ?? 0) : fetch.lastUid,
      flagsChanged,
      previews,
      reset,
    };
  }
}

export function createSyncEngine(deps: ClientDeps): SyncEngine {
  return new SyncEngine(deps);
}
