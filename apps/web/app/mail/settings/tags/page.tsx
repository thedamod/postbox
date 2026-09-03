import { getBackend } from "@/lib/api";
import { loadMailAccounts } from "@/lib/mail/server";

export const dynamic = "force-dynamic";

/** Tag/label collections surfaced from the tagging engine. */
export default async function TagsSettingsPage() {
  const accounts = await loadMailAccounts().catch(() => []);
  const first = accounts[0];
  const tags = first ? getBackend().storage.listTags(Number(first.id)) : [];
  const rules = first ? getBackend().storage.listTagRules(Number(first.id)) : [];

  return (
    <section className="flex flex-col gap-4" aria-label="Tags">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Labels</h2>
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color ?? "#6366f1" }} />
                <span className="flex-1">{tag.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Tagging rules</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rules.map((rule) => (
              <li key={rule.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="font-medium">{rule.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {"field" in rule.condition
                    ? `${rule.condition.field} ${rule.condition.op} “${rule.condition.value}”`
                    : "Custom condition"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
