import Link from "next/link";
import type { ReactNode } from "react";
import { mailSettingsHref, type MailSettingsSectionId } from "@/lib/mail/routes";
import { cn } from "@postbox/ui";

export const dynamic = "force-dynamic";

const SECTIONS: { id: MailSettingsSectionId; label: string }[] = [
  { id: "account", label: "Accounts" },
  { id: "appearance", label: "Appearance" },
  { id: "tags", label: "Tags" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6" aria-label="Settings">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link href="/mail" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to mail
        </Link>
      </div>
      <nav aria-label="Settings sections" className="flex gap-1 border-b border-border pb-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.id}
            href={mailSettingsHref(section.id)}
            className={cn("rounded-md px-2 py-1 text-sm hover:bg-accent")}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
