# Archive roadmap

This roadmap keeps the active first Archive release narrow while preserving a path to the broader product vision. Release 1 foundation implementation is in progress. Later releases remain directional and should be revisited using research and evidence from real campaigns.

The [Archive implementation plan](archive-implementation-plan.md) tracks Release 1 against the architecture accepted in [ADR 0002](../decisions/0002-archive-application-architecture.md). The Archive exploration PoC implements the boundary accepted in [ADR 0006](../decisions/0006-archive-exploration-view-model.md) while leaving production hardening and advanced visual interaction as follow-up work.

## Delivery rules

- A later capability must not become an unstated Release 1 dependency.
- Early records need stable identities so later views and integrations can reference them.
- Shared campaign concepts remain distinct from 2014 Dungeons & Dragons 5e fields.
- Player publications remain separate from DM-private source content.
- Visualizations derive from canonical Archive data rather than creating parallel records.
- Revision history, fictional chronology, planning state, and knowledge state remain distinct.
- Export must preserve canonical Markdown documents and their derived indexes.

## Discovery validation track

The [Archive exploration views plan](archive-exploration-views.md) defines the Wiki, Graph, Map, and Relationship PoC slices. Accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) supplies their decision boundary.

This began as an evidence track using bounded read models, canonical view Markdown, simple SVG rendering, and direct external HTTPS map images. The implemented [Graph UI revamp](graph-ui-revamp.md), WebGL Map increment, and [Relationship UI revamp](relationship-ui-revamp.md) promote those lenses to production-shaped private experiences without adding a graph database, GIS, attachment pipeline, inferred relationship facts, or persistent automatic layout. Validation must still measure retrieval value, accessibility, privacy, portability, and the risk of duplicating campaign facts.

After validation, each capability is promoted, revised, deferred, or rejected independently. Moving a production capability earlier than Release 3 requires an explicit roadmap change and any necessary accepted architecture decision.

## Release 1 — Archive foundation

Release 1 proves that a DM can capture, retrieve, use, revise, share, and recover campaign knowledge in one connected workflow.

### Included capabilities

**Campaign knowledge**

- Campaign containers.
- Free-form Markdown notes.
- Durable entities with built-in types for people, places, factions, things, events, and lore.
- Draft and canon authoring states.
- Tags, aliases, stable references, and backlinks.
- Quick-capture inbox and Markdown-first notes.
- Private-by-default source content.

**Progressive structure**

- Campaign-local templates.
- Flat custom fields.
- Template fields are typed editing controls over each record's Markdown frontmatter; the complete Markdown document remains canonical.
- Required and optional fields, default values, and basic validation.
- Starter templates for common campaign subjects.
- A Person/NPC template with optional core 2014 5e reference fields, without implementing a character builder or rules compendium.
- Promotion of a rough note into a structured entity without losing its prose or links.

**Connections and retrieval**

- Simple typed, directional relationships with reciprocal wording.
- Relationship notes.
- Full-text search over titles and prose.
- Search by aliases, tags, and entity type.
- Quick-open navigation and backlink navigation.

**Use during play**

- Session records that link relevant Archive entities and notes.
- A Session template for structured planning, status, and outcome data.
- Markdown body prose for details that do not fit the Session template; it is part of the same canonical document.
- Promotion of an improvised detail or outcome into durable campaign knowledge.

**Safety and recovery**

- Basic revision history, undo, and restore.
- Deliberate, versioned publication snapshots.
- Player-safe preview, publication, revocation, and correction.
- Acceptance checks ensuring adjacent private facts do not enter player results, exports, caches, logs, or shared links.
- A complete campaign export covering all content supported in Release 1, including prose, structured fields, relationships, revisions, and publications.
- A documented and verifiable restore path.

### First vertical workflow

1. Create a campaign and a campaign-local Person template.
2. Create an NPC from the template, leaving unknown information incomplete.
3. Connect the NPC to a place and faction.
4. Find the NPC through full-text search, aliases, and relationship navigation.
5. Add the NPC to a planned session.
6. Open the NPC during play and capture an improvised change.
7. Reconcile the outcome into the durable campaign record.
8. Restore an earlier revision and confirm the current record remains understandable.
9. Create and preview a player-safe publication snapshot.
10. Verify private facts are unavailable through the player-facing path.
11. Export the campaign and validate that the NPC, links, revision, and publication are represented.

Graph visualization, maps, advanced historical views, and external character synchronization are intentionally absent from this workflow.

### Exit signals

- A DM can complete the vertical workflow without maintaining duplicate records.
- Prototypes measure capture and retrieval time during a simulated session.
- A DM can explain which information is private and what a player will see before publishing.
- Revision recovery and campaign export are demonstrated, not only described.
- User testing indicates that optional structure helps retrieval without blocking quick capture.

## Release 2 — Campaign-ready knowledge

Release 2 deepens the semantics and planning support needed to operate a long-running 2014 5e campaign.

### Templates and knowledge

- Campaign-local custom entity types.
- Reusable page sections and richer field groups.
- Templates composed from reusable components.
- Tentative, deprecated, and retconned content states.
- Safe template evolution that does not overwrite existing records.
- Relationship visibility, start and end dates, current and former state, confidence, and provenance.
- Claims representing canon, rumors, secrets, assumptions, plans, contradictions, and retcons.
- Aliases and former names with source and provenance.
- Group, player, character, faction, and individual knowledge scopes.
- Inline entity and relationship creation plus a session-debrief workflow.

