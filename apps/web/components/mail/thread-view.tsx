"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MailViewId, ThreadDetail } from "@/lib/mail/types";
import { applyThreadAction } from "@/lib/mail/thread-state";
import { useComposer } from "@/components/shell/composer";
import { MessageCard } from "./message-card";
import { ThreadToolbar } from "./thread-toolbar";

type ThreadViewProps = {
  accountId: string;
  folder: MailViewId;
  thread: ThreadDetail;
  prevThreadId?: string | null;
  nextThreadId?: string | null;
};

/**
 * Conversation reader: toolbar actions,
 * stacked message cards, and keyboard shortcuts (`r` reply, `j`/`k`
 * prev/next, `u` toggle unread).
 */
export function ThreadView({ accountId, folder, thread, prevThreadId, nextThreadId }: ThreadViewProps) {
  const router = useRouter();
  const { openComposer } = useComposer();
  const messageIds = thread.messages.map((message) => message.id);
  const latest = thread.messages[thread.messages.length - 1];

  // Mark the thread read on open (fire and forget, then refresh counts).
  useEffect(() => {
    if (!thread.unread) return;
    applyThreadAction(messageIds, { type: "unread", unread: false })
      .then(() => router.refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // Thread-local shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "r" && latest) {
        openComposer({
          to: latest.from.email,
          subject: latest.subject.startsWith("Re:") ? latest.subject : `Re: ${latest.subject}`,
          text: `\n\nOn ${latest.date}, ${latest.from.name} wrote:\n${latest.text ?? latest.snippet}`,
          inReplyTo: latest.id,
          threadId: thread.id,
        });
      } else if (event.key === "u") {
        applyThreadAction(messageIds, { type: "unread", unread: !thread.unread })
          .then(() => router.refresh())
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [latest, messageIds, openComposer, router, thread.id, thread.unread]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-4">
      <ThreadToolbar
        accountId={accountId}
        folder={folder}
        thread={thread}
        prevThreadId={prevThreadId}
        nextThreadId={nextThreadId}
      />
      <h1 className="px-1 text-lg font-semibold leading-snug">{thread.subject}</h1>
      <div className="flex flex-col gap-2 pb-8">
        {thread.messages.map((message, index) => (
          <MessageCard
            key={message.id}
            message={message}
            accountId={accountId}
            defaultOpen={index === thread.messages.length - 1 || thread.messages.length === 1}
          />
        ))}
      </div>
    </div>
  );
}
