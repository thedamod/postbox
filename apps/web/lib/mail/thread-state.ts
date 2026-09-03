"use client";

/**
 * Client-side thread mutations (mirrors redakt `lib/mail/thread-state.ts`).
 * Wraps the existing message-action API so thread list and thread view share
 * one mutation path with optimistic updates at the call site.
 */

export type ThreadAction =
  | { type: "unread"; unread: boolean }
  | { type: "starred"; starred: boolean }
  | { type: "archive" }
  | { type: "move"; destination: "inbox" | "spam" | "trash" };

async function postAction(messageId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Action failed (${res.status})`);
  }
}

/** Apply a thread-level action to every message id in the thread. */
export async function applyThreadAction(
  messageIds: string[],
  action: ThreadAction,
): Promise<void> {
  for (const messageId of messageIds) {
    switch (action.type) {
      case "unread":
        await postAction(messageId, { action: action.unread ? "unread" : "read" });
        break;
      case "starred":
        await postAction(messageId, { action: action.starred ? "star" : "unstar" });
        break;
      case "archive":
        await postAction(messageId, { action: "move", folder: "[Gmail]/All Mail" });
        break;
      case "move": {
        const folder =
          action.destination === "inbox"
            ? "INBOX"
            : action.destination === "spam"
              ? "[Gmail]/Spam"
              : "[Gmail]/Trash";
        await postAction(messageId, { action: "move", folder });
        break;
      }
    }
  }
}

export async function sendMail(input: {
  accountId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
}): Promise<void> {
  const res = await fetch("/api/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: Number(input.accountId), to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: input.text }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Send failed (${res.status})`);
  }
}
