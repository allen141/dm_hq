import { describe, expect, it } from "vitest";
import { frontmatter, withFrontmatter } from "./archive-markdown";
import {
  duplicateBlock,
  emptyPlayState,
  newBlock,
  playKey,
  prunePlayState,
} from "./session-blocks";
describe("portable standard blocks", () => {
  it("accepts YAML and preserves unknown metadata when editing", () => {
    const metadata = frontmatter(
      "---\ntitle: Example\ncustom: {kept: true}\n---\nProse",
    );
    expect(
      frontmatter(withFrontmatter("Prose", { ...metadata, status: "draft" }))
        .custom,
    ).toEqual({ kept: true });
  });
  it("reports malformed or duplicate-key frontmatter", () => {
    expect(() => frontmatter("---\ntitle: [\n---\nBody")).toThrow(
      "Invalid frontmatter",
    );
    expect(() => frontmatter("---\ntitle: a\ntitle: b\n---\n")).toThrow(
      "Invalid frontmatter",
    );
  });
  it("duplicates stable row IDs without rewriting canonical references", () => {
    const block = newBlock("story");
    if (block.type !== "story") throw Error();
    const id = crypto.randomUUID();
    block.data.beats = [{ id, next_beat_id: id, title: "Loop" }];
    const copy = duplicateBlock(block);
    expect(copy.id).not.toBe(block.id);
    if (copy.type !== "story") throw Error();
    expect(copy.data.beats![0].id).not.toBe(id);
    expect(copy.data.beats![0].next_beat_id).toBe(copy.data.beats![0].id);
  });
  it("isolates tracking by account campaign and page, and prunes removed rows", () => {
    expect(playKey(1, "a", "b")).not.toBe(playKey(2, "a", "b"));
    expect(playKey(1, "a", "b")).not.toBe(playKey(1, "a", "c"));
    const block = newBlock("character");
    const state = {
      ...emptyPlayState(),
      hp: { [block.id]: 4, removed: 20 },
      used: ["gone:row"],
    };
    expect(prunePlayState(state, [block])).toMatchObject({
      hp: { [block.id]: 4 },
      used: [],
    });
  });
});
