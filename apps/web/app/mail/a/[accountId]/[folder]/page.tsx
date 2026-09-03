import { notFound } from "next/navigation";
import { FolderView } from "@/components/mail/folder-view";
import { isMailView, mailViewFromSegment } from "@/lib/mail/routes";
import { pageSearchToParams, threadQueryFromSearch } from "@/lib/mail/query-params";
import { loadFolderPage } from "@/lib/mail/server";

export const dynamic = "force-dynamic";

type FolderPageProps = {
  params: Promise<{ accountId: string; folder: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Folder route: server-loads the thread page
 * for the account + view + URL query, then hydrates the interactive list.
 */
export default async function FolderPage({ params, searchParams }: FolderPageProps) {
  const { accountId, folder: rawFolder } = await params;
  const view = mailViewFromSegment(rawFolder);
  if (!view || !isMailView(view)) notFound();

  const query = threadQueryFromSearch(pageSearchToParams(await searchParams));
  const { account, page } = await loadFolderPage(accountId, view, query).catch(() => ({
    account: null,
    page: null,
  }));
  if (!account || !page) notFound();

  const queryString = pageSearchToParams(await searchParams).toString();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`${view} mail list`}>
      <FolderView
        accountId={account.id}
        folder={view}
        initialThreads={page.threads}
        initialTotal={page.total}
        initialHasMore={page.hasMore}
        initialQuery={query}
        queryString={queryString || undefined}
      />
    </main>
  );
}
