import { createGmailProvider } from "@postbox/email-client";
import { MailClient, type ClientDeps } from "@postbox/email-client";

import { DevAuthProvider } from "./auth";
import { getGmailOAuthConfig, GmailOAuthAuthProvider } from "./oauth";
import { NodeMailStorage } from "./sqlite-storage";

let cached: { client: MailClient; storage: NodeMailStorage } | null = null;

/**
 * The shared backend: SQLite storage, filesystem attachments, auth, and the
 * Gmail provider. The Next.js API routes and the web UI all use this one
 * instance.
 *
 * When GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET are set, accounts are connected
 * via the real Google OAuth flow (see /api/auth/gmail) and no demo data is
 * seeded. Without them, the app runs in dev mode with a seeded demo inbox.
 */
export function getBackend(): { client: MailClient; storage: NodeMailStorage } {
  if (cached) return cached;

  const storage = new NodeMailStorage();
  const oauth = getGmailOAuthConfig();
  const auth = oauth ? new GmailOAuthAuthProvider(storage, oauth) : new DevAuthProvider();

  const deps: ClientDeps = {
    storage,
    attachments: storage,
    auth,
    providers: {
      gmail: () => createGmailProvider(auth),
    },
  };

  const client = new MailClient(deps);

  // Only seed the demo inbox when there's no real OAuth login to use.
  if (!oauth) seedIfEmpty(client, storage);

  cached = { client, storage };
  return cached;
}

/**
 * First run: no accounts exist yet, so seed a demo account + messages so the
 * API and both UIs have something real to show before the user connects a
 * Gmail account. Idempotent via the `meta` table.
 */
function seedIfEmpty(client: MailClient, storage: NodeMailStorage): void {
  if (storage.getMeta("seeded") === "1") return;
  if (storage.listAccounts().length > 0) return;

  const account = storage.addAccount({
    provider: "gmail",
    email: "demo@example.com",
    displayName: "Demo Inbox",
    refreshToken: "demo-refresh-token",
  });

  const now = Date.now();
  const minutesAgo = (n: number) => new Date(now - n * 60_000).toISOString();
  const address = (name: string, email: string) => ({ name, address: email });

  const drafts = [
    {
      providerUid: 421,
      providerThreadId: "demo-thread-1",
      messageId: "<ada-421@example.com>",
      subject: "Re: Sync engine design notes",
      text: "The two-phase fetch approach keeps bodies off the wire until we know a message is new. Ship it.",
      html: "<p>The two-phase fetch approach keeps bodies off the wire until we know a message is new.</p><p><strong>Ship it.</strong></p><p>See the <a href=\"https://example.com/notes\">design notes</a>.</p>",
      from: [address("Ada Lovelace", "ada@example.com")],
      date: minutesAgo(12),
      seen: false,
      starred: true,
      labels: [],
    },
    {
      providerUid: 420,
      providerThreadId: "demo-thread-2",
      messageId: "<alan-420@example.com>",
      subject: "Decidable problems",
      text: "A quick note before lunch — I'd like to discuss the halting problem over tea.",
      from: [address("Alan Turing", "alan@example.com")],
      date: minutesAgo(48),
      seen: true,
      starred: false,
      labels: ["work"],
    },
    {
      providerUid: 419,
      providerThreadId: "demo-thread-3",
      messageId: "<grace-419@example.com>",
      subject: "Nanoseconds are a hard deadline",
      text: "People think measuring a nanosecond is easy. It isn't. Attached are the lecture notes.",
      html: "<h2>Nanoseconds are a hard deadline</h2><p>People think measuring a nanosecond is easy. It isn't.</p><blockquote>A nanosecond is the time it takes light to travel about 30cm.</blockquote>",
      from: [address("Grace Hopper", "grace@example.com")],
      date: minutesAgo(90),
      seen: false,
      starred: false,
      labels: ["work", "important"],
    },
    {
      providerUid: 418,
      providerThreadId: "demo-thread-2",
      messageId: "<alan-418@example.com>",
      subject: "Re: Decidable problems",
      text: "Two more things — the tape always seems to run out. Have you tried a longer one?",
      from: [address("Alan Turing", "alan@example.com")],
      date: minutesAgo(45),
      seen: true,
      starred: false,
      labels: [],
    },
    {
      providerUid: 417,
      providerThreadId: "demo-thread-1",
      messageId: "<ada-417@example.com>",
      subject: "Re: Sync engine design notes",
      text: "Also worth noting: batch the body downloads so IMAP doesn't choke on 10k messages at once.",
      from: [address("Ada Lovelace", "ada@example.com")],
      date: minutesAgo(60),
      seen: true,
      starred: false,
      labels: [],
    },
    {
      providerUid: 416,
      providerThreadId: "demo-thread-4",
      messageId: "<katherine-416@example.com>",
      subject: "Trajectory math for the weekend",
      text: "Run the numbers before Saturday and we'll compare notes. The spline fit is beautiful.",
      from: [address("Katherine Johnson", "katherine@example.com")],
      date: minutesAgo(300),
      seen: true,
      starred: true,
      labels: [],
    },
  ];

  for (const draft of drafts) {
    void client.deps.storage.upsertMessage({
      accountId: account.id,
      folder: "INBOX",
      providerUid: draft.providerUid,
      providerThreadId: draft.providerThreadId,
      messageId: draft.messageId,
      inReplyTo: null,
      references: [],
      from: draft.from,
      to: [address("Me", "demo@example.com")],
      cc: [],
      bcc: [],
      replyTo: [],
      subject: draft.subject,
      text: draft.text,
      html: "html" in draft ? (draft.html ?? null) : null,
      date: draft.date,
      size: draft.text.length,
      flags: { seen: draft.seen, starred: draft.starred, draft: false, sent: false },
      snippet: draft.text,
      labels: draft.labels,
    });
  }

  // A couple of tags + one rule, so the tags pipeline is visible end to end.
  const work = storage.createTag(account.id, { name: "work", color: "#6366f1" });
  const important = storage.createTag(account.id, { name: "important", color: "#e11d48" });

  const graceMessageId = findMessage(client, account.id, 419);
  if (graceMessageId) {
    storage.attachTag(graceMessageId, work.id, "manual");
    storage.attachTag(graceMessageId, important.id, "manual");
  }

  storage.createTagRule({
    accountId: account.id,
    name: "Important senders",
    condition: { field: "from", op: "contains", value: "grace@example.com" },
    tagId: work.id,
  });

  storage.setMeta("seeded", "1");
}

function findMessage(client: MailClient, accountId: number, providerUid: number): number {
  const stored = client.deps.storage.getMessageByProviderUid(accountId, "INBOX", providerUid);
  return stored?.id ?? 0;
}