import { redirect } from "next/navigation";
import { loadMailAccounts } from "@/lib/mail/server";

/** Resolve the default account and redirect to its inbox (like redakt). */
export default async function MailIndexPage() {
  const accounts = await loadMailAccounts().catch(() => []);
  const first = accounts[0];
  if (!first) redirect("/mail/settings/account");
  redirect(`/mail/a/${encodeURIComponent(first.id)}/inbox`);
}
