import { getProvider, getAccountOrThrow, type ClientDeps } from "../deps";
import type {
  OutgoingAttachment,
  SendOptions,
  SendResult,
} from "../provider";
import type { Address, AddressInput, MessageFlags } from "../types";

export type { SendOptions };

export type ComposeOptions = {
  accountId: number;
  to: AddressInput[];
  cc?: AddressInput[];
  bcc?: AddressInput[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: OutgoingAttachment[];
};

function toAddresses(list?: AddressInput[]): Address[] {
  if (!list) return [];

  return list.map((entry) =>
    typeof entry === "string" ? { address: entry } : entry,
  );
}

function findThreadIdByReplyTo(
  deps: ClientDeps,
  accountId: number,
  inReplyTo?: string,
): number | null {
  if (!inReplyTo) return null;

  return deps.storage.findThreadIdByMessageHeader(accountId, inReplyTo);
}

async function draftsFolder(deps: ClientDeps, accountId: number): Promise<string> {
  const account = getAccountOrThrow(deps, accountId);
  const session = getProvider(deps, account.provider).open(account);

  await session.connect();

  try {
    const folders = await session.listFolders();
    const drafts = folders.find((folder) => folder.specialUse === "\\Drafts");
    return drafts?.path ?? "[Gmail]/Drafts";
  } finally {
    await session.logout();
  }
}

export async function send(deps: ClientDeps, opts: ComposeOptions): Promise<SendResult> {
  const account = getAccountOrThrow(deps, opts.accountId);
  const result = await getProvider(deps, account.provider).send(account, opts);

  const from: Address[] = [{ name: account.displayName ?? undefined, address: account.email }];
  const to = toAddresses(opts.to);
  const cc = toAddresses(opts.cc);
  const bcc = toAddresses(opts.bcc);
  const flags: Partial<MessageFlags> = { seen: true, sent: true, draft: false };

  deps.storage.insertOutgoingMessage({
    accountId: account.id,
    folder: "[Gmail]/Sent Mail",
    threadId: findThreadIdByReplyTo(deps, account.id, opts.inReplyTo),
    messageId: result.messageId,
    inReplyTo: opts.inReplyTo,
    references: opts.references ?? [],
    from,
    to,
    cc,
    bcc,
    replyTo: [],
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    date: new Date().toISOString(),
    flags,
  });

  return result;
}

export async function saveDraft(
  deps: ClientDeps,
  opts: ComposeOptions,
): Promise<{ ok: true; folder: string }> {
  const account = getAccountOrThrow(deps, opts.accountId);
  const provider = getProvider(deps, account.provider);
  const raw = await provider.buildRaw(account, opts);
  const folder = await draftsFolder(deps, account.id);

  const session = provider.open(account);

  await session.connect();

  try {
    await session.append(folder, raw, ["\\Draft"]);

    const from: Address[] = [{ name: account.displayName ?? undefined, address: account.email }];

    deps.storage.insertOutgoingMessage({
      accountId: account.id,
      folder,
      threadId: findThreadIdByReplyTo(deps, account.id, opts.inReplyTo),
      inReplyTo: opts.inReplyTo,
      references: opts.references ?? [],
      from,
      to: toAddresses(opts.to),
      cc: toAddresses(opts.cc),
      bcc: toAddresses(opts.bcc),
      replyTo: [],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      date: new Date().toISOString(),
      flags: { seen: false, starred: false, draft: true, sent: false },
    });

    return { ok: true, folder };
  } finally {
    await session.logout();
  }
}