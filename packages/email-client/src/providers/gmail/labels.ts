/**
 * Gmail label helpers.
 *
 * Gmail exposes "labels" over IMAP via the X-GM-EXT-1 extension. System
 * labels arrive as `\Inbox`, `\Sent`, `\Draft`, `\Starred`, ... while custom
 * labels are plain names like "Work". This module keeps Gmail specifics
 * contained inside `providers/gmail`.
 */

const GMAIL_SYSTEM_LABEL_PREFIXES = ["\\", "[Gmail]/"];

export type LabelGroups = {
  /** Everything (custom + system) Gmail reported for a message. */
  all: string[];
  /** Custom user labels only, e.g. "Work". */
  custom: string[];
  /** System labels only, e.g. "\\Inbox". */
  system: string[];
};

export function classifyLabels(labels: string[]): LabelGroups {
  const system: string[] = [];
  const custom: string[] = [];

  for (const label of labels) {
    const trimmed = label.trim();

    if (
      trimmed === "INBOX" ||
      trimmed.startsWith("\\") ||
      trimmed.startsWith("[Gmail]")
    ) {
      system.push(trimmed);
    } else if (trimmed !== "") {
      custom.push(trimmed);
    }
  }

  return { all: [...labels], custom, system };
}

export function isSystemLabel(label: string): boolean {
  const trimmed = label.trim();
  return (
    trimmed === "INBOX" ||
    GMAIL_SYSTEM_LABEL_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
  );
}