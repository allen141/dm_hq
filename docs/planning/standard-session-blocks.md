# Standard session blocks

## Confirmed decisions

[ADR 0011](../decisions/0011-standard-session-blocks.md) records the accepted format, reuse rules, local tracking, and preview isolation. Both Scene workspace and Compact outline remain supported. Scene workspace is the default; switching layouts does not save a document revision.

## Block contract

Archive items optionally carry `blocks: {version: 1, entries: [...]}` in JSON or YAML frontmatter. Each entry requires a UUID `id`, supported `type`, `title`, and a `data` object. Optional `beat_id` associates it with a Story beat. Optional `context` holds session-specific prose. Unknown metadata fields survive structured editing.

Block IDs and nested row IDs are unique within their document. Every list row has its own UUID. Each collection and nested list is limited to 200 entries. Known fields are validated by type. Text is rendered as plain text with canonical campaign links, never as executable HTML.

| Block type | Fields and purpose |
| --- | --- |
| `story` | `summary`, `truth`, ordered `beats` with title, goal, stakes, progression, outcomes, `next_beat_id`, `scene_ids`, `encounter_ids` |
| `scene` | `location_id`, mood, sights, sounds, scent, lighting, features, read_aloud |
| `character` | Role, appearance, voice, motivation, fear, knowledge; optional explicit 2014 D&D 5e mechanics |
| `conversation` | `participant_ids`, setup, wants, demeanor, topic pools, evidence, outcomes |
| `challenge` | Goal, checks, success/failure continuation; `individual_checks` or `threshold` resolution |

Character mechanics include AC, maximum HP, initiative, speed, level, CR, six ability scores, saves, skills, defenses, senses, languages, and tactics. The six separate action lists are `attacks`, `actions`, `bonus_actions`, `reactions`, `special_actions`, and `traits`. Entries contain name, attack bonus, save DC, range, damage, effect, trigger, usage, and activation as applicable. Missing mechanics stay unspecified; forms do not invent defaults. Empty action groups are hidden in Read.

Conversation topics contain label, condition, and entries with text, condition, reveals, and kind (`dialogue`, `evidence`, or `flavor`). Evidence contains title, content, required flag, delivery, condition, lead, and fallback. A condition is guidance to the DM, not an automatically evaluated rule. Required clues remain visible alongside their fallback delivery.

Challenge checks contain approach, optional DC, effect, complication, and optional success/failure contributions. Threshold mode requires positive success and failure targets. Individual checks do not imply a shared pool. Recording a result does not automatically advance the story.

A Scene or Character reference is `{item_id, block_id}` and uses an empty `data` object. The referenced block must be a concrete definition of the same type on another item in this campaign. The private item API adds typed `resolved_blocks` without rewriting authored metadata. A missing definition returns `reference_error`. Canonical source titles and versions link back to the source page.

## Editing and reading

Use Edit to add blocks, reorder or duplicate blocks, edit nested entries, associate beats, and select canonical records. Use Source for the complete canonical document, including unknown extension fields. YAML and JSON frontmatter share the same parser. Invalid frontmatter disables saving and structured editing until repaired; it is never silently replaced by empty metadata.

Scene workspace shows plot guidance separately from scene and encounter cards. Selecting a beat shows its associated material plus unassigned reusable characters and blocks. The same scene may serve several beats. Compact outline preserves authored ordering and collapses dense blocks. Supplementary Markdown remains available for content outside the standard formats.

Prep hides runtime controls. Play enables local HP, dialogue draws and use flags, evidence reveal flags, active beat, and threshold counts. Tracking has Undo and page Reset. Removed entries are pruned when loading; canonical edits preserve remaining identities. Tracking is scoped to the referencing block, so two uses of one canonical character do not share HP accidentally. Storage failures fall back to memory with an explicit message.

Player publication uses separately authored player-safe prose for pages containing blocks. Blocks, resolved records, and supplemental DM notes are not copied automatically. Existing prose-only pages retain the current handout workflow.

## Delivery and demo

Implementation uses existing full-document create/update APIs, optimistic concurrency, history, and restore. Block text participates in search. Item references and canonical inline links project backlinks. Export/restore remaps item and campaign UUIDs while preserving block and row UUIDs. No parallel database or new SQL schema is introduced.

The demonstration is prepared privately from a copied campaign page. Its page identity, title, hierarchy, source provenance, and original revision remain intact. It uses five Story acts, environmental scenes, canonical character definitions, conversation pools, and the checks actually specified in the source. All original mechanics, hazards, clues, and outcomes remain recoverable. Missing links and portraits remain explicit; no new rule values or pooled thresholds are invented.

Campaign content and conversion artifacts stay outside this repository. The production campaign and DokuWiki are unchanged. [Preview snapshots](../operations/preview-campaigns.md) document the copy and recovery procedure.

## Validation

Backend checks cover typed validation, stable identities, revisions, stale writes, same-campaign resolution, missing references, search, backlinks, export/restore, and private publications. Browser and component checks cover both layouts, authoring, explicit action groups, dialogue draws, undo, local persistence, account/page isolation, and tablet widths. Run application checks and `mkdocs build --strict` before publishing the branch.

## Open questions

- Shared tracking across devices and multiple DMs remains deferred.
- More ruleset extensions require a separate format and product decision.
- Automatic reconciliation of preview edits into production is out of scope; a reviewed document export can be used later.
