"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Archive,
  FilePenLine,
  Inbox,
  Mail,
  Send,
  Settings,
  Star,
  Trash2,
  TriangleAlert,
  Plus,
} from "lucide-react";
import { Button } from "@postbox/ui";
import { cn } from "@postbox/ui";
import { mailFoldersForAccount } from "@/lib/mail/folders";
import { folderTitle, mailFolderHref, mailSettingsHref } from "@/lib/mail/routes";
import type {
  FolderCounts,
  MailAccount,
  MailCollection,
  MailFolderId,
  MailViewId,
} from "@/lib/mail/types";
import { useMailShell } from "./app-shell";

const FOLDER_ICONS: Record<MailFolderId, typeof Inbox> = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  drafts: FilePenLine,
  all: Mail,
  spam: TriangleAlert,
  trash: Trash2,
  archived: Archive,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type SidebarProps = {
  accounts: MailAccount[];
  account: MailAccount;
  counts: FolderCounts;
  collections: MailCollection[];
};

/**
 * Inbox sidebar (mirrors redakt `sidebar.tsx`): account switcher, compose
 * entry point, folder nav with counts, label collections, settings link.
 */
export function Sidebar({ accounts, account, counts, collections }: SidebarProps) {
  const { activeFolder } = useMailShell();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const folders = mailFoldersForAccount();

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-sidebar p-3 text-sidebar-foreground md:flex">
      <div className="relative">
        <button
          type="button"
          onClick={() => setSwitcherOpen((open) => !open)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sidebar-accent"
          aria-expanded={switcherOpen}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials(account.displayName || account.email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{account.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
          </span>
        </button>
        {switcherOpen && accounts.length > 1 && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {accounts.map((candidate) => (
              <Link
                key={candidate.id}
                href={mailFolderHref("inbox", undefined, candidate.id)}
                onClick={() => setSwitcherOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                  candidate.id === account.id && "bg-accent",
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {initials(candidate.displayName || candidate.email)}
                </span>
                <span className="min-w-0 flex-1 truncate">{candidate.email}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("postbox:compose"))}
        className="w-full"
      >
        <Plus className="h-4 w-4" /> New email
        <kbd className="ml-auto hidden text-[10px] opacity-60 lg:inline">⌥N</kbd>
      </Button>

      <nav aria-label="Folders" className="flex flex-col gap-0.5">
        {folders.map((folder) => {
          const Icon = FOLDER_ICONS[folder.id];
          const active = activeFolder === folder.id;
          const count = counts[folder.id] ?? 0;
          return (
            <Link
              key={folder.id}
              href={mailFolderHref(folder.id, undefined, account.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{folderTitle(folder.id)}</span>
              {count > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {collections.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Labels
          </p>
          {collections.map((collection) => {
            const view = `collection:${collection.id}` as MailViewId;
            const active = activeFolder === view;
            return (
              <Link
                key={collection.id}
                href={mailFolderHref(view, undefined, account.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: collection.color ?? "#6366f1" }}
                />
                <span className="flex-1 truncate">{collection.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-auto">
        <Link
          href={mailSettingsHref("account")}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent/60"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
