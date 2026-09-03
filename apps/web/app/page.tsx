import { redirect } from "next/navigation";

/**
 * The legacy single-page inbox lived here. The frontend now follows the
 * redakt structure: canonical account-scoped routes under `/mail`
 * (`/mail/a/:accountId/:folder` and `.../thread/:threadId`).
 */
export default function HomePage() {
  redirect("/mail");
}
