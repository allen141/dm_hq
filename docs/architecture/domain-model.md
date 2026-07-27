# Domain model

This is shared vocabulary for discovery, not a finalized database schema.

| Concept | Purpose |
| --- | --- |
| User | A person authenticated to DM HQ. |
| Campaign | The top-level container for a group's world and play history. |
| Membership | A user's role and access within a campaign. |
| Entity | A durable subject such as an NPC, place, faction, or item. |
| Note | Primarily unstructured content linked to entities and sessions. |
| Relationship | A meaningful connection between campaign subjects. |
| Publication | A deliberate player-visible representation of content. |
| Session | A planned or completed period of play. |
| Scene | A focused part of a session with a location, cast, and purpose. |
| Thread | An unresolved goal, clue, conflict, or plot direction. |
| Encounter | A prepared or completed conflict involving combatants. |
| Combatant | An encounter participant with temporary runtime state. |

## Important distinctions

### Source content and published content

Player visibility should not be a side effect of viewing the same object. A publication may need its own safe title, summary, fields, and lifecycle so private edits are not accidentally exposed.

### Entity and combatant

An NPC is durable campaign knowledge. That NPC can appear as a combatant in multiple encounters, each with independent initiative, hit points, conditions, and outcomes.

### Plan and history

A session or encounter can begin as a plan and finish as historical fact. The model should preserve what was prepared, what happened, and what was carried forward without duplicate manual records.

## Modeling questions

- Are NPC, place, faction, and item separate types or templates over one entity?
- Are relationships typed, directional, and time-bound?
- Is publication a filtered view, a snapshot, or separately edited content?
- Which changes require history and which may be overwritten?
- Can campaign-specific custom fields remain searchable and exportable?
