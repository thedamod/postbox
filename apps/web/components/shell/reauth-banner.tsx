"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@postbox/ui";
import { REAUTH_EVENT, type ReauthDetail } from "@/lib/mail/thread-state";

/**
 * Dead-grant banner: when Google rejects the stored refresh token the API
 * answers 401 with `code: "reauth_required"`, and every client path that
 * sees it broadcasts REAUTH_EVENT. The banner links straight back into the
 * OAuth flow so the mailbox is one click from working again.
 */
export function ReauthBanner({ accountId }: { accountId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onReauth = (event: Event) => {
      const detail = (event as CustomEvent<ReauthDetail>).detail;
      // Show for this account, or for account-agnostic signals.
      if (detail.accountId == null || String(detail.accountId) === accountId) {
        setVisible(true);
      }
    };
    window.addEventListener(REAUTH_EVENT, onReauth as EventListener);
    return () => window.removeEventListener(REAUTH_EVENT, onReauth as EventListener);
  }, [accountId]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <span className="min-w-0 flex-1">
        <strong className="font-semibold">Gmail disconnected.</strong>{" "}
        <span className="text-muted-foreground">
          Google revoked access — reconnect to keep syncing this mailbox.
        </span>
      </span>
      <Link href="/api/auth/gmail">
        <Button size="sm">Reconnect</Button>
      </Link>
      <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
        Dismiss
      </Button>
    </div>
  );
}
