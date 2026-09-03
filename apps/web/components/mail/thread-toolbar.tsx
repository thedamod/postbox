"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Reply,
  Star,
  Trash2,
  MailOpen,
  Mail,
} from "lucide-react";
import { Button } from "@postbox/ui";
import { cn } from "@postbox/ui";
import { applyThreadAction } from "@/lib/mail/thread-state";
import { mailFolderHref } from "@/lib/mail/routes";
import type { MailViewId, ThreadDetail } from "@/lib/mail/types";
import { useComposer } from "@/components/shell/composer";

type ThreadToolbarProps = {
  accountId: string;
  folder: MailViewId;
  thread: ThreadDetail;
  prevThreadId?: string | null;
  nextThreadId?: string | null;
};

/**
 * Conversation actions: reply, star,
 * read state, archive, trash, and prev/next navigation in folder context.
 */
export function ThreadToolbar({ accountId, folder, thread, prevThreadId, nextThreadId }: ThreadToolbarProps) {
  const router = useRouter();
  const { openComposer } = useComposer();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messageIds = thread.messages.map((message) => message.id);
  const latest = thread.messages[thread.messages.length - 1];

  const run = async (key: string, fn: () => Promise<void>) => {
    setPending(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(null);
    }
  };

  const reply = (all: boolean) => {
    if (!latest) return;
    const to = all
      ? [latest.from.email, ...latest.to.map((to) => to.email)].join(", ")
      : latest.from.email;
    openComposer({
      to,
      subject: latest.subject.startsWith("Re:") ? latest.subject : `Re: ${latest.subject}`,
      text: `\n\nOn ${latest.date}, ${latest.from.name} wrote:\n${latest.text ?? latest.snippet}`,
      inReplyTo: latest.id,
      threadId: thread.id,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => router.push(mailFolderHref(folder, undefined, accountId))} aria-label="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" onClick={() => reply(false)} aria-label="Reply">
          <Reply className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={thread.favorite ? "Unstar" : "Star"}
          disabled={pending !== null}
          onClick={() => run("star", () => applyThreadAction(messageIds, { type: "starred", starred: !thread.favorite })) }
        >
          <Star className={cn("h-4 w-4", thread.favorite && "fill-yellow-400 text-yellow-400")} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={thread.unread ? "Mark read" : "Mark unread"}
          disabled={pending !== null}
          onClick={() => run("read", () => applyThreadAction(messageIds, { type: "unread", unread: !thread.unread }))}
        >
          {thread.unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Archive"
          disabled={pending !== null}
          onClick={() => run("archive", () => applyThreadAction(messageIds, { type: "archive" }))}
        >
          <Archive className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Move to trash"
          disabled={pending !== null}
          onClick={() => run("trash", () => applyThreadAction(messageIds, { type: "move", destination: "trash" }))}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous thread" disabled={!prevThreadId}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Next thread" disabled={!nextThreadId}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="px-2 text-xs text-destructive">{error}</p>}
      {pending && <p className="px-2 text-xs text-muted-foreground">Working…</p>}
    </div>
  );
}
