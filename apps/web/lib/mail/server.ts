import { cache } from "react";
import { getMailProvider, listMailAccounts } from "./get-provider";
import type {
  FolderCounts,
  MailCollection,
  MailAccount,
  MailViewId,
  ThreadDetail,
  ThreadListPage,
  ThreadListQuery,
} from "./types";

/**
 * Authenticated route data loaders (mirrors redakt `lib/mail/server.ts`).
 * This client is single-user local-first, so there is no session lookup:
 * every loader resolves the account and reads through the provider contract.
 * Results are `cache()`d per request like the reference implementation.
 */

export const loadMailAccounts = cache(async (): Promise<MailAccount[]> => {
  return listMailAccounts();
});

export const loadFolderPage = cache(
  async (
    accountId: string | null,
    folder: MailViewId,
    query: ThreadListQuery,
  ): Promise<{ account: MailAccount; page: ThreadListPage }> => {
    const provider = getMailProvider(accountId);
    const page = await provider.listThreads(folder, query);
    return { account: provider.account, page };
  },
);

export const loadThreadDetail = cache(
  async (
    accountId: string | null,
    threadId: string,
  ): Promise<{ account: MailAccount; thread: ThreadDetail | null }> => {
    const provider = getMailProvider(accountId);
    const thread = await provider.getThread(threadId);
    return { account: provider.account, thread };
  },
);

export const loadFolderCounts = cache(
  async (accountId: string | null): Promise<FolderCounts> => {
    const provider = getMailProvider(accountId);
    return provider.getFolderCounts();
  },
);

export const loadMailCollections = cache(
  async (accountId: string | null): Promise<MailCollection[]> => {
    const provider = getMailProvider(accountId);
    return provider.listCollections();
  },
);
