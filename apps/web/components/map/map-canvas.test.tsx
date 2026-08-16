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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

test("selects the visible DOM map when WebGL is unavailable", () => {
  render(<MapCanvas {...props} />);
  expect(screen.getByRole("img", { name: "Harbor map" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pier office" })).toBeInTheDocument();
  expect(props.onRendererError).toHaveBeenCalledWith(expect.objectContaining({ message: "WebGL is not available." }));
});

test("prefers the visible DOM map in forced-colors mode without reporting a renderer error", () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  render(<MapCanvas {...props} />);
  expect(screen.getByRole("button", { name: "Pier office" })).toBeInTheDocument();
  expect(props.onRendererError).not.toHaveBeenCalled();
});
