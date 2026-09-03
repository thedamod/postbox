"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea } from "@postbox/ui";
import { sendMail } from "@/lib/mail/thread-state";
import type { MailAccount } from "@/lib/mail/types";

export type ComposerDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  threadId?: string;
};

type ComposerValue = {
  open: boolean;
  draft: ComposerDraft;
  openComposer: (draft?: Partial<ComposerDraft>) => void;
  closeComposer: () => void;
};

const ComposerContext = createContext<ComposerValue | null>(null);

export function useComposer(): ComposerValue {
  const value = useContext(ComposerContext);
  if (!value) throw new Error("useComposer must be used inside <ComposerProvider>.");
  return value;
}

const EMPTY_DRAFT: ComposerDraft = { to: "", cc: "", bcc: "", subject: "", text: "" };

/**
 * Standalone composer (mirrors redakt `standalone-composer.tsx`): a modal
 * draft opened from anywhere via `postbox:compose` or `openComposer()`.
 * Replies prefill subject/thread context and send through `/api/compose`.
 */
export function ComposerProvider({ account, children }: { account: MailAccount; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_DRAFT);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const openComposer = useCallback((next?: Partial<ComposerDraft>) => {
    setDraft({ ...EMPTY_DRAFT, ...next });
    setError(null);
    setOpen(true);
  }, []);

  const closeComposer = useCallback(() => {
    if (!sending) setOpen(false);
  }, [sending]);

  useEffect(() => {
    const onCompose = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ComposerDraft>>).detail ?? {};
      openComposer(detail);
    };
    window.addEventListener("postbox:compose", onCompose as EventListener);
    return () => window.removeEventListener("postbox:compose", onCompose as EventListener);
  }, [openComposer]);

  // Escape closes the composer.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeComposer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeComposer]);

  const send = useCallback(async () => {
    if (!draft.to.trim() || !draft.subject.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMail({
        accountId: account.id,
        to: draft.to,
        cc: draft.cc || undefined,
        bcc: draft.bcc || undefined,
        subject: draft.subject,
        text: draft.text,
      });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }, [account.id, draft, router, sending]);

  const value = useMemo<ComposerValue>(
    () => ({ open, draft, openComposer, closeComposer }),
    [open, draft, openComposer, closeComposer],
  );

  return (
    <ComposerContext.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="New email">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">New email</h2>
              <Button variant="ghost" size="sm" onClick={closeComposer}>Close</Button>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <Label htmlFor="composer-to">To</Label>
                <Input
                  id="composer-to"
                  placeholder="ada@example.com"
                  value={draft.to}
                  onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="composer-cc">Cc</Label>
                  <Input id="composer-cc" value={draft.cc} onChange={(event) => setDraft((prev) => ({ ...prev, cc: event.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="composer-bcc">Bcc</Label>
                  <Input id="composer-bcc" value={draft.bcc} onChange={(event) => setDraft((prev) => ({ ...prev, bcc: event.target.value }))} />
                </div>
              </div>
              <div>
                <Label htmlFor="composer-subject">Subject</Label>
                <Input
                  id="composer-subject"
                  value={draft.subject}
                  onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="composer-body">Body</Label>
                <Textarea
                  id="composer-body"
                  rows={8}
                  value={draft.text}
                  onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
                />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeComposer} disabled={sending}>Discard</Button>
                <Button onClick={send} disabled={sending || !draft.to.trim() || !draft.subject.trim()}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ComposerContext.Provider>
  );
}
