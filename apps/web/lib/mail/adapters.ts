import type {
  StoredMessage,
  StoredThread,
} from "@postbox/email-client/domain";
import type { Message, Thread, ThreadDetail } from "./types";
import { folderDefForView } from "./folders";

function primaryAddress(message: StoredMessage): { name: string; email: string } {
  const from = message.from[0];
  return {
    name: from?.name || from?.address || "(unknown)",
    email: from?.address || "",
  };
}

function snippetOf(message: StoredMessage): string {
  return message.snippet || message.text?.slice(0, 140) || "";
}

function viewAddress(list: StoredMessage["from"]): Message["to"] {
  return list.map((address) => ({
    name: address.name || address.address,
    email: address.address,
  }));
}

export function threadToView(
  thread: StoredThread,
  messages: StoredMessage[],
  view: string,
): Thread {
  const latest = messages[messages.length - 1];
  const unread = messages.some((message) => !message.flags.seen);
  const favorite = messages.some((message) => message.flags.starred);
  const hasAttachment = messages.some(
    (message) => (message.attachments?.length ?? 0) > 0,
  );
  return {
    id: String(thread.id),
    folder: view,
    subject: thread.subject || latest?.subject || "(no subject)",
    from: latest ? primaryAddress(latest) : { name: "(unknown)", email: "" },
    snippet: thread.snippet || (latest ? snippetOf(latest) : ""),
    date: thread.lastMessageAt || latest?.date || new Date(0).toISOString(),
    unread,
    favorite,
    collectionIds: latest?.tags ?? [],
    hasAttachment,
    messageCount: thread.messageCount ?? messages.length,
  };
}

export function messageToView(message: StoredMessage, threadId: string): Message {
  return {
    id: String(message.id),
    threadId,
    from: primaryAddress(message),
    to: viewAddress(message.to),
    cc: viewAddress(message.cc),
    bcc: viewAddress(message.bcc),
    date: message.date || message.createdAt,
    subject: message.subject,
    snippet: snippetOf(message),
    text: message.text ?? undefined,
    html: message.html,
    attachments: (message.attachments ?? []).map((attachment, index) => ({
      id: String(attachment.id ?? `${message.id}:${index}`),
      filename: attachment.filename || "attachment",
      mimeType: attachment.contentType || "application/octet-stream",
      size: attachment.size ?? 0,
      contentId: attachment.contentId ?? undefined,
      inline: attachment.isInline ?? false,
    })),
    unread: !message.flags.seen,
    starred: message.flags.starred,
  };
}

export function storedThreadToDetail(
  thread: StoredThread,
  messages: StoredMessage[],
  view: string,
): ThreadDetail {
  const item = threadToView(thread, messages, view);
  return {
    ...item,
    messages: messages.map((message) => messageToView(message, String(thread.id))),
  };
}

/** Storage folder filter for a view; null = all mail. */
export function storageFolderForView(view: string): string | null | undefined {
  if (view.startsWith("collection:")) return undefined;
  const def = folderDefForView(view);
  // undefined = unknown view (caller should 404); null = all mail.
  if (!def) return undefined;
  return def.storageFolder;
}
