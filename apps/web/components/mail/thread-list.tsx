"use client";

import Link from "next/link";
import { Paperclip, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@postbox/ui";
import { cn } from "@postbox/ui";
import { mailThreadHref } from "@/lib/mail/routes";
import type { MailViewId, Thread } from "@/lib/mail/types";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const thisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, thisYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

type ThreadListProps = {
  accountId: string;
  folder: MailViewId;
  threads: Thread[];
  total: number;
  hasMore: boolean;
  activeThreadId?: string | null;
  queryString?: string;
};

/**
 * Conversation list: rows link to the
 * canonical thread URL in folder context; selection state comes from the URL.
 */
export function ThreadList({ accountId, folder, threads, total, hasMore, activeThreadId, queryString }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium">Nothing here</p>
        <p className="max-w-60 text-xs text-muted-foreground">
          This view is empty. Try a different search or folder.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto" role="list" aria-label="Threads">
      {threads.map((thread) => {
        const active = thread.id === activeThreadId;
        const params = queryString ? `?${queryString}` : "";
        return (
          <Link
            key={thread.id}
            role="listitem"
            href={`${mailThreadHref(folder, thread.id, undefined, accountId)}${params}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex gap-3 border-b border-border px-3 py-2.5 text-left hover:bg-accent/50",
              active && "bg-accent",
              thread.unread && "bg-card",
            )}
          >
            <Avatar className="mt-0.5 h-9 w-9 shrink-0">
              <AvatarFallback>{initials(thread.from.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={cn("truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>
                  {thread.from.name}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  {thread.hasAttachment && <Paperclip className="h-3 w-3" />}
                  {formatDate(thread.date)}
                </span>
              </span>
              <span className={cn("block truncate text-[13px]", thread.unread ? "font-medium" : "text-muted-foreground")}>
                {thread.subject}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{thread.snippet}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                {thread.favorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                {thread.messageCount > 1 && <span>{thread.messageCount} messages</span>}
              </span>
            </span>
            {thread.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
          </Link>
        );
      })}
      <div className="border-b border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
        {hasMore ? `${threads.length} of ${total} — keep scrolling for more` : `${total} conversation${total === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
