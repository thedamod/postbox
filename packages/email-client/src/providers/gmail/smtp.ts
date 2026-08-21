import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

import type { AuthProvider } from "../../auth";
import type { EmailAccount } from "../../types";
import type {
  OutgoingAttachment,
  SendOptions,
  SendResult,
} from "../../provider";

export type { OutgoingAttachment, SendOptions, SendResult };

function fromFor(account: EmailAccount): string | Mail.Address {
  return account.displayName
    ? { name: account.displayName, address: account.email }
    : account.email;
}

function buildMailOptions(account: EmailAccount, opts: SendOptions): Mail.Options {
  return {
    from: fromFor(account),
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    attachments: opts.attachments?.map((attachment) => {
      if (
        "content" in attachment &&
        attachment.content instanceof Uint8Array &&
        !Buffer.isBuffer(attachment.content)
      ) {
        return { ...attachment, content: Buffer.from(attachment.content) };
      }
      return attachment;
    }) as Mail.Attachment[],
  };
}

export async function sendMail(
  account: EmailAccount,
  opts: SendOptions,
  auth: AuthProvider,
): Promise<SendResult> {
  const accessToken = await auth.getAccessToken(account);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      type: "OAuth2",
      user: account.email,
      accessToken,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  try {
    const result = await transporter.sendMail(buildMailOptions(account, opts));

    const toAddress = (value: string | Mail.Address): string =>
      typeof value === "string" ? value : value.address;

    return {
      messageId: result.messageId,
      accepted: (result.accepted ?? []).map(toAddress),
      rejected: (result.rejected ?? []).map(toAddress),
    };
  } finally {
    transporter.close();
  }
}

/**
 * Build the raw RFC822 message without sending it. Used to save drafts
 * via IMAP APPEND.
 */
export async function buildRaw(
  account: EmailAccount,
  opts: SendOptions,
): Promise<Buffer> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });

  const result = await transport.sendMail(buildMailOptions(account, opts));

  transport.close();

  if (!result.message) {
    throw new Error("Could not build message.");
  }

  return result.message as Buffer;
}