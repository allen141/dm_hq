import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import RelationshipViewPage from "./page";

const navigation = vi.hoisted(() => ({
  pathname: "/campaigns/campaign-1/archive/relationships/ties-1",
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ campaignId: "campaign-1", viewId: "ties-1" }),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));
vi.mock("@/components/relationships/relationship-graph-canvas", () => ({
  default: ({ nodes, edges, layoutMode, rootId }: { nodes: Array<{ title: string }>; edges: unknown[]; layoutMode?: string; rootId?: string | null }) => <div aria-label="Test relationship canvas" data-layout={layoutMode} data-root={rootId ?? ""}>{nodes.map((node) => node.title).join(", ")} · {edges.length} facts</div>,
}));

const view = {
  id: "ties-1", campaign_id: "campaign-1", view_type: "relationship", title: "Harbor order", slug: "harbor-order",
  status: "active", version: 4, updated_at: "2026-08-15T00:00:00Z", markdown: "", html: "",
  description: "Who answers to whom.", placements: [],
  members: [
    { id: "member-1", item_id: "mara", position: null, item: { id: "mara", title: "Captain Mara Venn", kind: "entity", status: "canon" } },
    { id: "member-2", item_id: "wardens", position: null, item: { id: "wardens", title: "Harbor Wardens", kind: "entity", status: "canon" } },
  ],
  edges: [{ id: "edge-1", edge_class: "relationship", source_id: "mara", target_id: "wardens", kind: "commands", label: "commands", inverse_label: "commanded by" }],
  available_relationship_kinds: ["commands", "allied_with"],
  settings: { layout_mode: "hierarchy", orientation: "top_to_bottom", root_item_id: "mara", relationship_kinds: [], layout_relationship_kinds: ["commands"], layout_direction: "outgoing" },
} as const;
const boards = {
  views: [
    { id: "ties-1", campaign_id: "campaign-1", view_type: "relationship", title: "Harbor order", slug: "harbor-order", status: "active", version: 4, updated_at: "2026-08-15T00:00:00Z" },
    { id: "family-1", campaign_id: "campaign-1", view_type: "relationship", title: "Venn family", slug: "venn-family", status: "active", version: 1, updated_at: "2026-08-15T00:00:00Z" },
  ],
};
const extraItem = { id: "oren", campaign_id: "campaign-1", kind: "entity", title: "Archivist Oren Pell", status: "canon", version: 1, created_at: "2026-08-15T00:00:00Z", updated_at: "2026-08-15T00:00:00Z" };

beforeEach(() => {
  navigation.pathname = "/campaigns/campaign-1/archive/relationships/ties-1";
  navigation.push.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/archive/views?include_archived=true")) return { ok: true, json: async () => boards };
    if (url.endsWith("/archive/views/ties-1") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ ...view, ...body, version: view.version + 1, members: body.members.map((member: Record<string, unknown>) => ({ ...member, item: member.item_id === "mara" ? view.members[0].item : member.item_id === "wardens" ? view.members[1].item : { id: "oren", title: "Archivist Oren Pell", kind: "entity", status: "canon" } })) }) };
    }
    if (url.endsWith("/archive/views/ties-1")) return { ok: true, json: async () => view };
    if (url.includes("/campaigns/campaign-1/items")) return { ok: true, json: async () => ({ items: [...view.members.map((member) => ({ ...extraItem, id: member.item_id, title: member.item.title })), extraItem], next_cursor: null }) };
    return { ok: false, status: 404, json: async () => ({ detail: "Not found" }) };
  }));
});
afterEach(() => cleanup());

test("renders a read-only immersive board from embedded member identities", async () => {
  render(<RelationshipViewPage />);

  expect(await screen.findByRole("heading", { name: "Harbor order" })).toHaveClass("sr-only");
  expect(screen.getByLabelText("Test relationship canvas")).toHaveTextContent("Captain Mara Venn, Harbor Wardens · 1 facts");
  expect(screen.getByLabelText("Test relationship canvas")).toHaveAttribute("data-layout", "hierarchy");
  expect(screen.getByLabelText("Test relationship canvas")).toHaveAttribute("data-root", "mara");
  expect(screen.queryByRole("button", { name: "Add member" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/items"), expect.anything());

  fireEvent.change(screen.getByLabelText("Relationship board"), { target: { value: "family-1" } });
  expect(navigation.push).toHaveBeenCalledWith("/campaigns/campaign-1/archive/relationships/family-1");
});

test("keeps membership and hierarchy authoring on the editor route", async () => {
  navigation.pathname = "/campaigns/campaign-1/archive/relationships/ties-1/edit";
  render(<RelationshipViewPage />);

  expect(await screen.findByRole("heading", { name: "Harbor order" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Test relationship canvas")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Layout mode")).toHaveValue("hierarchy");
  expect(screen.getByLabelText("Root member")).toHaveValue("mara");
  const hierarchyKinds = screen.getByRole("group", { name: /Hierarchy relationships/ });
  expect(within(hierarchyKinds).getByRole("checkbox", { name: "commands" })).toBeChecked();

  fireEvent.change(screen.getByLabelText("Add Archive page"), { target: { value: "oren" } });
  fireEvent.click(screen.getByRole("button", { name: "Add member" }));
  expect(await screen.findByText("Member added.")).toBeInTheDocument();
  expect(screen.getByText("Archivist Oren Pell")).toBeInTheDocument();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/archive/views/ties-1"), expect.objectContaining({ method: "PATCH" })));
});
