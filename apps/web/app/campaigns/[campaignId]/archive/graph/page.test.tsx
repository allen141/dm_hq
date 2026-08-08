import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import ArchiveGraphPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ campaignId: "campaign-1" }), useSearchParams: () => new URLSearchParams() }));

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ focus_id: "campaign-1", depth: 1, nodes: [{ id: "campaign-1", node_type: "campaign", title: "Lantern Harbor", kind: "campaign", status: "canon" }, { id: "b", node_type: "item", title: "Harbor", kind: "entity", status: "canon" }], edges: [{ id: "edge-1", edge_class: "document_link", source_id: "campaign-1", target_id: "b", kind: "document_link", label: "links to", inverse_label: "" }], limits: { max_nodes: 100, max_edges: 250 }, truncated: { nodes: false, edges: false } }) })));

test("links the graph to its accessible relationship table", async () => {
  render(<ArchiveGraphPage />);
  expect(screen.getByRole("heading", { name: "Knowledge graph" })).toBeInTheDocument();
  const tableLink = await screen.findByRole("link", { name: /Accessible graph table/ });
  expect(tableLink).toHaveAttribute("href", "/campaigns/campaign-1/archive/graph/table");
  expect(screen.getByRole("img", { name: /2 pages and 1 connections/ })).toBeInTheDocument();
});
