import Link from "next/link";
import { Button } from "@postbox/ui";
import { mailFolderHref } from "@/lib/mail/routes";
import { loadMailAccounts } from "@/lib/mail/server";

export const dynamic = "force-dynamic";

/** Connected mailboxes and account lifecycle. */
export default async function AccountsSettingsPage() {
  const accounts = await loadMailAccounts().catch(() => []);

  return (
    <section className="flex flex-col gap-3" aria-label="Accounts">
      <h2 className="text-sm font-semibold">Connected mailboxes</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No accounts yet. Connect Gmail to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{account.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
              </span>
              <Link href={mailFolderHref("inbox", undefined, account.id)}>
                <Button variant="outline" size="sm">Open inbox</Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Link href="/api/auth/gmail">
          <Button size="sm">Add Gmail account</Button>
        </Link>
      </div>
    </section>
  );
}
