import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MapCanvas } from "./map-canvas";

vi.mock("./map-scene", () => ({ default: () => null }));

const props = {
  background: { url: "https://example.test/map.jpg", alt: "Harbor map" },
  items: [{ id: "item-1", title: "Mara Venn", kind: "entity", status: "canon" }],
  placements: [{ id: "marker-1", item_id: "item-1", x: 0.4, y: 0.6, caption: "Pier office" }],
  mode: "2d" as const,
  selectedPlacementId: null,
  placementArmed: false,
  resetToken: 0,
  onSelectPlacement: vi.fn(),
  onPlace: vi.fn(),
  onMovePlacement: vi.fn(),
  onRendererError: vi.fn(),
};

afterEach(() => cleanup());

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

test("selects the visible DOM map when WebGL is unavailable", () => {
  render(<MapCanvas {...props} />);
  expect(screen.getByRole("img", { name: "Harbor map" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pier office" })).toBeInTheDocument();
  expect(props.onRendererError).toHaveBeenCalledWith(expect.objectContaining({ message: "WebGL is not available." }));
});
