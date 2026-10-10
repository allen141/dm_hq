import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Editor from "./editor";
import type { BlockCollection } from "@dm-hq/api-client";
afterEach(cleanup);
it("adds blocks and preserves unknown collection metadata", () => {
  const change = vi.fn();
  render(
    <Editor
      collection={{ version: 1, entries: [], extension: "preserved" }}
      items={[]}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByText("Add block"));
  expect(change.mock.calls[0][0]).toMatchObject({
    version: 1,
    extension: "preserved",
    entries: [{ type: "scene" }],
  });
});
it("edits nested action rows, reorders and duplicates with fresh IDs", () => {
  const change = vi.fn();
  const blockId = crypto.randomUUID();
  const rowId = crypto.randomUUID();
  const collection: BlockCollection = {
    version: 1,
    entries: [
      {
        id: blockId,
        type: "character",
        title: "Example",
        data: {
          ruleset: "dnd_5e_2014",
          custom: "kept",
          attacks: [{ id: rowId, name: "Staff", damage: "1d6" }],
        },
      },
    ],
  };
  render(<Editor collection={collection} items={[]} onChange={change} />);
  fireEvent.change(screen.getAllByLabelText("Damage")[0], {
    target: { value: "1d8" },
  });
  expect(change.mock.calls[0][0].entries[0].data).toMatchObject({
    custom: "kept",
    attacks: [{ id: rowId, damage: "1d8" }],
  });
  fireEvent.click(screen.getByText("Duplicate block"));
  const next = change.mock.calls[1][0];
  expect(next.entries[1].id).not.toBe(blockId);
  expect(next.entries[1].data.attacks[0].id).not.toBe(rowId);
});
it("leaves unsupported source data intact", () => {
  const change = vi.fn();
  render(
    <Editor
      collection={{ version: 2, entries: [] } as unknown as BlockCollection}
      items={[]}
      onChange={change}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Source");
  expect(change).not.toHaveBeenCalled();
});
