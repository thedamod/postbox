import type {
  EmailAccount,
  EmailFolder,
  StoredMessage,
  StoredThread,
} from "@postbox/email-client/domain";

import type { Tag } from "@postbox/email-client";

// The native client talks to the Bun mail server by default. Set
// EXPO_PUBLIC_API_URL for a physical device or a hosted server.
const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

export const API_BASE_URL = BASE_URL;

type ApiEnvelope = { error?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiEnvelope | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export type OutgoingAttachmentInput = {
  filename?: string;
  contentType?: string;
  /** Base64-encoded file bytes. */
  contentBase64: string;
};

export type ComposeInput = {
  accountId: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: OutgoingAttachmentInput[];
};

export type SyncPreview = {
  messageId: number;
  subject: string;
  from: string;
  snippet: string;
};

export type SyncFolderResult = {
  path: string;
  newMessages: number;
  lastUid: number;
  flagsChanged: number;
  previews: SyncPreview[];
};

export type SyncAccountResult = {
  account: string;
  folders: SyncFolderResult[];
  changed: boolean;
  revision: number;
  error?: string;
};

export type SyncState = {
  revision: number;
  lastSyncAt: string | null;
  exists: boolean;
};

export const mailApi = {
  accounts(): Promise<{ accounts: EmailAccount[] }> {
    return api("/api/accounts");
  },

  compose(input: ComposeInput): Promise<{ result: unknown }> {
    return api("/api/compose", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  threads(
    accountId: number,
    opts?: { folder?: string; limit?: number; offset?: number },
  ): Promise<{ threads: StoredThread[]; total: number; offset: number; hasMore: boolean }> {
    const params = new URLSearchParams({
      accountId: String(accountId),
      limit: String(opts?.limit ?? 50),
      offset: String(opts?.offset ?? 0),
    });
    if (opts?.folder) params.set("folder", opts.folder);
    return api(`/api/threads?${params}`);
  },

  message(id: number): Promise<{ message: StoredMessage }> {
    return api(`/api/messages/${id}`);
  },

  act(id: number, action: string, body?: Record<string, unknown>): Promise<{ message?: StoredMessage }> {
    return api(`/api/messages/${id}/actions`, {
      method: "POST",
      body: JSON.stringify({ action, ...body }),
    });
  },

  sync(accountId: number, folder?: string | null): Promise<{ result: SyncAccountResult }> {
    const params = new URLSearchParams({ wait: "1" });
    if (folder) params.set("folder", folder);
    return api(`/api/sync/${accountId}?${params}`, { method: "POST" });
  },

  /** Cheap revision poll — no provider I/O, safe to call on every resume. */
  syncState(accountId: number): Promise<SyncState> {
    const params = new URLSearchParams({ accountId: String(accountId) });
    return api(`/api/sync/state?${params}`);
  },

  async waitForSync(jobId: string): Promise<void> {
    let delay = 700;

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const { jobs } = await api<{ jobs: Array<{ id: string; status: string; error?: string | null }> }>(
        "/api/sync/jobs",
      );
      const job = jobs.find((entry) => entry.id === jobId);

      if (!job || job.status === "done") return;
      if (job.status === "error") throw new Error(job.error ?? "Sync failed.");
      delay = Math.min(delay * 1.35, 4_000);
    }

    throw new Error("Sync is still running. The inbox will update when you return.");
  },

  syncMore(accountId: number, folder?: string | null): Promise<{ result: SyncAccountResult }> {
    const params = new URLSearchParams({ wait: "1" });
    if (folder) params.set("folder", folder);
    return api(`/api/sync/${accountId}/older?${params}`, { method: "POST" });
  },

  jobs(): Promise<{ jobs: Array<{ id: string; status: string }> }> {
    return api("/api/sync/jobs");
  },

  search(
    accountId: number,
    q: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ messages: StoredMessage[]; total: number }> {
    const params = new URLSearchParams({
      accountId: String(accountId),
      q,
      limit: String(opts?.limit ?? 50),
      offset: String(opts?.offset ?? 0),
    });
    return api(`/api/search?${params}`);
  },

  folders(accountId: number): Promise<{ folders: EmailFolder[] }> {
    const params = new URLSearchParams({ accountId: String(accountId) });
    return api(`/api/folders?${params}`);
  },

  tags(accountId: number): Promise<{ tags: Tag[] }> {
    const params = new URLSearchParams({ accountId: String(accountId) });
    return api(`/api/tags?${params}`);
  },

  contacts(accountId: number): Promise<{ contacts: Array<{ name: string; email: string; picture?: string }> }> {
    return api(`/api/contacts?accountId=${accountId}`);
  },
};

/** Absolute URL for downloading an attachment (used for sharing). */
export function attachmentUrl(messageId: number, attachmentId: number): string {
  return `${BASE_URL}/api/messages/${messageId}/attachments/${attachmentId}`;
}
