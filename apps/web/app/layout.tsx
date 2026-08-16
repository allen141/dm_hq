import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_THEME_ID, THEME_CSS, THEME_PREPAINT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "DM HQ — Archive",
  description: "A focused campaign knowledge workspace for Dungeon Masters.",
};

function BuildMarker() {
  const version = process.env.BUILD_VERSION ?? "dev";
  const shortVersion = version === "dev" ? version : version.slice(0, 12);
  return <footer className="build-marker" aria-label="Build version" title={`Full build hash: ${version}`}>build {shortVersion}</footer>;
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID} suppressHydrationWarning>
      <head>
        <script id="dmhq-theme-prepaint" dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }} />
        <style id="dmhq-theme-variables" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      </head>
      <body><ThemeProvider>{children}<BuildMarker /></ThemeProvider></body>
    </html>
  );
}
