export type BlockKind =
  | "story"
  | "scene"
  | "character"
  | "conversation"
  | "challenge";
export type Identified = { id: string };
export type Action = Identified & {
  name?: string;
  attack_bonus?: number;
  save_dc?: number;
  range?: string;
  damage?: string;
  effect?: string;
  trigger?: string;
  usage?: string;
  activation?: string;
};
export type StoryBeat = Identified & {
  title?: string;
  goal?: string;
  stakes?: string;
  progression?: string;
  outcomes?: string;
  next_beat_id?: string;
  scene_ids?: string[];
  encounter_ids?: string[];
};
export type BlockData = {
  story: { summary?: string; truth?: string; beats?: StoryBeat[] };
  scene: {
    location_id?: string;
    mood?: string;
    sights?: string;
    sounds?: string;
    scent?: string;
    lighting?: string;
    features?: string;
    read_aloud?: string;
  };
  character: {
    ruleset?: "dnd_5e_2014" | "";
    species?: string;
    creature_type?: string;
    size?: string;
    role?: string;
    appearance?: string;
    voice?: string;
    motivation?: string;
    fear?: string;
    knowledge?: string;
    ac?: number;
    max_hp?: number;
    initiative?: number;
    level?: number;
    speed?: string;
    cr?: string;
    abilities?: Partial<
      Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>
    >;
    saving_throws?: string;
    skills?: string;
    resistances?: string;
    immunities?: string;
    senses?: string;
    languages?: string;
    tactics?: string;
    attacks?: Action[];
    actions?: Action[];
    bonus_actions?: Action[];
    reactions?: Action[];
    special_actions?: Action[];
    traits?: Action[];
  };
  conversation: {
    participant_ids?: string[];
    setup?: string;
    wants?: string;
    demeanor?: string;
    topics?: Array<
      Identified & {
        label?: string;
        condition?: string;
        entries?: Array<
          Identified & {
            text?: string;
            condition?: string;
            reveals?: string;
            kind?: string;
          }
        >;
      }
    >;
    evidence?: Array<
      Identified & {
        title?: string;
        content?: string;
        delivery?: string;
        condition?: string;
        lead?: string;
        fallback?: string;
        required?: boolean;
      }
    >;
    outcomes?: string;
  };
  challenge: {
    mode?: "individual_checks" | "threshold";
    goal?: string;
    success_target?: number;
    failure_target?: number;
    checks?: Array<
      Identified & {
        approach?: string;
        dc?: number;
        effect?: string;
        complication?: string;
        successes?: number;
        failures?: number;
      }
    >;
    success_result?: string;
    failure_result?: string;
  };
};
export type SessionBlock = {
  [K in BlockKind]: {
    id: string;
    type: K;
    title: string;
    beat_id?: string;
    context?: string;
    reference?: { item_id: string; block_id: string };
    data: BlockData[K] & Record<string, unknown>;
    source_title?: string;
    source_version?: number;
    reference_error?: string;
  };
}[BlockKind];
export type BlockCollection = {
  version: 1;
  entries: SessionBlock[];
  [key: string]: unknown;
};
