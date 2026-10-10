import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionBlock } from "@dm-hq/api-client";
import Reader from "./reader";
import { emptyPlayState, playKey } from "@/lib/session-blocks";
const id = () => crypto.randomUUID();
const character: SessionBlock = {
  id: id(),
  type: "character",
  title: "Example guard",
  data: {
    ruleset: "dnd_5e_2014",
    ac: 12,
    max_hp: 10,
    attacks: [{ id: id(), name: "Staff", damage: "1d6" }],
    actions: [{ id: id(), name: "Dash" }],
    bonus_actions: [{ id: id(), name: "Signal" }],
    reactions: [{ id: id(), name: "Parry" }],
    special_actions: [{ id: id(), name: "Rally" }],
    traits: [{ id: id(), name: "Alert" }],
  },
};
const lineId = id();
const evidenceId = id();
const encounter: SessionBlock = {
  id: id(),
  type: "conversation",
  title: "Example conversation",
  data: {
    topics: [
      {
        id: id(),
        label: "Harbor",
        entries: [{ id: lineId, text: "Meet at dusk" }],
      },
    ],
    evidence: [
      {
        id: evidenceId,
        title: "Ledger",
        content: "A missing name",
        required: true,
      },
    ],
  },
};
const blocks = [character, encounter];
afterEach(cleanup);
beforeEach(() => localStorage.clear());
describe("session blocks reader", () => {
  it("shows explicit action groups and hides absent groups", () => {
    render(
      <Reader blocks={blocks} userId={1} campaignId="campaign" itemId="page" />,
    );
    for (const heading of [
      "Attacks",
      "Actions",
      "Bonus Actions",
      "Reactions",
      "Special Actions",
      "Passive Traits",
    ])
      expect(
        screen.getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Current HP for Example guard"),
    ).not.toBeInTheDocument();
  });
  it("draw does not mark used or reveal evidence, with undo and account isolation", () => {
    const view = render(
      <Reader blocks={blocks} userId={1} campaignId="campaign" itemId="page" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByText("Draw unused line"));
    let stored = JSON.parse(
      localStorage.getItem(playKey(1, "campaign", "page"))!,
    );
    expect(stored.used).toEqual([]);
    expect(stored.revealed).toEqual([]);
    fireEvent.click(screen.getByText("Mark used"));
    expect(screen.getByText("0 unused")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Undo"));
    expect(screen.getByText("1 unused")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mark revealed"));
    stored = JSON.parse(localStorage.getItem(playKey(1, "campaign", "page"))!);
    expect(stored.revealed).toEqual([`${encounter.id}:${evidenceId}`]);
    expect(localStorage.getItem(playKey(2, "campaign", "page"))).toBeNull();
    view.unmount();
    render(
      <Reader blocks={blocks} userId={1} campaignId="campaign" itemId="page" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("Mark unrevealed")).toBeInTheDocument();
  });
  it("persists the outline preference independently from authored content", () => {
    localStorage.setItem(
      playKey(1, "campaign", "page"),
      JSON.stringify(emptyPlayState()),
    );
    const view = render(
      <Reader blocks={blocks} userId={1} campaignId="campaign" itemId="page" />,
    );
    fireEvent.click(screen.getByText("Compact outline"));
    expect(screen.getByText("Compact outline")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    view.unmount();
    render(
      <Reader blocks={blocks} userId={1} campaignId="campaign" itemId="page" />,
    );
    expect(screen.getByText("Compact outline")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(blocks[0].data).not.toHaveProperty("current_hp");
  });
});
