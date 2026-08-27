import {
  MailClient,
  type ComposeOptions,
  type SendResult,
} from "@postbox/email-client";

/**
 * Demo accounts (anything at @example.com) are seeded locally and have no real
 * Gmail credentials, so provider sends would fail. Route those through local
 * persistence so the whole compose → sent / save-draft flow works in dev.
 * Real accounts keep the full provider path (IMAP/SMTP).
 */

export function isDemoAccount(email?: string | null): boolean {
  return !!email && email.endsWith("@example.com");
}

function addresses(
  list?: Array<string | { name?: string; address: string }>,
): Array<{ name?: string; address: string }> {
  return (list ?? []).map((entry) =>
    typeof entry === "string" ? { address: entry } : entry,
  );
}

export async function sendMessage(
  client: MailClient,
  opts: ComposeOptions,
): Promise<SendResult> {
  const account = client.deps.storage.getAccount(opts.accountId);
  if (!account) throw new Error(`Account ${opts.accountId} not found.`);

  if (!isDemoAccount(account.email)) {
    return client.send(opts);
  }

  const messageId = `<local-${Date.now()}@example.com>`;

  const id = client.deps.storage.insertOutgoingMessage({
    accountId: account.id,
    folder: "[Gmail]/Sent Mail",
    threadId: null,
    messageId,
    inReplyTo: opts.inReplyTo ?? null,
    references: opts.references ?? [],
    from: [{ name: account.displayName ?? undefined, address: account.email }],
    to: addresses(opts.to),
    cc: addresses(opts.cc),
    bcc: addresses(opts.bcc),
    replyTo: [],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    date: new Date().toISOString(),
    flags: { seen: true, sent: true, draft: false },
  });

  // Demo accounts have no SMTP backend, so persist attachments locally so the
  // sent message still shows them in the reader.
  const attachments = opts.attachments ?? [];
  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];
    if (!attachment) continue;
    await client.deps.attachments.save(
      id,
      {
        filename: attachment.filename,
        contentType: "contentType" in attachment ? attachment.contentType : undefined,
        content:
          "content" in attachment && attachment.content
            ? typeof attachment.content === "string"
              ? new TextEncoder().encode(attachment.content)
              : attachment.content
            : undefined,
      },
      index,
    );
  }

  return { messageId, accepted: [], rejected: [] };
}

export async function saveDraftMessage(
  client: MailClient,
  opts: ComposeOptions,
): Promise<{ ok: true; folder: string }> {
  const account = client.deps.storage.getAccount(opts.accountId);
  if (!account) throw new Error(`Account ${opts.accountId} not found.`);

  if (!isDemoAccount(account.email)) {
    return client.saveDraft(opts);
  }

  client.deps.storage.insertOutgoingMessage({
    accountId: account.id,
    folder: "[Gmail]/Drafts",
    threadId: null,
    messageId: `<draft-${Date.now()}@example.com>`,
    inReplyTo: opts.inReplyTo ?? null,
    references: opts.references ?? [],
    from: [{ name: account.displayName ?? undefined, address: account.email }],
    to: addresses(opts.to),
    cc: addresses(opts.cc),
    bcc: addresses(opts.bcc),
    replyTo: [],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    date: new Date().toISOString(),
    flags: { seen: false, starred: false, draft: true, sent: false },
  });

  return { ok: true, folder: "[Gmail]/Drafts" };
}