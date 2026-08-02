import type { Metadata } from "next";
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
    <html lang="en">
      <body>{children}<BuildMarker /></body>
    </html>
  );
}
