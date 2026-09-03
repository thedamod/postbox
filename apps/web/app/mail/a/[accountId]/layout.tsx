import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { Sidebar } from "@/components/shell/sidebar";
import { WorkspaceTabs } from "@/components/shell/workspace-tabs";
import {
  loadFolderCounts,
  loadMailAccounts,
  loadMailCollections,
} from "@/lib/mail/server";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ accountId: string }>;
};

/**
 * Account shell: resolves the
 * account, loads counts + collections on the server, and hands everything
 * to the client `AppShell` context.
 */
export default async function MailAccountLayout({ children, params }: LayoutProps) {
  const { accountId } = await params;
  const accounts = await loadMailAccounts().catch(() => []);
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) notFound();

  const [counts, collections] = await Promise.all([
    loadFolderCounts(account.id),
    loadMailCollections(account.id),
  ]);

  return (
    <AppShell account={account} accounts={accounts} counts={counts} collections={collections}>
      <Sidebar accounts={accounts} account={account} counts={counts} collections={collections} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceTabs />
        {children}
      </div>
    </AppShell>
  );
}
