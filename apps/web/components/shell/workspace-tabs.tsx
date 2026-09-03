"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@postbox/ui";
import { mailFolderHref, mailThreadHref } from "@/lib/mail/routes";
import type { MailViewId } from "@/lib/mail/types";
import { useMailShell } from "./app-shell";

/**
 * Persistent tab rail: open threads
 * stay one click away and survive reloads via `lib/mail/workspace-tabs.ts`.
 */
export function WorkspaceTabs() {
  const { account, tabs, activeThreadId, activeFolder, closeTab } = useMailShell();
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5" role="tablist" aria-label="Open threads">
      <Link
        href={mailFolderHref(activeFolder, undefined, account.id)}
        role="tab"
        aria-selected={activeThreadId === null}
        className={cn(
          "shrink-0 rounded-md px-2 py-1 text-xs",
          activeThreadId === null ? "bg-accent font-medium" : "hover:bg-accent/60",
        )}
      >
        List
      </Link>
      {tabs.map((tab) => {
        const active = tab.threadId === activeThreadId;
        const folder = (tab.folder as MailViewId) ?? activeFolder;
        return (
          <span
            key={tab.threadId}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md py-1 pl-2 pr-1 text-xs",
              active ? "bg-accent font-medium" : "hover:bg-accent/60",
            )}
          >
            <Link
              href={mailThreadHref(folder, tab.threadId, undefined, account.id)}
              className="max-w-40 truncate"
            >
              {tab.subject || `Thread ${tab.threadId}`}
            </Link>
            <button
              type="button"
              aria-label={`Close thread ${tab.threadId}`}
              onClick={() => closeTab(tab.threadId)}
              className="rounded p-0.5 hover:bg-background"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
