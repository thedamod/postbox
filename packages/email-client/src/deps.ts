import type { AttachmentStore, EmailStorage } from "./storage";
import type { AuthProvider } from "./auth";
import type { MailProvider } from "./provider";

/**
 * Everything the mail services need. Hosts build one of these (wiring their
 * own storage, attachment store, auth, and provider registry) and hand it to
 * a `MailClient` / `SyncEngine`.
 */
export type ClientDeps = {
  storage: EmailStorage;
  attachments: AttachmentStore;
  auth: AuthProvider;
  providers: ProviderRegistry;
};

/** Lazy provider registry: name -> factory. `getProvider` creates on demand. */
export type ProviderRegistry = Record<string, () => MailProvider>;

export function getProvider(deps: ClientDeps, name: string): MailProvider {
  const create = deps.providers[name];

  if (!create) {
    throw new Error(`Unknown mail provider "${name}".`);
  }

  return create();
}

export function getAccountOrThrow(deps: ClientDeps, id: number) {
  const account = deps.storage.getAccount(id);

  if (!account) {
    throw new Error(`Account "${id}" does not exist.`);
  }

  return account;
}