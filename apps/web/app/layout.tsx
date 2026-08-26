import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mail",
  description: "A fast, private email client.",
  icons: {
    icon: "/icon.svg",
  },
};

const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("mail-theme");var d=s?JSON.parse(s):null;var dark=d==="dark"||((!d||d==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(dark)document.documentElement.classList.add("dark")}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}