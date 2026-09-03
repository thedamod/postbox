import type { ReactNode } from "react";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

/** Mail section shell: suspense boundary for URL-synced search controls. */
export default function MailLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
