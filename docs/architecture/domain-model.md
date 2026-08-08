# Domain model

This is shared vocabulary for discovery, not a finalized database schema. The Archive uses these concepts without prescribing an implementation technology.

| Concept | Purpose |
| --- | --- |
| User | A person authenticated to DM HQ. |
| Campaign | The top-level container for a group's world and play history. |
| Membership | A user's role and access within a campaign. |
| Entity | A durable subject such as a person, place, faction, thing, event, or piece of lore. |
| Note | Primarily unstructured content linked to entities and sessions. |
| Template | An immutable, reusable definition of the structured fields a DM enters for an entity or planning record. |
| Reference | A navigational connection from one Archive item to another that produces a backlink without asserting a semantic fact. |
| Relationship | A meaningful connection between durable campaign subjects. |
| Claim | An assertion with possible provenance, confidence, effective time, and knowledge scope. |
| Revision | A recoverable change to Archive content. |
| Publication | A deliberate, versioned player-safe representation of private source content. |
| Session | A planned or completed period of play. |
| Scene | A focused part of a session with a location, cast, and purpose. |
| Thread | An unresolved goal, clue, conflict, or plot direction. |
| Encounter | A prepared or completed conflict involving combatants. |
| Combatant | An encounter participant with temporary runtime state. |
| Ruleset extension | Templates, fields, terminology, validation, and references associated with a particular game system. |

## Archive exploration vocabulary

The following concepts are accepted by [ADR 0006](../decisions/0006-archive-exploration-view-model.md) and used by the Archive PoC.

| Concept | Purpose |
| --- | --- |
| Document link | A rebuildable projection of an inline link from the campaign home or an Archive item to a logical campaign or item UUID. |
| Archive view | A campaign-owned definition that curates and lays out one named map or relationship board without owning Archive facts. |
| Placement | Presentation-only membership, position, caption, or layout data connecting an Archive item to an Archive view. |

## Important distinctions

### Template fields and extension prose

A template version is itself a Markdown document whose frontmatter defines typed controls. Template-backed records store those values in their own Markdown frontmatter, alongside aliases, tags, links, and relationship notes. The complete document (frontmatter plus body) is canonical; controls are an editing projection and notes remain Markdown-first.

### Link, reference, relationship, and placement

An existing reference is an explicit item-to-item navigational connection projected from frontmatter. Document links extend navigation to inline links from `campaign.md` or an Archive item and can target the logical campaign page or an item. Canonical links and page routes use campaign or item UUIDs, never the internal `CampaignDocument.id`.

A relationship is a typed assertion between durable subjects. It is authored once in the source Archive item's Markdown frontmatter with a stable edge UUID and target item UUID. The target page's incoming or inverse view is derived; it does not own a mirrored fact. A placement only controls which item appears in a map or relationship board and where it is drawn. Removing a placement must not delete the item or a relationship, and moving a map pin must not silently assert a fictional location.

### Archive item and Archive view

An Archive item owns campaign prose and structured facts. An Archive view owns only curation, captions, filters, and presentation layout for a named map or relationship board. It has a canonical `archive_view` Markdown document and an `ArchiveView` SQL summary row. The current PoC reads members and placements from the Markdown; dedicated membership and placement projection rows are follow-up work. Wiki and Graph are fixed core lenses rather than view documents; Maps and Relationships are optional top-level lenses.

### Source content and published content

Player visibility is not a side effect of viewing the same object. A publication has its own safe Markdown document, revision, and lifecycle so private edits are not accidentally exposed. The first release uses publication snapshots; live derived publications may be evaluated later.

### Relationship and claim

A relationship connects subjects, such as a person belonging to a faction. Its machine-readable kind preserves meaning while optional forward and inverse labels control how the same directed edge reads on each item page. A claim describes what is asserted and can later represent canon, rumors, secrets, assumptions, contradictions, or beliefs without forcing those semantics onto every relationship.

### Revision and campaign history

Revision history records what a user edited. Fictional chronology records when something was true in the campaign. Planning state separates expected and actual outcomes. Knowledge history records who knew or believed something and when. These histories may intersect, but they are not interchangeable.

### Entity and combatant

An NPC is durable campaign knowledge. That NPC can appear as a combatant in multiple encounters, each with independent initiative, hit points, conditions, and outcomes.

### Shared concepts and 2014 5e

Campaigns, entities, notes, relationships, claims, revisions, sessions, and publications do not assume a ruleset. The first ruleset extension targets 2014 Dungeons & Dragons 5e and may add ruleset-specific templates and fields. See [ADR 0001](../decisions/0001-2014-5e-first.md).

## Modeling questions

- How should templates evolve while preserving existing records and exports?
- Which claims need fictional effective dates in addition to revision timestamps?
- Which campaign-specific custom fields must remain searchable and filterable?
- How are incomplete or contradictory claims reconciled without losing provenance?
- Which publication information must remain after player access is revoked?
- How should existing frontmatter references and generic document links converge over time without losing meaning?
- Which shared navigation refinements belong in `campaign.md`, and which interaction state should remain personal?
- Which graph edge classes are useful by default without overwhelming the DM?
- When should self-contained map assets replace or supplement the accepted external-HTTPS-URL exception?
- What separate publication representation could make a visual view player-safe?
