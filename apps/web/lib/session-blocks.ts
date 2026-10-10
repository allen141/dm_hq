import type { BlockKind, SessionBlock } from "@dm-hq/api-client";

export type Field = {
  label: string;
  type?:
    | "number"
    | "boolean"
    | "choice"
    | "item"
    | "items"
    | "scene"
    | "encounter"
    | "beat";
  options?: string[];
  fields?: Record<string, Field>;
  rows?: Record<string, Field>;
};
const text = (label: string): Field => ({ label });
const number = (label: string): Field => ({ label, type: "number" });
const action: Record<string, Field> = {
  name: text("Name"),
  attack_bonus: number("Attack bonus"),
  save_dc: number("Save DC"),
  range: text("Range / reach"),
  damage: text("Damage"),
  effect: text("Effect"),
  trigger: text("Trigger"),
  usage: text("Usage / recharge"),
  activation: text("Activation"),
};
export const blockFields: Record<BlockKind, Record<string, Field>> = {
  story: {
    summary: text("Synopsis"),
    truth: text("DM truth"),
    beats: {
      label: "Story beats",
      rows: {
        title: text("Beat title"),
        goal: text("Goal"),
        stakes: text("Stakes"),
        progression: text("Progression / branches"),
        outcomes: text("Outcomes"),
        next_beat_id: { label: "Next beat", type: "beat" },
        scene_ids: { label: "Scenes", type: "scene" },
        encounter_ids: { label: "Encounters", type: "encounter" },
      },
    },
  },
  scene: {
    location_id: { label: "Archive location", type: "item" },
    mood: text("Mood / atmosphere"),
    sights: text("Sights"),
    sounds: text("Sounds"),
    scent: text("Scent / sensation"),
    lighting: text("Light / weather"),
    features: text("Space / notable features"),
    read_aloud: text("Read aloud"),
  },
  character: {
    ruleset: { label: "Ruleset", type: "choice", options: ["", "dnd_5e_2014"] },
    species: text("Species"),
    creature_type: text("Creature type"),
    size: text("Size"),
    role: text("Role"),
    appearance: text("Appearance"),
    voice: text("Voice / mannerisms"),
    motivation: text("Motivation"),
    fear: text("Fear"),
    knowledge: text("Knowledge"),
    ac: number("AC"),
    max_hp: number("Maximum HP"),
    initiative: number("Initiative"),
    level: number("Level"),
    speed: text("Speed"),
    cr: text("CR"),
    abilities: {
      label: "Abilities (2014 D&D 5e)",
      fields: Object.fromEntries(
        ["str", "dex", "con", "int", "wis", "cha"].map((key) => [
          key,
          number(key.toUpperCase()),
        ]),
      ),
    },
    saving_throws: text("Saving throws"),
    skills: text("Skills"),
    resistances: text("Resistances"),
    immunities: text("Immunities"),
    senses: text("Senses"),
    languages: text("Languages"),
    tactics: text("Tactics"),
    ...Object.fromEntries(
      [
        "attacks",
        "actions",
        "bonus_actions",
        "reactions",
        "special_actions",
        "traits",
      ].map((key) => [
        key,
        {
          label: key === "traits" ? "Passive traits" : key.replaceAll("_", " "),
          rows: action,
        },
      ]),
    ),
  },
  conversation: {
    participant_ids: { label: "Participants", type: "items" },
    setup: text("Setup"),
    wants: text("What they want"),
    demeanor: text("Demeanor"),
    topics: {
      label: "Topic pools",
      rows: {
        label: text("Topic"),
        condition: text("Availability / condition"),
        entries: {
          label: "Lines",
          rows: {
            text: text("Line"),
            condition: text("Condition"),
            reveals: text("Reveals / leads"),
            kind: {
              label: "Kind",
              type: "choice",
              options: ["", "dialogue", "evidence", "flavor"],
            },
          },
        },
      },
    },
    evidence: {
      label: "Evidence",
      rows: {
        title: text("Title"),
        content: text("Evidence"),
        required: { label: "Required clue", type: "boolean" },
        delivery: text("Delivery"),
        condition: text("Condition"),
        lead: text("Lead / implication"),
        fallback: text("Fallback delivery"),
      },
    },
    outcomes: text("Outcomes / follow-up"),
  },
  challenge: {
    mode: {
      label: "Resolution",
      type: "choice",
      options: ["individual_checks", "threshold"],
    },
    goal: text("Goal"),
    success_target: number("Success target"),
    failure_target: number("Failure target"),
    checks: {
      label: "Approaches / checks",
      rows: {
        approach: text("Approach / ability"),
        dc: number("DC"),
        effect: text("Success effect"),
        complication: text("Failure complication"),
        successes: number("Success contribution"),
        failures: number("Failure contribution"),
      },
    },
    success_result: text("Success / continuation"),
    failure_result: text("Failure / continuation"),
  },
};
export const blockNames: Record<BlockKind, string> = {
  story: "Story",
  scene: "Scene",
  character: "Character",
  conversation: "Conversation encounter",
  challenge: "Challenge",
};
export function newBlock(type: BlockKind): SessionBlock {
  return {
    id: crypto.randomUUID(),
    type,
    title: blockNames[type],
    data: type === "challenge" ? { mode: "individual_checks" } : {},
  } as SessionBlock;
}
export function duplicateBlock(block: SessionBlock): SessionBlock {
  const copy = structuredClone(block);
  // Duplicate rows get new identities; internal story links follow the duplicated beats.
  const mapping = new Map<string, string>();
  function collect(value: unknown) {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.id === "string") mapping.set(row.id, crypto.randomUUID());
      Object.entries(row)
        .filter(([key]) => key !== "reference")
        .forEach(([, child]) => collect(child));
    }
  }
  function rewrite(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === "reference" ? child : rewrite(child),
        ]),
      );
    return typeof value === "string" ? (mapping.get(value) ?? value) : value;
  }
  collect(copy);
  return { ...(rewrite(copy) as SessionBlock), title: `${block.title} (copy)` };
}
export type PlayState = {
  hp: Record<string, number>;
  used: string[];
  revealed: string[];
  draws: Record<string, string>;
  successes: Record<string, number>;
  failures: Record<string, number>;
  beat: string;
};
export const emptyPlayState = (): PlayState => ({
  hp: {},
  used: [],
  revealed: [],
  draws: {},
  successes: {},
  failures: {},
  beat: "",
});
export function playKey(user: number, campaign: string, item: string) {
  return `dmhq:session-play:v1:${user}:${campaign}:${item}`;
}
export function prunePlayState(
  state: PlayState,
  blocks: SessionBlock[],
): PlayState {
  const valid = new Set<string>();
  function visit(value: unknown, prefix: string) {
    if (Array.isArray(value)) value.forEach((child) => visit(child, prefix));
    else if (value && typeof value === "object") {
      const row = value as Record<string, unknown>;
      if (typeof row.id === "string") valid.add(`${prefix}:${row.id}`);
      Object.entries(row)
        .filter(([key]) => key !== "reference")
        .forEach(([, child]) => visit(child, prefix));
    }
  }
  blocks.forEach((block) => {
    valid.add(block.id);
    visit(block.data, block.id);
  });
  const filter = <T>(record: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(record ?? {}).filter(([key]) => valid.has(key)),
    );
  const beats = blocks
    .filter((block) => block.type === "story")
    .flatMap((block) => block.data.beats ?? [])
    .map((beat) => beat.id);
  return {
    hp: filter(state.hp),
    used: (state.used ?? []).filter((id) => valid.has(id)),
    revealed: (state.revealed ?? []).filter((id) => valid.has(id)),
    draws: Object.fromEntries(
      Object.entries(filter(state.draws)).filter(([key, value]) =>
        valid.has(`${key.split(":")[0]}:${value}`),
      ),
    ),
    successes: filter(state.successes),
    failures: filter(state.failures),
    beat: beats.includes(state.beat) ? state.beat : "",
  };
}
