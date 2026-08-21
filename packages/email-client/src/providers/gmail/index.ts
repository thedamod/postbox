import type { AuthProvider } from "../../auth";
import type { EmailAccount } from "../../types";
import type {
  MailProvider,
  ProviderSession,
  SendOptions,
  SendResult,
} from "../../provider";
import { GmailImapSession } from "./imap";
import { sendMail, buildRaw } from "./smtp";

export class GmailProvider implements MailProvider {
  readonly name = "gmail";

  constructor(private auth: AuthProvider) {}

  open(account: EmailAccount): ProviderSession {
    return new GmailImapSession(account, this.auth);
  }

  send(account: EmailAccount, opts: SendOptions): Promise<SendResult> {
    return sendMail(account, opts, this.auth);
  }

  buildRaw(account: EmailAccount, opts: SendOptions): Promise<Buffer> {
    return buildRaw(account, opts);
  }
}

/** Build the provider registry with a Gmail provider wired to `auth`. */
export function createGmailProvider(auth: AuthProvider): GmailProvider {
  return new GmailProvider(auth);
}