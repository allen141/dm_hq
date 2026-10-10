"use client";
import { useEffect, useState } from "react";
import {
  createApiClient,
  type BlockCollection,
  type BlockKind,
  type ItemSummary,
  type SessionBlock,
} from "@dm-hq/api-client";
import {
  blockFields,
  blockNames,
  duplicateBlock,
  newBlock,
  type Field,
} from "@/lib/session-blocks";
import styles from "./session-blocks.module.css";
const client = createApiClient();
type Values = Record<string, unknown>;
const mechanical = new Set([
  "ac",
  "max_hp",
  "initiative",
  "level",
  "speed",
  "cr",
  "abilities",
  "saving_throws",
  "skills",
  "resistances",
  "immunities",
  "senses",
  "languages",
  "attacks",
  "actions",
  "bonus_actions",
  "reactions",
  "special_actions",
  "traits",
]);
export function Fields({
  fields,
  value,
  onChange,
  items,
  blocks,
  character = false,
  threshold = false,
}: {
  fields: Record<string, Field>;
  value: Values;
  onChange: (value: Values) => void;
  items: ItemSummary[];
  blocks: SessionBlock[];
  character?: boolean;
  threshold?: boolean;
}) {
  const set = (key: string, next: unknown) => {
    const updated = { ...value };
    if (next === undefined || next === "") delete updated[key];
    else updated[key] = next;
    onChange(updated);
  };
  return (
    <div className={styles.fields}>
      {Object.entries(fields)
        .filter(
          ([key]) =>
            (!character ||
              value.ruleset === "dnd_5e_2014" ||
              Object.keys(value).some((field) => mechanical.has(field)) ||
              !mechanical.has(key)) &&
            (threshold || !["success_target", "failure_target"].includes(key)),
        )
        .map(([key, field]) => {
          const current = value[key];
          if (field.rows) {
            const rows = (Array.isArray(current) ? current : []) as Values[];
            return (
              <fieldset key={key} className={styles.group}>
                <legend>{field.label}</legend>
                {rows.map((row, index) => (
                  <details open key={String(row.id)} className={styles.row}>
                    <summary>
                      {String(
                        row.name ||
                          row.title ||
                          row.label ||
                          row.approach ||
                          `Entry ${index + 1}`,
                      )}
                    </summary>
                    <Fields
                      fields={field.rows!}
                      value={row}
                      onChange={(next) =>
                        set(
                          key,
                          rows.map((entry, position) =>
                            position === index ? next : entry,
                          ),
                        )
                      }
                      items={items}
                      blocks={blocks}
                    />
                    <div className={styles.controls}>
                      <button
                        type="button"
                        className="secondary"
                        disabled={!index}
                        onClick={() => {
                          const next = [...rows];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          set(key, next);
                        }}
                      >
                        Move entry up
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={index === rows.length - 1}
                        onClick={() => {
                          const next = [...rows];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          set(key, next);
                        }}
                      >
                        Move entry down
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          set(
                            key,
                            rows.filter((_, position) => position !== index),
                          )
                        }
                      >
                        Remove entry
                      </button>
                    </div>
                  </details>
                ))}
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    set(key, [...rows, { id: crypto.randomUUID() }])
                  }
                >
                  Add {field.label.toLowerCase()} entry
                </button>
              </fieldset>
            );
          }
          if (field.fields)
            return (
              <fieldset key={key} className={styles.group}>
                <legend>{field.label}</legend>
                <Fields
                  fields={field.fields}
                  value={(current ?? {}) as Values}
                  onChange={(next) => set(key, next)}
                  items={items}
                  blocks={blocks}
                />
              </fieldset>
            );
          let choices: { id: string; title: string }[] = [];
          if (["item", "items"].includes(field.type ?? "")) choices = items;
          if (field.type === "scene")
            choices = blocks.filter((block) => block.type === "scene");
          if (field.type === "encounter")
            choices = blocks.filter((block) =>
              ["conversation", "challenge"].includes(block.type),
            );
          if (field.type === "beat")
            choices = blocks
              .filter((block) => block.type === "story")
              .flatMap((block) => block.data.beats ?? [])
              .map((beat) => ({
                id: beat.id,
                title: beat.title ?? "Untitled beat",
              }));
          if (
            ["item", "items", "scene", "encounter", "beat"].includes(
              field.type ?? "",
            )
          ) {
            const multiple = ["items", "scene", "encounter"].includes(
              field.type!,
            );
            return (
              <label key={key}>
                {field.label}
                <select
                  multiple={multiple}
                  value={
                    multiple
                      ? ((Array.isArray(current) ? current : []) as string[])
                      : String(current ?? "")
                  }
                  onChange={(event) =>
                    set(
                      key,
                      multiple
                        ? Array.from(
                            event.target.selectedOptions,
                            (option) => option.value,
                          )
                        : event.target.value,
                    )
                  }
                >
                  {!multiple && <option value="">None</option>}
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.title}
                    </option>
                  ))}
                </select>
                {multiple && (
                  <small>
                    Choose any number of entries (Ctrl / Command to select
                    several).
                  </small>
                )}
              </label>
            );
          }
          if (field.type === "choice")
            return (
              <label key={key}>
                {field.label}
                <select
                  value={String(current ?? field.options?.[0] ?? "")}
                  onChange={(event) => set(key, event.target.value)}
                >
                  {field.options?.map((option) => (
                    <option value={option} key={option}>
                      {option === ""
                        ? "System-neutral / unspecified"
                        : option.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            );
          if (field.type === "boolean")
            return (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={current === true}
                  onChange={(event) => set(key, event.target.checked)}
                />{" "}
                {field.label}
              </label>
            );
          if (field.type === "number")
            return (
              <label key={key}>
                {field.label}
                <input
                  type="number"
                  step="1"
                  value={typeof current === "number" ? current : ""}
                  onChange={(event) =>
                    set(
                      key,
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                    )
                  }
                />
              </label>
            );
          return (
            <label key={key}>
              {field.label}
              <textarea
                rows={2}
                value={String(current ?? "")}
                onChange={(event) => set(key, event.target.value)}
              />
            </label>
          );
        })}
    </div>
  );
}
function ReferencePicker({
  block,
  onChange,
  items,
}: {
  block: SessionBlock;
  onChange: (value: SessionBlock) => void;
  items: ItemSummary[];
}) {
  const [target, setTarget] = useState(block.reference?.item_id ?? "");
  const [available, setAvailable] = useState<SessionBlock[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (target)
      void client
        .item(target)
        .then((item) => {
          if (active) {
            setAvailable(
              (item.resolved_blocks ?? []).filter(
                (row) => row.type === block.type && !row.reference,
              ),
            );
            setError("");
          }
        })
        .catch((cause) => {
          if (active) {
            setAvailable([]);
            setError(
              cause instanceof Error
                ? cause.message
                : "Reference could not be loaded",
            );
          }
        });
    return () => {
      active = false;
    };
  }, [target, block.type]);
  return (
    <fieldset className={styles.group}>
      <legend>Reuse an Archive block</legend>
      <label>
        Source page
        <select
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setAvailable([]);
          }}
        >
          <option value="">Choose a page</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Canonical {blockNames[block.type]}
        <select
          value={
            block.reference?.item_id === target
              ? (block.reference?.block_id ?? "")
              : ""
          }
          onChange={(event) => {
            if (event.target.value)
              onChange({
                ...block,
                reference: { item_id: target, block_id: event.target.value },
                data: {},
              } as SessionBlock);
          }}
        >
          <option value="">Choose a block</option>
          {available.map((row) => (
            <option value={row.id} key={row.id}>
              {row.title}
            </option>
          ))}
        </select>
      </label>
      {target && !available.length && !error && (
        <p>No concrete blocks of this type available.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {block.reference && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const next = { ...block };
            delete next.reference;
            onChange(next);
          }}
        >
          Use local definition
        </button>
      )}
      <p>
        Canonical data stays on its source page. Use context for this session’s
        additions.
      </p>
    </fieldset>
  );
}
export default function BlocksEditor({
  collection,
  onChange,
  items,
}: {
  collection?: BlockCollection;
  onChange: (collection: BlockCollection) => void;
  items: ItemSummary[];
}) {
  const blocks = collection?.entries ?? [];
  const [type, setType] = useState<BlockKind>("scene");
  if (
    collection &&
    (collection.version !== 1 ||
      !Array.isArray(collection.entries) ||
      collection.entries.some(
        (block) =>
          !block ||
          typeof block !== "object" ||
          !Object.hasOwn(blockFields, block.type) ||
          !block.data ||
          typeof block.data !== "object" ||
          Array.isArray(block.data),
      ))
  )
    return (
      <p role="alert">
        Unsupported or malformed block collection. Repair it in Source;
        structured editing is unavailable.
      </p>
    );
  const setBlocks = (entries: SessionBlock[]) =>
    onChange({ ...collection, version: 1, entries });
  return (
    <section className={styles.editor} aria-label="Standard blocks">
      <h3>Standard blocks</h3>
      <p>
        Private DM material. Empty sections stay hidden in Read. Unknown source
        fields are preserved.
      </p>
      {blocks.map((block, index) => (
        <details className={styles.card} key={block.id}>
          <summary>
            {blockNames[block.type]} · {block.title}
          </summary>
          <label>
            Block title
            <input
              value={block.title}
              onChange={(event) =>
                setBlocks(
                  blocks.map((row) =>
                    row.id === block.id
                      ? { ...row, title: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <Fields
            fields={{
              beat_id: { label: "Associated story beat", type: "beat" },
              context: { label: "Session context" },
            }}
            value={block}
            onChange={(next) =>
              setBlocks(
                blocks.map((row) =>
                  row.id === block.id ? (next as SessionBlock) : row,
                ),
              )
            }
            items={items}
            blocks={blocks}
          />
          {["scene", "character"].includes(block.type) && (
            <ReferencePicker
              block={block}
              items={items}
              onChange={(next) =>
                setBlocks(
                  blocks.map((row) => (row.id === block.id ? next : row)),
                )
              }
            />
          )}
          {block.type === "character" &&
            !block.reference &&
            block.data.ruleset !== "dnd_5e_2014" &&
            Object.keys(block.data).some((key) => mechanical.has(key)) && (
              <p role="alert">
                Existing mechanical fields require the D&D 5e 2014 extension.
                Select that ruleset or clear the mechanical fields in Source
                before saving.
              </p>
            )}
          {!block.reference && (
            <Fields
              fields={blockFields[block.type]}
              character={block.type === "character"}
              threshold={
                block.type === "challenge" && block.data.mode === "threshold"
              }
              value={block.data}
              onChange={(data) =>
                setBlocks(
                  blocks.map((row) =>
                    row.id === block.id
                      ? ({ ...row, data } as SessionBlock)
                      : row,
                  ),
                )
              }
              items={items}
              blocks={blocks}
            />
          )}
          <div className={styles.controls}>
            <button
              type="button"
              className="secondary"
              disabled={!index}
              onClick={() => {
                const next = [...blocks];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                setBlocks(next);
              }}
            >
              Move block up
            </button>
            <button
              type="button"
              className="secondary"
              disabled={index === blocks.length - 1}
              onClick={() => {
                const next = [...blocks];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                setBlocks(next);
              }}
            >
              Move block down
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setBlocks([
                  ...blocks.slice(0, index + 1),
                  duplicateBlock(block),
                  ...blocks.slice(index + 1),
                ])
              }
            >
              Duplicate block
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setBlocks(blocks.filter((row) => row.id !== block.id))
              }
            >
              Remove block
            </button>
          </div>
        </details>
      ))}
      <div className={styles.controls}>
        <label>
          New block type
          <select
            value={type}
            onChange={(event) => setType(event.target.value as BlockKind)}
          >
            {Object.entries(blockNames).map(([kind, name]) => (
              <option key={kind} value={kind}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => setBlocks([...blocks, newBlock(type)])}
        >
          Add block
        </button>
      </div>
    </section>
  );
}
