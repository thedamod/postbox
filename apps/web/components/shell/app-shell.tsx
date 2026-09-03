"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  FolderCounts,
  MailAccount,
  MailCollection,
  MailViewId,
} from "@/lib/mail/types";
import { mailRouteFromPathname } from "@/lib/mail/routes";
import {
  loadWorkspaceTabs,
  saveWorkspaceTabs,
  workspaceTabsKey,
  type WorkspaceTab,
} from "@/lib/mail/workspace-tabs";
import { ComposerProvider } from "./composer";

export type MailShellValue = {
  account: MailAccount;
  accounts: MailAccount[];
  counts: FolderCounts;
  collections: MailCollection[];
  activeFolder: MailViewId;
  activeThreadId: string | null;
  tabs: WorkspaceTab[];
  openThread: (threadId: string, folder: MailViewId, subject?: string) => void;
  closeTab: (threadId: string) => void;
};

const MailShellContext = createContext<MailShellValue | null>(null);

export function useMailShell(): MailShellValue {
  const value = useContext(MailShellContext);
  if (!value) throw new Error("useMailShell must be used inside <AppShell>.");
  return value;
}

type AppShellProps = {
  account: MailAccount;
  accounts: MailAccount[];
  counts: FolderCounts;
  collections: MailCollection[];
  children: ReactNode;
};

/**
 * Inbox chrome owner (mirrors redakt `AppShell`): sidebar, workspace tabs,
 * and composer state live here. Route data arrives as props from the
 * account layout; navigation and search state stay in the URL.
 */
export function AppShell({ account, accounts, counts, collections, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => loadWorkspaceTabs(account.id));

  const route = mailRouteFromPathname(pathname ?? "");
  const activeFolder: MailViewId =
    route?.kind === "folder" || route?.kind === "thread" ? route.folder : "inbox";
  const activeThreadId = route?.kind === "thread" ? route.threadId : null;
  const routeThreadId = route?.kind === "thread" ? route.threadId : null;
  const routeFolder = route?.kind === "thread" ? route.folder : null;

  // Persist open threads per account; sync across shell instances.
  useEffect(() => {
    setTabs(loadWorkspaceTabs(account.id));
    const key = workspaceTabsKey(account.id);
    const sync = () => setTabs(loadWorkspaceTabs(account.id));
    window.addEventListener(key, sync);
    return () => window.removeEventListener(key, sync);
  }, [account.id]);

  // Remember the open thread as a workspace tab.
  useEffect(() => {
    if (routeThreadId && routeFolder) {
      setTabs((prev) => {
        if (prev.some((tab) => tab.threadId === routeThreadId)) return prev;
        const next = [
          ...prev,
          { threadId: routeThreadId, folder: routeFolder },
        ].slice(-10);
        saveWorkspaceTabs(account.id, next);
        return next;
      });
    }
  }, [account.id, routeThreadId, routeFolder]);

  const openThread = useCallback(
    (threadId: string, folder: MailViewId, subject?: string) => {
      setTabs((prev) => {
        const next = prev.some((tab) => tab.threadId === threadId)
          ? prev.map((tab) => (tab.threadId === threadId ? { ...tab, subject: subject ?? tab.subject } : tab))
          : [...prev, { threadId, folder, subject }].slice(-10);
        saveWorkspaceTabs(account.id, next);
        return next;
      });
      router.push(`/mail/a/${encodeURIComponent(account.id)}/${encodeURIComponent(folder)}/thread/${encodeURIComponent(threadId)}`);
    },
    [account.id, router],
  );

  const closeTab = useCallback(
    (threadId: string) => {
      setTabs((prev) => {
        const next = prev.filter((tab) => tab.threadId !== threadId);
        saveWorkspaceTabs(account.id, next);
        return next;
      });
      if (activeThreadId === threadId) {
        router.push(`/mail/a/${encodeURIComponent(account.id)}/${encodeURIComponent(activeFolder)}`);
      }
    },
    [account.id, activeFolder, activeThreadId, router],
  );

  // Global shortcuts: Alt+N / c compose. Thread-local keys live in thread-view.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.altKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("postbox:compose"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<MailShellValue>(
    () => ({
      account,
      accounts,
      counts,
      collections,
      activeFolder,
      activeThreadId,
      tabs,
      openThread,
      closeTab,
    }),
    [account, accounts, counts, collections, activeFolder, activeThreadId, tabs, openThread, closeTab],
  );

  return (
    <MailShellContext.Provider value={value}>
      <ComposerProvider account={account}>
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
          {children}
        </div>
      </ComposerProvider>
    </MailShellContext.Provider>
  );
}
