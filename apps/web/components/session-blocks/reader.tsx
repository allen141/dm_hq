"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Action, SessionBlock } from "@dm-hq/api-client";
import {
  blockNames,
  emptyPlayState,
  playKey,
  prunePlayState,
  type PlayState,
} from "@/lib/session-blocks";
import styles from "./session-blocks.module.css";
function Text({ value, campaign }: { value?: string; campaign: string }) {
  if (!value) return null;
  const pieces = value.split(
    /(\[[^\]]+\]\(dmhq:\/\/(?:item|campaign)\/[0-9a-f-]+\))/gi,
  );
  return (
    <span className={styles.text}>
      {pieces.map((piece, index) => {
        const match = piece.match(
          /^\[([^\]]+)\]\(dmhq:\/\/(item|campaign)\/([0-9a-f-]+)\)$/i,
        );
        return match ? (
          <Link
            key={index}
            href={
              match[2] === "item"
                ? `/campaigns/${campaign}/archive/items/${match[3]}`
                : `/campaigns/${campaign}/archive`
            }
          >
            {match[1]}
          </Link>
        ) : (
          piece
        );
      })}
    </span>
  );
}
function Fact({
  label,
  value,
  campaign,
}: {
  label: string;
  value?: string | number;
  campaign: string;
}) {
  return value !== undefined && value !== "" ? (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>
        <Text value={String(value)} campaign={campaign} />
      </dd>
    </div>
  ) : null;
}
type Runtime = {
  state: PlayState;
  play: boolean;
  change: (update: (previous: PlayState) => PlayState) => void;
  campaign: string;
  itemTitles: Record<string, string>;
  outline: boolean;
};
function ActionSection({
  label,
  entries,
  campaign,
}: {
  label: string;
  entries?: Action[];
  campaign: string;
}) {
  return entries?.length ? (
    <section className={styles.actionSection}>
      <h4>{label}</h4>
      {entries.map((action) => (
        <div className={styles.action} key={action.id}>
          <strong>{action.name || label}</strong>
          <dl className={styles.facts}>
            {[
              [
                "Attack",
                action.attack_bonus === undefined
                  ? undefined
                  : `${action.attack_bonus >= 0 ? "+" : ""}${action.attack_bonus}`,
              ],
              ["Save DC", action.save_dc],
              ["Range", action.range],
              ["Damage", action.damage],
              ["Effect", action.effect],
              ["Trigger", action.trigger],
              ["Usage", action.usage],
              ["Activation", action.activation],
            ].map(([name, value]) => (
              <Fact
                key={name}
                label={String(name)}
                value={value}
                campaign={campaign}
              />
            ))}
          </dl>
        </div>
      ))}
    </section>
  ) : null;
}
function BlockContent({
  block,
  runtime,
}: {
  block: SessionBlock;
  runtime: Runtime;
}) {
  const { campaign, play, state, change, itemTitles } = runtime;
  if (block.reference_error) return <p role="alert">{block.reference_error}</p>;
  if (block.type === "story")
    return (
      <>
        <dl className={styles.facts}>
          <Fact
            label="Synopsis"
            value={block.data.summary}
            campaign={campaign}
          />
          <Fact label="DM truth" value={block.data.truth} campaign={campaign} />
        </dl>
        {runtime.outline &&
          block.data.beats?.map((beat) => (
            <details key={beat.id} className={styles.row}>
              <summary>{beat.title || "Untitled beat"}</summary>
              <dl className={styles.facts}>
                {[
                  ["Goal", beat.goal],
                  ["Stakes", beat.stakes],
                  ["Progression", beat.progression],
                  ["Outcomes", beat.outcomes],
                ].map(([label, value]) => (
                  <Fact
                    key={label}
                    label={String(label)}
                    value={value}
                    campaign={campaign}
                  />
                ))}
              </dl>
            </details>
          ))}
      </>
    );
  if (block.type === "scene")
    return (
      <>
        <dl className={styles.facts}>
          {[
            ["Atmosphere", block.data.mood],
            ["Sights", block.data.sights],
            ["Sounds", block.data.sounds],
            ["Scent / sensation", block.data.scent],
            ["Light / weather", block.data.lighting],
            ["Space / features", block.data.features],
          ].map(([label, value]) => (
            <Fact
              key={label}
              label={String(label)}
              value={value}
              campaign={campaign}
            />
          ))}
        </dl>
        {block.data.location_id && (
          <Link
            href={`/campaigns/${campaign}/archive/items/${block.data.location_id}`}
          >
            {itemTitles[block.data.location_id] ?? "Open location"}
          </Link>
        )}
        {block.data.read_aloud && (
          <blockquote className={styles.readAloud}>
            <span className={styles.eyebrow}>Read aloud</span>
            <Text value={block.data.read_aloud} campaign={campaign} />
          </blockquote>
        )}
      </>
    );
  if (block.type === "character") {
    const data = block.data;
    return (
      <>
        {data.ruleset && <p className={styles.eyebrow}>D&D 5e · 2014</p>}
        <dl className={styles.stats}>
          {[
            ["AC", data.ac],
            ["HP", data.max_hp],
            ["Initiative", data.initiative],
            ["Speed", data.speed],
            ["CR", data.cr],
            ["Level", data.level],
          ].map(([label, value]) => (
            <Fact
              key={label}
              label={String(label)}
              value={value}
              campaign={campaign}
            />
          ))}
        </dl>
        {data.abilities && (
          <dl className={styles.stats}>
            {Object.entries(data.abilities).map(([key, score]) => (
              <Fact
                key={key}
                label={key.toUpperCase()}
                value={`${score} (${Math.floor((score! - 10) / 2) >= 0 ? "+" : ""}${Math.floor((score! - 10) / 2)})`}
                campaign={campaign}
              />
            ))}
          </dl>
        )}
        {play && data.max_hp !== undefined && (
          <label className={styles.hp}>
            Current HP (this device)
            <input
              aria-label={`Current HP for ${block.title}`}
              type="number"
              min={0}
              value={state.hp[block.id] ?? data.max_hp}
              onChange={(event) => {
                const hp = Number(event.target.value);
                change((previous) => ({
                  ...previous,
                  hp: { ...previous.hp, [block.id]: Math.max(0, hp) },
                }));
              }}
            />
          </label>
        )}
        <dl className={styles.facts}>
          {[
            ["Species", data.species],
            [
              "Type / size",
              [data.creature_type, data.size].filter(Boolean).join(" · "),
            ],
            ["Role", data.role],
            ["Appearance", data.appearance],
            ["Voice", data.voice],
            ["Wants", data.motivation],
            ["Fear", data.fear],
            ["Knowledge", data.knowledge],
            ["Saves", data.saving_throws],
            ["Skills", data.skills],
            ["Resistances", data.resistances],
            ["Immunities", data.immunities],
            ["Senses", data.senses],
            ["Languages", data.languages],
            ["Tactics", data.tactics],
          ].map(([label, value]) => (
            <Fact
              key={label}
              label={String(label)}
              value={value}
              campaign={campaign}
            />
          ))}
        </dl>
        <ActionSection
          label="Attacks"
          entries={data.attacks}
          campaign={campaign}
        />
        <ActionSection
          label="Actions"
          entries={data.actions}
          campaign={campaign}
        />
        <ActionSection
          label="Bonus Actions"
          entries={data.bonus_actions}
          campaign={campaign}
        />
        <ActionSection
          label="Reactions"
          entries={data.reactions}
          campaign={campaign}
        />
        <ActionSection
          label="Special Actions"
          entries={data.special_actions}
          campaign={campaign}
        />
        <ActionSection
          label="Passive Traits"
          entries={data.traits}
          campaign={campaign}
        />
      </>
    );
  }
  if (block.type === "conversation")
    return (
      <>
        <dl className={styles.facts}>
          <Fact label="Setup" value={block.data.setup} campaign={campaign} />
          <Fact label="Wants" value={block.data.wants} campaign={campaign} />
          <Fact
            label="Demeanor"
            value={block.data.demeanor}
            campaign={campaign}
          />
        </dl>
        {block.data.participant_ids?.length ? (
          <p>
            Participants:{" "}
            {block.data.participant_ids.map((id, index) => (
              <Link
                key={id}
                href={`/campaigns/${campaign}/archive/items/${id}`}
              >
                {itemTitles[id] ?? `Character ${index + 1}`}{" "}
              </Link>
            ))}
          </p>
        ) : null}
        {block.data.topics?.map((topic) => {
          const poolKey = `${block.id}:${topic.id}`;
          const unused = (topic.entries ?? []).filter(
            (line) => !state.used.includes(`${block.id}:${line.id}`),
          );
          const drawn = state.draws[poolKey];
          return (
            <section key={topic.id} className={styles.topic}>
              <h4>{topic.label || "Topic"}</h4>
              <Text value={topic.condition} campaign={campaign} />
              {play && (
                <div className={styles.controls}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!unused.length}
                    onClick={() => {
                      const selected =
                        unused[Math.floor(Math.random() * unused.length)];
                      change((previous) => ({
                        ...previous,
                        draws: { ...previous.draws, [poolKey]: selected.id },
                      }));
                    }}
                  >
                    Draw unused line
                  </button>
                  <span>{unused.length} unused</span>
                </div>
              )}
              {topic.entries?.map((line) => {
                const key = `${block.id}:${line.id}`;
                const used = state.used.includes(key);
                return (
                  <div
                    key={line.id}
                    className={`${styles.line} ${used && play ? styles.used : ""} ${drawn === line.id && play ? styles.drawn : ""}`}
                  >
                    <span className={styles.eyebrow}>
                      {line.kind || "Dialogue"}
                      {used && play ? " · used" : ""}
                      {drawn === line.id && play ? " · drawn" : ""}
                    </span>
                    <p>
                      <Text value={line.text} campaign={campaign} />
                    </p>
                    <dl className={styles.facts}>
                      <Fact
                        label="Condition"
                        value={line.condition}
                        campaign={campaign}
                      />
                      <Fact
                        label="Reveals"
                        value={line.reveals}
                        campaign={campaign}
                      />
                    </dl>
                    {play && (
                      <button
                        type="button"
                        className="secondary"
                        aria-pressed={used}
                        onClick={() =>
                          change((previous) => ({
                            ...previous,
                            used: used
                              ? previous.used.filter((id) => id !== key)
                              : [...previous.used, key],
                          }))
                        }
                      >
                        {used ? "Mark unused" : "Mark used"}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        {block.data.evidence?.map((evidence) => {
          const key = `${block.id}:${evidence.id}`;
          const revealed = state.revealed.includes(key);
          return (
            <section key={evidence.id} className={styles.evidence}>
              <h4>
                {evidence.title || "Evidence"}{" "}
                <span className={styles.badge}>
                  {evidence.required === true
                    ? "Required"
                    : evidence.required === false
                      ? "Optional"
                      : "Unclassified"}
                  {play && revealed ? " · revealed" : ""}
                </span>
              </h4>
              <Text value={evidence.content} campaign={campaign} />
              <dl className={styles.facts}>
                {[
                  ["Delivery", evidence.delivery],
                  ["Condition", evidence.condition],
                  ["Lead", evidence.lead],
                  ["Fallback", evidence.fallback],
                ].map(([label, value]) => (
                  <Fact
                    key={label}
                    label={String(label)}
                    value={value}
                    campaign={campaign}
                  />
                ))}
              </dl>
              {play && (
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={revealed}
                  onClick={() =>
                    change((previous) => ({
                      ...previous,
                      revealed: revealed
                        ? previous.revealed.filter((id) => id !== key)
                        : [...previous.revealed, key],
                    }))
                  }
                >
                  {revealed ? "Mark unrevealed" : "Mark revealed"}
                </button>
              )}
            </section>
          );
        })}
        <dl className={styles.facts}>
          <Fact
            label="Outcomes"
            value={block.data.outcomes}
            campaign={campaign}
          />
        </dl>
      </>
    );
  const successes = state.successes[block.id] ?? 0;
  const failures = state.failures[block.id] ?? 0;
  const threshold = block.data.mode === "threshold";
  return (
    <>
      <dl className={styles.facts}>
        <Fact label="Goal" value={block.data.goal} campaign={campaign} />
      </dl>
      <p className={styles.eyebrow}>
        {threshold ? "Threshold challenge" : "Individual checks"}
      </p>
      {threshold && (
        <p aria-live="polite">
          Successes {successes} / {block.data.success_target} · Failures{" "}
          {failures} / {block.data.failure_target}
          {successes >= (block.data.success_target ?? Infinity)
            ? " · success threshold reached"
            : failures >= (block.data.failure_target ?? Infinity)
              ? " · failure threshold reached"
              : ""}
        </p>
      )}
      {block.data.checks?.map((check) => (
        <section key={check.id} className={styles.check}>
          <h4>
            {check.approach || "Check"}{" "}
            {check.dc !== undefined && (
              <span className={styles.badge}>DC {check.dc}</span>
            )}
          </h4>
          <dl className={styles.facts}>
            <Fact label="Success" value={check.effect} campaign={campaign} />
            <Fact
              label="Complication"
              value={check.complication}
              campaign={campaign}
            />
          </dl>
          {play && threshold && (
            <div className={styles.controls}>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  change((previous) => ({
                    ...previous,
                    successes: {
                      ...previous.successes,
                      [block.id]:
                        (previous.successes[block.id] ?? 0) +
                        (check.successes ?? 1),
                    },
                  }))
                }
              >
                Record success
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  change((previous) => ({
                    ...previous,
                    failures: {
                      ...previous.failures,
                      [block.id]:
                        (previous.failures[block.id] ?? 0) +
                        (check.failures ?? 1),
                    },
                  }))
                }
              >
                Record failure
              </button>
            </div>
          )}
        </section>
      ))}
      <dl className={styles.facts}>
        <Fact
          label="Success / continuation"
          value={block.data.success_result}
          campaign={campaign}
        />
        <Fact
          label="Failure / continuation"
          value={block.data.failure_result}
          campaign={campaign}
        />
      </dl>
    </>
  );
}
export default function BlocksReader({
  blocks,
  userId,
  campaignId,
  itemId,
  itemTitles = {},
}: {
  blocks: SessionBlock[];
  userId: number;
  campaignId: string;
  itemId: string;
  itemTitles?: Record<string, string>;
}) {
  const [layout, setLayout] = useState<"workspace" | "outline">("workspace");
  const [play, setPlay] = useState(false);
  const [state, setState] = useState<PlayState>(emptyPlayState);
  const [undo, setUndo] = useState<PlayState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [selectedBeat, setSelectedBeat] = useState("");
  const key = playKey(userId, campaignId, itemId);
  const layoutKey = `dmhq:session-layout:v1:${userId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const saved = raw
        ? prunePlayState(JSON.parse(raw), blocks)
        : emptyPlayState();
      // Hydrate device-local external storage after server rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(saved);
      setSelectedBeat(saved.beat);
      setUndo([]);
      setLayout(
        localStorage.getItem(layoutKey) === "outline" ? "outline" : "workspace",
      );
    } catch {
      setStorageError(
        "Device storage unavailable. Play tracking lasts only for this visit.",
      );
    }
    setLoaded(true);
  }, [key, layoutKey, blocks]);
  function change(update: (previous: PlayState) => PlayState) {
    setUndo((previous) => [...previous.slice(-49), state]);
    const next = update(state);
    setState(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setStorageError(
        "Device storage unavailable. Play tracking lasts only for this visit.",
      );
    }
  }
  function chooseLayout(next: "workspace" | "outline") {
    setLayout(next);
    try {
      localStorage.setItem(layoutKey, next);
    } catch {
      setStorageError("Layout preference could not be saved on this device.");
    }
  }
  const stories = blocks.filter((block) => block.type === "story");
  const beats = stories.flatMap((block) => block.data.beats ?? []);
  const beat = beats.find((row) => row.id === selectedBeat) ?? null;
  const runtime: Runtime = {
    state,
    play,
    change,
    campaign: campaignId,
    itemTitles,
    outline: layout === "outline",
  };
  const visible = blocks.filter(
    (block) =>
      block.type !== "story" &&
      (!beat ||
        block.beat_id === beat.id ||
        beat.scene_ids?.includes(block.id) ||
        beat.encounter_ids?.includes(block.id) ||
        (!block.beat_id &&
          !beats.some(
            (row) =>
              row.scene_ids?.includes(block.id) ||
              row.encounter_ids?.includes(block.id),
          ))),
  );
  const card = (block: SessionBlock) => (
    <details
      key={block.id}
      className={styles.card}
      open={layout === "workspace" || block.type === "story"}
    >
      <summary>
        <span className={styles.eyebrow}>{blockNames[block.type]}</span>
        <span>{block.title}</span>
      </summary>
      {block.reference && (
        <p className={styles.source}>
          <Link
            href={`/campaigns/${campaignId}/archive/items/${block.reference.item_id}`}
          >
            {block.source_title || "Canonical source"}
          </Link>{" "}
          · v{block.source_version ?? "?"}
        </p>
      )}
      {block.context && (
        <dl className={styles.facts}>
          <Fact
            label="Session context"
            value={block.context}
            campaign={campaignId}
          />
        </dl>
      )}
      <BlockContent block={block} runtime={runtime} />
    </details>
  );
  if (!loaded) return <p>Loading standard blocks…</p>;
  return (
    <section className={styles.reader} aria-label="Standard session blocks">
      <div className={styles.toolbar}>
        <div role="group" aria-label="Reading layout">
          <button
            type="button"
            className="secondary"
            aria-pressed={layout === "workspace"}
            onClick={() => chooseLayout("workspace")}
          >
            Scene workspace
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={layout === "outline"}
            onClick={() => chooseLayout("outline")}
          >
            Compact outline
          </button>
        </div>
        <div role="group" aria-label="Session mode">
          <button
            type="button"
            className="secondary"
            aria-pressed={!play}
            onClick={() => setPlay(false)}
          >
            Prep
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={play}
            onClick={() => setPlay(true)}
          >
            Play
          </button>
        </div>
      </div>
      {play && (
        <div className={styles.controls}>
          <small>
            Play state stays on this device and account. Authored content is
            unchanged.
          </small>
          <button
            type="button"
            className="secondary"
            disabled={!undo.length}
            onClick={() => {
              const previous = undo[undo.length - 1];
              setState(previous);
              setSelectedBeat(previous.beat);
              setUndo(undo.slice(0, -1));
              try {
                localStorage.setItem(key, JSON.stringify(previous));
              } catch {
                setStorageError(
                  "Play state could not be saved on this device.",
                );
              }
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (
                window.confirm(
                  "Reset play tracking for this page on this device?",
                )
              ) {
                change(() => emptyPlayState());
                setSelectedBeat("");
              }
            }}
          >
            Reset play state
          </button>
        </div>
      )}
      {storageError && <p role="status">{storageError}</p>}
      {layout === "outline" ? (
        <div className={styles.outline}>{blocks.map(card)}</div>
      ) : (
        <>
          {stories.map(card)}
          {beats.length > 0 && (
            <nav className={styles.beats} aria-label="Story beats">
              <button
                type="button"
                className="secondary"
                aria-pressed={!beat}
                onClick={() => {
                  setSelectedBeat("");
                  if (play) change((previous) => ({ ...previous, beat: "" }));
                }}
              >
                All beats
              </button>
              {beats.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className="secondary"
                  aria-pressed={beat?.id === row.id}
                  onClick={() => {
                    setSelectedBeat(row.id);
                    if (play)
                      change((previous) => ({ ...previous, beat: row.id }));
                  }}
                >
                  {row.title || "Untitled beat"}
                </button>
              ))}
            </nav>
          )}
          {beat && (
            <section className={styles.activeBeat}>
              <h3>{beat.title}</h3>
              <dl className={styles.facts}>
                {[
                  ["Goal", beat.goal],
                  ["Stakes", beat.stakes],
                  ["Progression", beat.progression],
                  ["Outcomes", beat.outcomes],
                ].map(([label, value]) => (
                  <Fact
                    key={label}
                    label={String(label)}
                    value={value}
                    campaign={campaignId}
                  />
                ))}
              </dl>
              {beat.next_beat_id && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setSelectedBeat(beat.next_beat_id!);
                    if (play)
                      change((previous) => ({
                        ...previous,
                        beat: beat.next_beat_id!,
                      }));
                  }}
                >
                  Next beat
                </button>
              )}
            </section>
          )}
          <div className={styles.workspace}>{visible.map(card)}</div>
        </>
      )}
    </section>
  );
}
