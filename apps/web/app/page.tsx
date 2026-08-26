"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  FilePenLine,
  Inbox,
  Menu,
  Loader2,
  Mail,
  MailPlus,
  Moon,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Star,
  Sun,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import type {
  EmailAccount,
  StoredMessage,
  StoredThread,
  Tag,
} from "@postbox/email-client/domain";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  Textarea,
} from "@postbox/ui";
import { cn } from "@postbox/ui";

type ApiError = { error?: string };

function updateMailboxView(update: () => void): void {
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };

  if (
    transitionDocument.startViewTransition &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    transitionDocument.startViewTransition(update);
    return;
  }

  update();
}

type ThreadsPage = {
  threads: StoredThread[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

const PAGE_SIZE = 50;

type FolderDef = {
  id: string;
  label: string;
  /** Exact storage folder path; null means "all mail" (no folder filter). */
  folder: string | null;
  icon: LucideIcon;
};

const FOLDERS: FolderDef[] = [
  { id: "inbox", label: "Inbox", folder: "INBOX", icon: Inbox },
  { id: "starred", label: "Starred", folder: "[Gmail]/Starred", icon: Star },
  { id: "sent", label: "Sent", folder: "[Gmail]/Sent Mail", icon: Send },
  { id: "drafts", label: "Drafts", folder: "[Gmail]/Drafts", icon: FilePenLine },
  { id: "all", label: "All Mail", folder: null, icon: Mail },
  { id: "trash", label: "Trash", folder: "[Gmail]/Trash", icon: Trash2 },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function googleSenderPicture(address?: string, size = 80): string | undefined {
  const email = address?.trim().toLowerCase();
  return email
    ? `https://www.google.com/s2/photos/profile?sz=${size}&email=${encodeURIComponent(email)}`
    : undefined;
}

function senderPicture(
  address: string | undefined,
  accounts: EmailAccount[],
  size = 80,
): string | undefined {
  const email = address?.trim().toLowerCase();
  const account = accounts.find((entry) => entry.email.trim().toLowerCase() === email);
  return account?.picture ?? googleSenderPicture(email, size);
}

function SenderAvatar({
  sender,
  accounts,
  className,
  size = 80,
}: {
  sender?: { name?: string; address: string };
  accounts: EmailAccount[];
  className?: string;
  size?: number;
}) {
  const picture = senderPicture(sender?.address, accounts, size);
  const label = sender?.name ?? sender?.address ?? "?";

  return (
    <Avatar className={className}>
      {picture ? <AvatarImage src={picture} alt={`${label}'s profile photo`} /> : null}
      <AvatarFallback>{initials(label)}</AvatarFallback>
    </Avatar>
  );
}

function AccountAvatar({ account, className }: { account?: EmailAccount; className?: string }) {
  return (
    <Avatar className={cn("bg-[#6aa536] text-white", className)}>
      {account?.picture ? <AvatarImage src={account.picture} alt="Google profile photo" /> : null}
      <AvatarFallback>{initials(account?.displayName ?? account?.email ?? "M")}</AvatarFallback>
    </Avatar>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Mailbox() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [selected, setSelected] = useState<StoredMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [folder, setFolder] = useState<string | null>("INBOX");
  const folderRef = useRef<string | null>("INBOX");
  const [tags, setTags] = useState<Tag[]>([]);
  const [dark, setDark] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<number | null>(null);

  const accountId = activeAccountId ?? accounts[0]?.id ?? 1;
  const activeAccount = accounts.find((account) => account.id === accountId) ?? accounts[0];
  const activeFolder = FOLDERS.find((def) => def.folder === folder) ?? FOLDERS[0]!;
  const unreadInView = threads.filter((t) => (t.unreadCount ?? 0) > 0).length;
  const threadRequestRef = useRef(0);

  const loadThreads = useCallback(
    async (accountIdArg: number, folderArg?: string) => {
      const requestId = ++threadRequestRef.current;
      const params = new URLSearchParams({
        accountId: String(accountIdArg),
        limit: String(PAGE_SIZE),
        offset: "0",
      });
      if (folderArg) params.set("folder", folderArg);

      const data = await api<ThreadsPage>(`/api/threads?${params}`);
      if (requestId !== threadRequestRef.current) return;
      setThreads(data.threads);
      setOffset(data.threads.length);
      setHasMore(data.hasMore);
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      // Sync on every pagination so older mail loads in as you scroll.
      const olderParams = new URLSearchParams({ wait: "1" });
      if (folderRef.current) olderParams.set("folder", folderRef.current);
      await api(`/api/sync/${accountId}/older?${olderParams}`, { method: "POST" });

      const params = new URLSearchParams({
        accountId: String(accountId),
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (folderRef.current) params.set("folder", folderRef.current);

      const data = await api<ThreadsPage>(`/api/threads?${params}`);
      setThreads((prev) => {
        const seen = new Set(prev.map((thread) => thread.id));
        return [...prev, ...data.threads.filter((thread) => !seen.has(thread.id))];
      });
      setOffset((prev) => prev + data.threads.length);
      setHasMore(data.hasMore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingMore(false);
    }
  }, [accountId, hasMore, loadingMore, offset]);

  // Kick off an incremental sync, wait for it to finish, then reload the list.
  const syncAndRefresh = useCallback(
    async (accountIdArg: number) => {
      const syncParams = new URLSearchParams({ wait: "1" });
      if (folderRef.current) syncParams.set("folder", folderRef.current);
      await api<{ result: unknown }>(
        `/api/sync/${accountIdArg}?${syncParams}`,
        { method: "POST" },
      );

      await loadThreads(accountIdArg, folderRef.current ?? undefined);
    },
    [loadThreads],
  );

  const autoSyncedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [accountsData, configData] = await Promise.all([
          api<{ accounts: EmailAccount[] }>("/api/accounts"),
          api<{ oauthConfigured: boolean; loginUrl: string }>("/api/auth/config").catch(
            () => ({ oauthConfigured: false, loginUrl: "" }),
          ),
        ]);
        if (cancelled) return;
        setAccounts(accountsData.accounts);
        setOauthConfigured(configData.oauthConfigured);

        let storedAccountId = 0;
        try {
          storedAccountId = Number(window.localStorage.getItem("mail-account-id"));
        } catch {
          // Use the first account when browser storage is unavailable.
        }
        const firstAccount = accountsData.accounts.find((account) => account.id === storedAccountId)
          ?? accountsData.accounts[0];
        setActiveAccountId(firstAccount?.id ?? null);
        if (firstAccount) {
          void api<{ tags: Tag[] }>(
            `/api/tags?accountId=${firstAccount.id}`,
          )
            .then((data) => {
              if (!cancelled) setTags(data.tags);
            })
            .catch(() => undefined);
        }

        const params = new URLSearchParams(window.location.search);
        const authError = params.get("auth_error");
        const connected = params.get("connected");
        if (authError) setStatus(`Connection failed: ${authError}`);
        else if (connected) setStatus(`Connected ${connected}. Syncing…`);

        await loadThreads(firstAccount?.id ?? 1, folderRef.current ?? undefined);

        // Auto-sync once on first load so fresh mail appears without a click.
        if (!autoSyncedRef.current && firstAccount) {
          autoSyncedRef.current = true;
          void syncAndRefresh(firstAccount.id).catch(() => undefined);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadThreads, syncAndRefresh]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("mail-theme", JSON.stringify(next ? "dark" : "light"));
      } catch {
        // Private mode etc. — the class toggle already applied for this session.
      }
      return next;
    });
  };

  const selectFolder = (folderArg: string | null) => {
    updateMailboxView(() => {
      folderRef.current = folderArg;
      setFolder(folderArg);
      setSelected(null);
      setQuery("");
    });
    void loadThreads(accountId, folderArg ?? undefined).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
    void syncAndRefresh(accountId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const selectAccount = (nextAccountId: number) => {
    if (nextAccountId === accountId) return;

    updateMailboxView(() => {
      setActiveAccountId(nextAccountId);
      folderRef.current = "INBOX";
      setFolder("INBOX");
      setSelected(null);
      setQuery("");
      setLoading(true);
    });

    try {
      window.localStorage.setItem("mail-account-id", String(nextAccountId));
    } catch {
      // Account selection still works when storage is unavailable.
    }

    void api<{ tags: Tag[] }>(`/api/tags?accountId=${nextAccountId}`)
      .then((data) => setTags(data.tags))
      .catch(() => setTags([]));
    void loadThreads(nextAccountId, "INBOX")
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoading(false));
    void syncAndRefresh(nextAccountId).catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const openThread = async (thread: StoredThread) => {
    try {
      const data = await api<{ message: StoredMessage }>(`/api/messages/${thread.id}`);
      updateMailboxView(() => setSelected(data.message));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const act = async (action: string) => {
    if (!selected) return;
    try {
      const data = await api<{ message: StoredMessage }>(
        `/api/messages/${selected.id}/actions`,
        { method: "POST", body: JSON.stringify({ action }) },
      );
      if (action === "trash" || action === "delete") {
        updateMailboxView(() => setSelected(null));
      } else {
        setSelected(data.message);
      }
      await loadThreads(accountId, folderRef.current ?? undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const runSearch = async (term?: string) => {
    const q = (term ?? query).trim();
    if (!q) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ accountId: String(accountId), q });
      const data = await api<{ messages: StoredMessage[]; total: number }>(
        `/api/search?${params}`,
      );
      setThreads(
        data.messages.map((message) => ({
          id: message.id,
          accountId: message.accountId,
          providerThreadId: String(message.id),
          subject: message.subject,
          lastMessageAt: message.date,
          snippet: message.snippet ?? null,
          messageCount: 1,
          unreadCount: message.flags.seen ? 0 : 1,
        })),
      );
      setHasMore(false);
      setOffset(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSearching(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      // Render the local projection immediately; remote reconciliation happens
      // in the background and refreshes the list when it completes.
      await loadThreads(accountId, folderRef.current ?? undefined);
      void syncAndRefresh(accountId)
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setSyncing(false));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSyncing(false);
    }
  };

  const listLabel = query ? `Results for “${query}”` : activeFolder.label;

  return (
    <div className="mail-app flex h-dvh overflow-hidden bg-background text-foreground">
      <div className="mobile-topbar">
        <button className="mobile-icon-button" aria-label="Open mail menu" onClick={() => setMobileMenuOpen(true)}>
          <Menu />
        </button>
        <form className="mobile-search" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
          <Search />
          <input aria-label="Search mail" placeholder="Search mail" value={query} onChange={(event) => setQuery(event.target.value)} />
        </form>
         <AccountAvatar account={activeAccount} className="h-9 w-9" />
      </div>
      <Sidebar
        accounts={accounts}
        loading={loading}
        syncing={syncing}
        tags={tags}
        activeFolder={activeFolder.id}
        folder={folder}
        unreadInView={unreadInView}
        oauthConfigured={oauthConfigured}
        dark={dark}
        onSync={syncNow}
        onSelectFolder={selectFolder}
        activeAccountId={accountId}
        onSelectAccount={selectAccount}
         onCompose={() => updateMailboxView(() => setComposing(true))}
        onToggleTheme={toggleTheme}
        onTagSearch={(name) => {
          setQuery(name);
          void runSearch(name);
        }}
      />
      {mobileMenuOpen && (
        <button className="mobile-drawer-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />
      )}
      <div className={cn("mobile-drawer", mobileMenuOpen && "is-open")}>
        <Sidebar
          accounts={accounts}
          loading={loading}
          syncing={syncing}
          tags={tags}
          activeFolder={activeFolder.id}
          folder={folder}
          unreadInView={unreadInView}
          oauthConfigured={oauthConfigured}
          dark={dark}
          onSync={syncNow}
          onSelectFolder={(nextFolder) => { setMobileMenuOpen(false); selectFolder(nextFolder); }}
          activeAccountId={accountId}
          onSelectAccount={(nextAccountId) => { setMobileMenuOpen(false); selectAccount(nextAccountId); }}
          onCompose={() => { setMobileMenuOpen(false); updateMailboxView(() => setComposing(true)); }}
          onToggleTheme={toggleTheme}
          onTagSearch={(name) => { setMobileMenuOpen(false); setQuery(name); void runSearch(name); }}
        />
      </div>

      <main className="mail-main flex min-w-0 flex-1">
        <section className={cn("mail-list flex w-[400px] shrink-0 flex-col border-r border-border bg-background", selected && "mobile-list-hidden")}>
          <div className="p-3">
            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search mail"
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </form>
          </div>

          <div className="flex items-center justify-between px-4 pb-2 pt-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {listLabel}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {searching ? "…" : threads.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {loading ? (
              <div className="space-y-1">
                <Skeleton className="h-[68px] rounded-lg" />
                <Skeleton className="h-[68px] rounded-lg" />
                <Skeleton className="h-[68px] rounded-lg" />
                <Skeleton className="h-[68px] rounded-lg" />
                <Skeleton className="h-[68px] rounded-lg" />
              </div>
            ) : searching ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : threads.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">
                  {query ? "No matches" : `${activeFolder.label} is empty`}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {query
                    ? "Try a different search."
                    : "Sync an account to pull mail into this folder."}
                </p>
              </div>
            ) : (
              <>
                {threads.map((thread) => {
                  const unread = (thread.unreadCount ?? 0) > 0;

                  return (
                    <button
                      key={thread.id}
                      onClick={() => void openThread(thread)}
                       className={cn(
                         "mail-thread mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                        selected?.id === thread.id
                          ? "bg-card shadow-xs ring-1 ring-border"
                          : "hover:bg-accent/60",
                      )}
                    >
                       <div className="flex items-center gap-3">
                          <SenderAvatar
                            sender={thread.lastFrom?.[0]}
                            accounts={accounts}
                            className="mail-thread-avatar h-10 w-10"
                          />
                         <div className="min-w-0 flex-1">
                           <div className="flex items-baseline justify-between gap-2">
                             <span
                              className={cn(
                                "truncate text-[13px]",
                                unread ? "font-semibold" : "font-medium text-foreground/90",
                              )}
                            >
                               {thread.lastFrom?.[0]?.name ?? thread.lastFrom?.[0]?.address ?? "Unknown sender"}
                             </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {relativeTime(thread.lastMessageAt)}
                            </span>
                          </div>
                           <p
                             className={cn(
                               "mt-0.5 truncate text-[13px]",
                               unread ? "text-foreground/80" : "text-muted-foreground",
                             )}
                           >
                             {thread.subject}{thread.snippet ? ` · ${thread.snippet}` : ""}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            {thread.messageCount != null && thread.messageCount > 1 && (
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {thread.messageCount} messages
                              </span>
                            )}
                            {unread && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {hasMore && (
                  <div className="p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                    >
                      {loadingMore && <Loader2 className="animate-spin" />}
                      {loadingMore ? "Syncing & loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className={cn("mail-detail flex min-w-0 flex-1 flex-col bg-background", !selected && !composing && "mobile-detail-hidden")}>
          {error && (
            <div className="border-b border-destructive/30 bg-destructive/5 px-6 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {status && (
            <div className="border-b border-primary/20 bg-primary/5 px-6 py-2 text-xs text-primary">
              {status}
            </div>
          )}

          {composing ? (
            <ComposePane
              accountId={accountId}
              onCancel={() => updateMailboxView(() => setComposing(false))}
              onSent={() => {
                updateMailboxView(() => setComposing(false));
                void loadThreads(accountId, folderRef.current ?? undefined);
              }}
            />
             ) : selected ? (
             <MessagePane
               message={selected}
               accounts={accounts}
               onAction={act}
                onBack={() => updateMailboxView(() => setSelected(null))}
             />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Select a conversation</p>
                <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  Loaded from the Next.js API — sync is wired to the same backend the
                  mobile app talks to.
                </p>
              </div>
               <Button size="sm" onClick={() => updateMailboxView(() => setComposing(true))}>
                <PenLine />
                Compose
              </Button>
            </div>
          )}
        </section>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Mailbox navigation">
        <button className="active" onClick={() => selectFolder("INBOX")}><Inbox /><span>Inbox</span><b>{unreadInView || ""}</b></button>
        <button onClick={() => updateMailboxView(() => setComposing(true))}><PenLine /><span>Compose</span></button>
        <button onClick={() => setMobileMenuOpen(true)}><Menu /><span>Labels</span></button>
      </nav>
    </div>
  );
}

function Sidebar({
  accounts,
  loading,
  syncing,
  tags,
  activeFolder,
  folder,
  unreadInView,
  oauthConfigured,
  dark,
  onSync,
  onSelectFolder,
  activeAccountId,
  onSelectAccount,
  onCompose,
  onToggleTheme,
  onTagSearch,
}: {
  accounts: EmailAccount[];
  loading: boolean;
  syncing: boolean;
  tags: Tag[];
  activeFolder: string;
  folder: string | null;
  unreadInView: number;
  oauthConfigured: boolean;
  dark: boolean;
  onSync: () => void;
  onSelectFolder: (folder: string | null) => void;
  activeAccountId: number;
  onSelectAccount: (accountId: number) => void;
  onCompose: () => void;
  onToggleTheme: () => void;
  onTagSearch: (name: string) => void;
}) {
  const account = accounts.find((entry) => entry.id === activeAccountId) ?? accounts[0];

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-xs shadow-primary/30">
            <Mail className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Mail</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-sidebar-muted-foreground"
          aria-label="Sync"
          title="Sync now"
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw className={syncing ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="px-3">
        <Button
          className="w-full justify-start gap-2 shadow-sm"
          size="sm"
          onClick={onCompose}
        >
          <PenLine />
          Compose
        </Button>
      </div>

      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        <div className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-muted-foreground">
          Mail
        </div>
        {FOLDERS.map((def) => {
          const active = def.id === activeFolder;
          return (
            <button
              key={def.id}
              onClick={() => onSelectFolder(def.folder)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-row-active text-sidebar-foreground shadow-xs"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
              )}
            >
              <def.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{def.label}</span>
              {active && unreadInView > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                  {unreadInView}
                </span>
              )}
            </button>
          );
        })}

        {tags.length > 0 && (
          <>
            <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-sidebar-muted-foreground">
              Tags
            </div>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => onTagSearch(tag.name)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? "var(--primary)" }}
                />
                <span className="flex-1 text-left">{tag.name}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="space-y-1.5 border-t border-sidebar-border p-3">
        {account && (
          <div className="rounded-lg px-2 py-1.5">
            <div className="flex items-center gap-2.5">
             <AccountAvatar account={account} className="h-7 w-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {account.email}
              </p>
              <p className="truncate text-[11px] text-sidebar-muted-foreground">
                {account.provider} · {loading ? "loading…" : "synced"}
              </p>
            </div>
            </div>
            {accounts.length > 1 && (
              <div className="mt-2 space-y-0.5 border-t border-sidebar-border pt-2">
                {accounts.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onSelectAccount(entry.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors",
                      entry.id === activeAccountId
                        ? "bg-sidebar-row-active text-sidebar-foreground"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                    )}
                  >
                    <AccountAvatar account={entry} className="h-5 w-5 text-[8px]" />
                    <span className="min-w-0 flex-1 truncate">{entry.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-sidebar-muted-foreground"
            aria-label="Toggle theme"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={onToggleTheme}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>

          {oauthConfigured ? (
            <Button
              className="flex-1 justify-start gap-2"
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href = "/api/auth/gmail";
              }}
            >
              <MailPlus className="h-4 w-4" />
              Connect Gmail
            </Button>
          ) : accounts.length === 0 ? (
            <p className="px-2 text-[11px] leading-relaxed text-sidebar-muted-foreground">
              Dev mode: no Gmail credentials set, so this is running against the seeded
              demo inbox. Set GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET to enable real login.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function MessagePane({
  message,
  accounts,
  onAction,
  onBack,
}: {
  message: StoredMessage;
  accounts: EmailAccount[];
  onAction: (action: string) => void;
  onBack?: () => void;
}) {
  const sender = message.from[0];
  const recipients = message.to
    .map((entry) => entry.address)
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <header className="border-b border-border bg-background px-8 py-5">
        {onBack && <Button className="mobile-back-button" size="icon" variant="ghost" aria-label="Back to inbox" onClick={onBack}><ArrowLeft /></Button>}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {message.subject}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <SenderAvatar
                  sender={sender}
                  accounts={accounts}
                  className="h-7 w-7"
                  size={56}
                />
              <span className="font-medium text-foreground">
                {sender?.name ?? sender?.address}
              </span>
              {sender?.name && sender.address && <span>{sender.address}</span>}
              {recipients && <span className="truncate">to {recipients}</span>}
              <span>·</span>
              <span>{relativeTime(message.date)}</span>
            </div>
            {message.tags && message.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {message.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="px-1.5 py-0 text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void onAction(message.flags.seen ? "unread" : "read")}
            >
              {message.flags.seen ? "Mark unread" : "Mark read"}
            </Button>
            <Button
              size="icon"
              variant={message.flags.starred ? "secondary" : "outline"}
              aria-label="Star"
              title={message.flags.starred ? "Unstar" : "Star"}
              onClick={() => void onAction(message.flags.starred ? "unstar" : "star")}
            >
              <Star className={message.flags.starred ? "fill-current" : ""} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction("reply")}>
              <PenLine />
              Reply
            </Button>
            <Button
              size="icon"
              variant="outline"
              aria-label="Move to trash"
              title="Move to trash"
              onClick={() => void onAction("trash")}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <Card className="mx-auto max-w-2xl p-6">
          <MailBody message={message} />
        </Card>
      </div>
    </>
  );
}

function MailBody({ message }: { message: StoredMessage }) {
  if (message.html) {
    const clean = DOMPurify.sanitize(message.html);
    return (
      <div
        className="mail-body text-[15px] leading-relaxed"
        // Sanitized above via DOMPurify so this is safe to render as HTML.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
      {message.text ?? "(no body)"}
    </p>
  );
}

function ComposePane({
  accountId,
  onCancel,
  onSent,
}: {
  accountId: number;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await api("/api/compose", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          to: to.split(",").map((entry) => entry.trim()).filter(Boolean),
          subject,
          text: body,
        }),
      });
      onSent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSending(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">New message</span>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onCancel}>
          <X />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && <p className="mb-4 text-xs text-destructive">{error}</p>}
        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              rows={14}
              className="resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={sending || !subject}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
