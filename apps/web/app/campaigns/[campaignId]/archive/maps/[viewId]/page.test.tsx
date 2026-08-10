import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MapCanvasProps } from "@/lib/map-types";

import MapViewPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ campaignId: "campaign-1", viewId: "map-1" }) }));
vi.mock("@/components/map/map-canvas", () => ({
  default: (props: MapCanvasProps) => <div aria-label="Test map canvas">
    <button type="button" onClick={() => props.onPlace?.({ x: 0.25, y: 0.75 })}>Choose map point</button>
    {props.placements.map((placement) => <button type="button" key={placement.id} onClick={() => props.onSelectPlacement?.(placement.id)}>Canvas marker {placement.id}</button>)}
  </div>,
}));

const item = {
  id: "item-1", campaign_id: "campaign-1", kind: "entity", title: "Brass Lantern", status: "canon", version: 3,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const initialView = {
  id: "map-1", campaign_id: "campaign-1", view_type: "map", title: "The Harbor", slug: "the-harbor", status: "active", version: 1,
  updated_at: "2026-01-01T00:00:00Z", markdown: "", html: "", description: "Danger waits beyond the piers.",
  background: { url: "https://example.test/harbor.jpg", alt: "Harbor map" },
  placements: [{ id: "marker-1", item_id: "item-1", x: 0.4, y: 0.6, caption: "Watch tower" }], members: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/archive/views/map-1") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ ...initialView, version: body.version + 1, background: body.background, placements: body.placements }) };
    }
    if (path.endsWith("/archive/views/map-1")) return { ok: true, json: async () => initialView };
    if (path.endsWith("/campaigns/campaign-1/items")) return { ok: true, json: async () => ({ items: [item], next_cursor: null }) };
    if (path.endsWith("/items/item-1")) return { ok: true, json: async () => ({ ...item, markdown: "---\ntitle: Brass Lantern\n---\n\n# Signal light\n\nWarns ships away from the reef.", html: "", metadata: {}, aliases: [], tags: [], references: [], backlinks: [], relationships: [], incoming_relationships: [] }) };
    return { ok: false, status: 404, json: async () => ({ detail: "Not found" }) };
  }));
});

afterEach(() => cleanup());

test("requires explicit armed placement mode and opens a DOM marker summary", async () => {
  render(<MapViewPage />);
  expect(await screen.findByRole("heading", { name: "The Harbor" })).toBeInTheDocument();

  fireEvent.click(await screen.findByRole("button", { name: "Choose map point" }));
  expect(fetch).toHaveBeenCalledTimes(2);

  fireEvent.change(screen.getByLabelText("Page to place"), { target: { value: "item-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Add marker" }));
  expect(screen.getByText(/Placement armed/)).toBeInTheDocument();
  const mapPoint = screen.getByRole("button", { name: "Choose map point" }); mapPoint.focus(); fireEvent.click(mapPoint);
  expect(await screen.findByText("Marker added.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add marker" })).toHaveAttribute("aria-pressed", "false");

  expect(await screen.findByRole("dialog", { name: "Brass Lantern" })).toBeInTheDocument();
  expect(await screen.findByText("Signal light Warns ships away from the reef.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Open full Archive page/ })).toHaveAttribute("href", "/campaigns/campaign-1/archive/items/item-1");
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Brass Lantern" }), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Brass Lantern" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose map point" })).toHaveFocus();
});

test("keeps a searchable marker editor available and supports keyboard nudging", async () => {
  render(<MapViewPage />);
  await screen.findByRole("heading", { name: "The Harbor" });
  expect(screen.getByLabelText("Search markers")).toBeInTheDocument();

  const x = screen.getByLabelText("X coordinate for Brass Lantern") as HTMLInputElement;
  fireEvent.keyDown(x, { key: "ArrowRight", shiftKey: true });
  await waitFor(() => expect(x.value).toBe("0.41000000000000003"));

  fireEvent.change(screen.getByLabelText("Search markers"), { target: { value: "missing" } });
  expect(screen.getByText("No matching markers.")).toBeInTheDocument();
});
