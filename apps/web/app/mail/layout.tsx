import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

/** Mail section shell. URL-synced controls suspend locally (see FolderView). */
export default function MailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
