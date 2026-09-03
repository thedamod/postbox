import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";

import {
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
  resolveServerTheme,
} from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mail",
  description: "A fast, private email client.",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Server-painted theme from cookie mirrors: deterministic pre-paint with
  // zero flash. Scripts rendered by React never execute before paint, so a
  // client boot script cannot do this job — the class must arrive in the
  // byte stream. The client hook owns it from hydration onward.
  const cookieHeader = (await cookies()).toString();
  const dark = resolveServerTheme(cookieHeader) === "dark";

  return (
    <html lang="en" className={dark ? "dark" : undefined} style={{ colorScheme: dark ? "dark" : "light" }} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT} />
      </head>
      <body>{children}</body>
    </html>
  );
}
