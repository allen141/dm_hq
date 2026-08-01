import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DM HQ — Archive",
  description: "A focused campaign knowledge workspace for Dungeon Masters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