### History and planning

- Change attribution, timestamps, reasons, and session-linked change sets.
- Fictional effective dates and named snapshots.
- Planned versus completed events.
- Current, former, and “as of session” views.
- Historical ownership, location, faction membership, and allegiance.
- Sessions, scenes, story arcs, quests, clues, secrets, goals, agendas, mysteries, promises, debts, foreshadowing, and pending consequences.
- Preparation notes, alternate possible futures, expected outcomes, actual outcomes, and unresolved narrative threads.
- Static collections, recently viewed and pinned records, and review queues for incomplete or unresolved capture.

### 2014 5e depth

- Manual character and NPC records for ability scores, skills, saving throws, Armor Class, hit points, temporary hit points, proficiency bonus, speed and movement types, senses, languages, conditions, exhaustion, class resources, inventory, equipment, currency, spells, slots, features, feats, species, backgrounds, classes, and subclasses.
- Monster and NPC stat blocks, items, magic items, and rules references.
- Linkage among characters, Archive entities, sessions, and encounters.
- Import hooks for licensed or user-provided sources with source and license metadata.

### Publishing

- Per-player and per-character publications.
- Publication history plus when and how information was revealed.
- Player-safe summaries and handouts.
- Corrections and amendments.
- Different private and published descriptions of the same subject.

## Release 3 — Exploration and reuse

Release 3 makes large campaigns easier to understand and allows proven structures to be reused.

### Advanced structure and discovery

- Nested template components, template inheritance or extension, and cross-campaign template libraries.
- Rich-text authoring, reusable content blocks, embedding, and transclusion.
- Saved searches, dynamic collections, breadcrumbs, recently changed records, and advanced filters.
- Contextual views for location, faction, session, knowledge, unresolved threads, and recent changes.
- Attachments, searchable attachments, and permission-aware media.
- Derived or filtered publications, if they can preserve the deliberate-publication boundary.

### History and visualization

- “As of date” views, world-state comparisons, before-and-after views, and entity timelines.
- Relationship graphs and focused subgraphs filtered by time or knowledge.
- Timeline visualization.
- World, regional, city, district, building, and dungeon maps.
- Nested map levels, points, regions, routes, travel metadata, entity placement, and location history.
- Historical and DM-only map layers, plus separately published player-safe visual artifacts.
- Faction territory, travel history, and event-history views.
- Player-visible graphs, maps, or boards only through a deliberate publication representation, never by hiding private source nodes in the browser.

### Libraries and integrations

- Reusable setting content, generic templates, campaign overrides, encounter components, location components, and NPC archetypes.
- Portraits, maps, PDFs, audio, handouts, tables, tokens, and external references.
- Character-sheet import or synchronization through evaluated providers.
- Importable and exportable content packs.

## Release 4 — Mature platform

Release 4 invests in ecosystem capabilities after the 2014 5e product and its data model have been proven.

- Advanced imports from note systems and structured campaign tools.
- Advanced human-readable and machine-readable exports.
- Automated backups, backup validation, and long-term migration support.
- Integration and plugin hooks.
- Reusable rules resources and broader character or rules-resource integrations.
- Custom terminology.
- Self-hosting or independent data preservation.
- Additional rulesets and optional ruleset modules.

Additional rulesets must not be scheduled merely because the data model can represent them. They require a separate product decision after the 2014 5e experience is mature.

## Capability map

| Capability area | Release 1 | Release 2 | Release 3 | Release 4 |
| --- | --- | --- | --- | --- |
| Campaigns, notes, and entities | Foundation | Richer semantics | Reusable libraries | External imports |
| Templates | Flat campaign-local templates | Composed sections and safe evolution | Nesting, inheritance, and sharing | Portable content packs |
| Relationships and claims | Simple typed links | Provenance, belief, contradiction, and time | Graph exploration | External integrations |
| Search and navigation | Text, aliases, tags, type, quick-open | Knowledge and historical filters | Saved searches and contextual views | Import-aware discovery |
| History | Revision restore | World, plan, and knowledge history | Comparisons and timelines | Long-term migrations |
| Planning | Session links and outcome capture | Full story-planning structures | Visual story exploration | Integration hooks |
| 2014 5e | Starter templates and fields | Detailed records and import hooks | Evaluated synchronization | Broader provider ecosystem |
| Publishing | Versioned snapshots | Per-player knowledge and reveal history | Player-safe visual layers and media | Portable publications |
| Maps and graphs | Canonical-data guardrails only | Data semantics needed by views | Interactive views | Extension hooks |
| Portability | Complete basic export and restore | Versioned structured data | Content packs and media | Advanced migration and preservation |

## Questions that gate later releases

- Which richer structures demonstrably improve preparation or retrieval?
- Which facts need fictional effective dates rather than ordinary revision history?
- How should player identity and access work?
- What offline behavior is necessary at the table?
- Which 2014 5e sources may be imported, stored, indexed, or redistributed?
- What campaign size and usage patterns justify advanced indexing or visualization?
- Which character providers are stable, permitted, and valuable enough to support?


## Markdown-canonical replacement

The Archive implementation uses ADR 0005: one frontmatter-plus-body Markdown document per DM-authored record, durable current files, complete SQL Markdown versions, rebuildable projections, atomic writes, reconciliation, Markdown export/restore, and authenticated local-agent workspace snapshot/changes/apply endpoints. The replacement migration converts existing authored data and removes legacy JSON content fields and API shapes.
