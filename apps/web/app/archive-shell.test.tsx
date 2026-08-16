import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import ArchiveShell from "@/components/archive-shell";
import { ThemeProvider } from "@/components/theme-provider";

const navigation = vi.hoisted(() => ({ pathname: "/campaigns/campaign-1/archive/maps/map-1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

beforeEach(() => {
  navigation.pathname = "/campaigns/campaign-1/archive/maps/map-1";
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.endsWith("/archive/views")
      ? { views: [
          { id: "map-1", campaign_id: "campaign-1", view_type: "map", title: "Sword Coast", slug: "sword-coast", status: "active", version: 1, updated_at: "2026-08-07T00:00:00Z" },
          { id: "ties-1", campaign_id: "campaign-1", view_type: "relationship", title: "Court ties", slug: "court-ties", status: "active", version: 1, updated_at: "2026-08-07T00:00:00Z" },
        ] }
      : { id: "campaign-1", name: "Lantern Harbor", owner_id: 1, created_at: "2026-08-07T00:00:00Z", updated_at: "2026-08-07T00:00:00Z" };
    return { ok: true, json: async () => payload };
  }));
});

test("presents campaign context, utilities, and route-selected Archive tabs", async () => {
  render(<ThemeProvider><ArchiveShell campaignId="campaign-1"><p>Map workspace</p></ArchiveShell></ThemeProvider>);

  expect(await screen.findByRole("heading", { name: "Lantern Harbor" })).toBeInTheDocument();
  expect(screen.getByText("DM private")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/campaigns/campaign-1/archive?focus=search");
  expect(screen.getByRole("main")).toHaveClass("visualization-shell", "map-shell");
  expect(screen.getByRole("link", { name: "Quick capture" })).toHaveAttribute("href", "/campaigns/campaign-1/archive?focus=capture");
  expect(screen.getByRole("link", { name: "New view" })).toHaveAttribute("href", "/campaigns/campaign-1/archive/views/new");
  expect(screen.getByRole("link", { name: "Edit map" })).toHaveAttribute("href", "/campaigns/campaign-1/archive/maps/map-1/edit");
  expect(screen.getByRole("link", { name: "Maps" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Relationships" })).toHaveAttribute("href", "/campaigns/campaign-1/archive/relationships/ties-1");
  expect(screen.getByText("Map workspace")).toBeInTheDocument();
});

test("uses immersive relationship chrome and separates its viewer and editor actions", async () => {
  navigation.pathname = "/campaigns/campaign-1/archive/relationships/ties-1";
  const { rerender } = render(<ThemeProvider><ArchiveShell campaignId="campaign-1"><p>Relationship workspace</p></ArchiveShell></ThemeProvider>);

  expect(await screen.findByRole("heading", { name: "Lantern Harbor" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("visualization-shell", "relationship-shell");
  expect(screen.getByRole("link", { name: "Edit relationships" })).toHaveAttribute("href", "/campaigns/campaign-1/archive/relationships/ties-1/edit");

  navigation.pathname = "/campaigns/campaign-1/archive/relationships/ties-1/edit";
  rerender(<ThemeProvider><ArchiveShell campaignId="campaign-1"><p>Relationship editor</p></ArchiveShell></ThemeProvider>);
  expect(screen.getByRole("main")).not.toHaveClass("visualization-shell", "relationship-shell");
  expect(screen.getByRole("link", { name: "View relationships" })).toHaveAttribute("href", "/campaigns/campaign-1/archive/relationships/ties-1");
});
