# The Archive

The Archive is the campaign's durable knowledge base and preparation space. It is the canonical source of campaign information used by the Dashboard and Battlefield, and it serves both private DM work and deliberately published player resources.

The first ruleset experience targets the 2014 edition of Dungeons & Dragons 5e. Shared campaign concepts remain ruleset-neutral so that 5e-specific fields and references do not control the whole Archive model. See [ADR 0001](../decisions/0001-2014-5e-first.md).

## Product outcome

A DM should be able to capture an idea before deciding how to classify it, add structure when it becomes useful, find it within seconds during play, record what changed, and publish only the information intended for players.

The Archive supports this lifecycle:

1. Capture rough ideas.
2. Organize them into reusable structures.
3. Connect them through meaningful relationships.
4. Use them in campaign and session planning.
5. Record what happens during play.
6. Preserve revisions and campaign history.
7. Publish selected information to players.
8. Export and recover the campaign.

## Product principles

### Capture before classification

Writing down an improvised detail should be faster than deciding where it belongs. Notes may remain incomplete, uncertain, unnamed, or contradictory.

### Add structure progressively

Prose can later gain a type, fields, tags, relationships, and a template. Structure should help retrieval and reuse without turning preparation into mandatory data entry.

For a template-backed record, the template fields are the primary interface: the DM enters typed values directly in labeled controls, and agents can interpret stable field keys without parsing prose. The common Markdown body remains an optional extension for context or exceptional details that the template does not cover. It is not a duplicate scratch field. Notes remain Markdown-first because they are intentionally unstructured. See [ADR 0004](../decisions/0004-structured-template-fields.md).

### Keep one canonical record

The Dashboard and Battlefield reference Archive subjects instead of maintaining copies. Maps, graphs, timelines, search results, and player pages are views of Archive information rather than independent stores.

### Protect secrets deliberately

Archive content is private by default. A player publication is a separate, versioned representation that a DM previews and releases intentionally. Player access must not depend on hiding private fields at display time.

### Preserve and explain change

The Archive should distinguish an edit to a record from a change in the fictional world, a plan becoming an outcome, or a character learning something. Users should be able to understand where information came from, why it appears, and who can see it.

### Keep campaign data portable

A campaign may last for years. Its prose, structured data, relationships, publications, and attachments must remain exportable, recoverable, and understandable outside the application.

### Start with 2014 5e without becoming a compendium

Initial templates and references may cover 2014 5e characters, NPC statistics, items, spells, sessions, and encounters. DM HQ is not a character builder or a replacement for purchased or licensed rules content.

## Archive concepts

These terms describe product behavior, not a finalized storage schema.

| Concept | Purpose |
| --- | --- |
| Campaign | The top-level container for the group's world and play history. |
| Entity | A durable campaign subject such as a person, place, faction, thing, event, or piece of lore. |
| Note | Primarily unstructured content that may stand alone or link to other Archive records. |
| Template | A reusable starting structure for a kind of entity or planning record. |
| Relationship | A meaningful connection between durable subjects, such as a person belonging to a faction. |
| Claim | An assertion that may carry a source, confidence, effective time, and knowledge scope. |
| Session record | A plan for, and later a record of, a period of play. |
| Revision | A recoverable change to Archive content. |
| Publication | A deliberate, player-safe representation of private source content. |

### Relationship and claim

A relationship connects subjects. A claim captures what is asserted about the campaign and can represent canon, a rumor, a secret, a belief, an assumption, or contradictory information. This distinction allows the product to grow into provenance and knowledge tracking without making every first-release link complex.

### Revision and campaign history

Revision history answers what the user edited and when. Fictional chronology answers when something was true in the campaign. Planning state distinguishes an expected event from an actual outcome. Knowledge history answers who knew or believed something and when. The first release requires revision recovery; the richer historical views remain future work.

### Source content and publication

A publication has its own safe title, summary, selected content, revision, and lifecycle. Editing a private Archive record does not silently publish the change. Revocation prevents future player access without erasing the publication history.

## Core workflows

**Capture:** record a scratch note or create an entity without completing a schema.

**Prepare:** structure or link notes, associate people and places, and collect relevant records into a planned session.

**Run:** find relevant information quickly, follow connections without losing context, and capture improvised details.

**Reconcile:** promote session outcomes into durable records while preserving what was originally planned.

**Publish:** create and preview a safe representation before releasing it to players.

**Recover:** restore an unwanted edit and export the complete campaign in a portable form.

## Release direction

[The Archive roadmap](../planning/archive-roadmap.md) defines the current first-release candidate and preserves later capabilities without authorizing implementation before the project exits discovery.
