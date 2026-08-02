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

## Important distinctions

### Template fields and extension prose

A template version defines the structured fields a DM enters directly for a template-backed entity or session. Stable field keys and typed values support validation, search, revisions, exports, and agent interpretation. The item's Markdown body is optional extension prose for context that the current template does not model; it is not a duplicate field editor. Notes remain Markdown-first.

### Source content and published content

Player visibility is not a side effect of viewing the same object. A publication has its own safe title, summary, selected content, revision, and lifecycle so private edits are not accidentally exposed. The first release uses publication snapshots; live derived publications may be evaluated later.

### Relationship and claim

A relationship connects subjects, such as a person belonging to a faction. A claim describes what is asserted and can later represent canon, rumors, secrets, assumptions, contradictions, or beliefs without forcing those semantics onto every relationship.

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
