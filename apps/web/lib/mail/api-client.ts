/**
 * Typed HTTP client for the existing Next.js API routes.
 * The redakt-style loaders in `lib/mail/server.ts` read on the server;
 * this client is the browser path for pagination, search, and refresh.
 */

export type ApiErrorShape = { error?: string };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorShape | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function threadsPath(params: {
  accountId: string;
  folder?: string | null;
  limit?: number;
  offset?: number;
  q?: string;
}): string {
  const search = new URLSearchParams({ accountId: params.accountId });
  if (params.folder) search.set("folder", params.folder);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.q?.trim()) search.set("q", params.q.trim());
  return `/api/threads?${search.toString()}`;
}

export function searchPath(params: {
  accountId: string;
  query: string;
  limit?: number;
}): string {
  const search = new URLSearchParams({
    accountId: params.accountId,
    query: params.query,
  });
  if (params.limit) search.set("limit", String(params.limit));
  return `/api/search?${search.toString()}`;
}
