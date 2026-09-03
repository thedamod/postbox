import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderView } from "@/components/mail/folder-view";
import { ThreadView } from "@/components/mail/thread-view";
import { isMailView, mailFolderHref, mailViewFromSegment } from "@/lib/mail/routes";
import { pageSearchToParams, threadQueryFromSearch } from "@/lib/mail/query-params";
import { loadFolderPage, loadThreadDetail } from "@/lib/mail/server";

export const dynamic = "force-dynamic";

type ThreadPageProps = {
  params: Promise<{ accountId: string; folder: string; threadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Thread route: the conversation renders in
 * its originating folder context, with the list preserved alongside it.
 */
export default async function ThreadPage({ params, searchParams }: ThreadPageProps) {
  const { accountId, folder: rawFolder, threadId } = await params;
  const view = mailViewFromSegment(rawFolder);
  if (!view || !isMailView(view)) notFound();

  const query = threadQueryFromSearch(pageSearchToParams(await searchParams));
  const [{ account, page }, { thread }] = await Promise.all([
    loadFolderPage(accountId, view, query).catch(() => ({ account: null, page: null })),
    loadThreadDetail(accountId, threadId).catch(() => ({ account: null, thread: null })),
  ]);
  if (!account || !page || !thread) notFound();

  const index = page.threads.findIndex((item) => item.id === thread.id);
  const prevThreadId = index > 0 ? page.threads[index - 1]!.id : null;
  const nextThreadId =
    index >= 0 && index + 1 < page.threads.length ? page.threads[index + 1]!.id : null;
  const queryString = pageSearchToParams(await searchParams).toString();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row" aria-label="Conversation">
      <div className="hidden min-h-0 w-96 shrink-0 flex-col border-r border-border md:flex">
        <FolderView
          accountId={account.id}
          folder={view}
          initialThreads={page.threads}
          initialTotal={page.total}
          initialHasMore={page.hasMore}
          initialQuery={query}
          queryString={queryString || undefined}
          activeThreadId={thread.id}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-3 py-1.5 md:hidden">
          <Link
            href={mailFolderHref(view, undefined, account.id)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back to list
          </Link>
        </div>
        <ThreadView
          accountId={account.id}
          folder={view}
          thread={{ ...thread, folder: view }}
          prevThreadId={prevThreadId}
          nextThreadId={nextThreadId}
        />
      </div>
    </main>
  );
}
