"use client";

import { useState } from "react";
import { ChevronDown, Download, Paperclip } from "lucide-react";
import { Avatar, AvatarFallback } from "@postbox/ui";
import { cn } from "@postbox/ui";
import type { Message } from "@/lib/mail/types";
import { MessageBody } from "./message-body";

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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Single message card (mirrors redakt `message-card.tsx`): collapsible
 * headers, sanitized body, and non-inline attachments.
 */
export function MessageCard({
  message,
  accountId,
  defaultOpen,
}: {
  message: Message;
  accountId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [details, setDetails] = useState(false);
  const attachments = message.attachments.filter((file) => !file.inline);

  return (
    <article className={cn("rounded-xl border border-border bg-card", !open && "bg-muted/30")}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials(message.from.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", message.unread ? "font-semibold" : "font-medium")}>
              {message.from.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(message.date)}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            to {message.to.map((to) => to.email).join(", ") || "me"}
          </span>
        </span>
        {attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            className="mb-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {details ? "Hide details" : "Show details"}
          </button>
          {details && (
            <dl className="mb-3 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">From</dt>
              <dd className="break-all">{message.from.email}</dd>
              <dt className="text-muted-foreground">To</dt>
              <dd className="break-all">{message.to.map((to) => to.email).join(", ")}</dd>
              {message.cc && message.cc.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Cc</dt>
                  <dd className="break-all">{message.cc.map((cc) => cc.email).join(", ")}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatDate(message.date)}</dd>
            </dl>
          )}
          <MessageBody html={message.html} text={message.text} />
          {attachments.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={`/api/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(file.id)}?accountId=${encodeURIComponent(accountId)}`}
                    className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs hover:bg-accent"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{file.filename}</span>
                    <span className="text-muted-foreground">{Math.round(file.size / 1024)} KB</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}
