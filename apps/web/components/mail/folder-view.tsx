"use client";

import { useEffect, useState } from "react";
import type { StoredMessage, StoredThread } from "@postbox/email-client/domain";
import { Button } from "@postbox/ui";
import { api, searchPath, threadsPath } from "@/lib/mail/api-client";
import { folderDefForView } from "@/lib/mail/folders";
import { storedThreadRowToView, threadToView } from "@/lib/mail/adapters";
import type { MailViewId, Thread, ThreadListQuery } from "@/lib/mail/types";
import { ListToolbar } from "./list-toolbar";
import { ThreadList } from "./thread-list";

type ThreadsPage = {
  threads: StoredThread[];
  total: number;
  hasMore: boolean;
};

type SearchPage = {
  query: string;
  total: number;
  messages: StoredMessage[];
};

type FolderViewProps = {
  accountId: string;
  folder: MailViewId;
  initialThreads: Thread[];
  initialTotal: number;
  initialHasMore: boolean;
  initialQuery: ThreadListQuery;
  queryString?: string;
  activeThreadId?: string | null;
};

/**
 * Folder route content: toolbar + list with client-side "load more".
 * Search/filter/sort state lives in the URL (server re-renders on change);
 * pagination appends via the existing `/api/threads` and `/api/search`
 * endpoints mapped through the same adapters as the server loaders.
 */
export function FolderView({
  accountId,
  folder,
  initialThreads,
  initialTotal,
  initialHasMore,
  initialQuery,
  queryString,
  activeThreadId,
}: FolderViewProps) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [total, setTotal] = useState(initialTotal);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetKey = `${accountId}:${folder}:${queryString ?? ""}`;
  useEffect(() => {
    setThreads(initialThreads);
    setTotal(initialTotal);
    setHasMore(initialHasMore);
    setError(null);
  }, [resetKey, initialThreads, initialTotal, initialHasMore]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      if (initialQuery.q?.trim()) {
        const page = await api<SearchPage>(
          searchPath({ accountId, query: initialQuery.q.trim(), limit: 500 }),
        );
        const byThread = new Map<number, StoredMessage[]>();
        for (const message of page.messages) {
          if (message.threadId == null) continue;
          const list = byThread.get(message.threadId) ?? [];
          list.push(message);
          byThread.set(message.threadId, list);
        }
        const rows = [...byThread.values()].map((messages) =>
          threadToView(
            {
              id: messages[0]!.threadId!,
              accountId: Number(accountId),
              providerThreadId: `search-${messages[0]!.threadId}`,
              subject: messages[messages.length - 1]!.subject,
              lastMessageAt: messages[messages.length - 1]!.date,
              snippet: messages[messages.length - 1]!.snippet ?? null,
            },
            messages,
            folder,
          ),
        );
        setThreads((prev) => [...prev, ...rows.slice(prev.length, prev.length + 50)]);
        setHasMore(rows.length > threads.length + 50);
      } else {
        const def = folderDefForView(folder);
        const page = await api<ThreadsPage>(
          threadsPath({
            accountId,
            folder: def?.storageFolder,
            limit: 50,
            offset: threads.length,
          }),
        );
        setThreads((prev) => [
          ...prev,
          ...page.threads.map((row) => storedThreadRowToView(row, folder)),
        ]);
        setTotal(page.total);
        setHasMore(page.hasMore);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <ListToolbar initial={initialQuery} />
      <ThreadList
        accountId={accountId}
        folder={folder}
        threads={threads}
        total={total}
        hasMore={hasMore}
        activeThreadId={activeThreadId}
        queryString={queryString}
      />
      {hasMore && (
        <div className="flex flex-col items-center gap-1 pb-2">
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
