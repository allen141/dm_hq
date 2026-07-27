# DM HQ Archive — Core Feature Plan

## Purpose

The **Archive** is the foundational knowledge system for DM HQ. It serves as the canonical source of campaign information used by both the **Dashboard** and the **Battlefield**.

The Archive should support the full lifecycle of campaign knowledge:

1. Capture rough ideas.
2. Organize them into reusable structures.
3. Connect them through meaningful relationships.
4. Use them in campaign and session planning.
5. Record what happens during play.
6. Preserve historical state and revisions.
7. Publish selected information to players.

The first iteration should be designed specifically for **Dungeons & Dragons 5th Edition**, while keeping the underlying architecture modular enough to support other rulesets later.

---

## Priority Levels

| Priority | Meaning |
|---|---|
| **P0 — Archive foundation** | Required before meaningful Dashboard or Battlefield development can begin. |
| **P1 — First complete product** | Needed for a useful end-to-end 5e campaign workflow. |
| **P2 — Expansion** | Adds substantial usability, visualization, and content-management capabilities. |
| **P3 — Later extensibility** | Valuable after the core product and data model have been proven. |

---

## Feature Blocks

The features below are grouped into implementation blocks. Features within a block are related and may share data models, interfaces, or infrastructure, but they remain distinct capabilities.

### 1. Archive Foundation

**Priority:** P0

- Campaign containers
- Durable campaign entities
- Free-form notes
- Built-in entity types:
  - People
  - Places
  - Things
  - Events
  - Factions
  - Lore
- User-defined entity types
- Tags
- Static collections
- Stable references between records
- Private-by-default content
- A canonical source of truth shared by the Dashboard and Battlefield

---

### 2. Composable Schemas and Templates

**Priority:** P0

Users should be able to define reusable, composable templates for any type of campaign information and quickly create instances from them.

- User-defined templates for information types
- Templates for built-in and custom entity types
- Custom fields
- Reusable field groups
- Reusable page sections
- Nested template components
- Templates composed from other templates
- Required and optional fields
- Default values
- Field validation
- Template inheritance or extension
- Rapid creation of new instances
- Conversion of rough notes into structured entities
- Updating a template without unnecessarily overwriting existing records
- Campaign-specific templates
- Reusable templates that can be shared across campaigns

Example templates might include:

- Person
- Merchant
- Noble
- Faction leader
- Settlement
- Dungeon
- Organization
- Magic item
- Historical event
- Session
- Story arc
- Encounter

---

### 3. Relationships and Knowledge Semantics

**Priority:** P0

The Archive should support arbitrary graph relationships between any records.

- Relationships between any two campaign subjects
- Typed relationships
- Directional relationships
- Reciprocal relationship descriptions
- Relationship-specific notes
- Relationship start and end dates
- Current and former relationships
- Relationship visibility
- Confidence or certainty
- Source and provenance
- Aliases
- Former names
- Backlinks
- Canonical facts
- Rumors
- Secrets
- Assumptions
- Plans
- Contradictory information
- Retconned information
- Player beliefs
- Character beliefs
- Information known only to specific factions or individuals

Example relationships:

- A person **belongs to** a faction.
- A faction **controls** a location.
- A person **betrayed** another person.
- An item **was created by** a historical figure.
- An event **caused** another event.
- A settlement **is located within** a region.
- A player character **knows** a particular secret.

---

### 4. Authoring and Knowledge Capture

**Priority:** P0

The Archive should make it easy to record information before the user knows how it should be structured.

- Markdown or rich-text authoring
- Quick-capture inbox
- Scratch notes
- Inline entity creation
- Inline relationship creation
- Attachments
- Reusable content blocks
- Embedding and transclusion
- Session debrief workflow
- Promotion of improvised details into permanent records
- Review queue for incomplete information
- Review queue for unresolved information
- Ability to mark content as:
  - Draft
  - Tentative
  - Canon
  - Deprecated
  - Retconned
- Low-friction capture during live play

---

### 5. Search, Navigation, and Contextual Views

**Priority:** P0

A large Archive must remain fast to navigate during preparation and live sessions.

- Full-text search
- Search by aliases and former names
- Filters by:
  - Entity type
  - Tag
  - Collection
  - Location
  - Faction
  - Status
  - Visibility
  - Session
  - Date
- Quick-open navigation
- Recently viewed records
- Recently changed records
- Favorites and pinned records
- Saved searches
- Dynamic collections
- Backlink navigation
- Breadcrumbs
- Contextual views generated from relationships

Example contextual views:

- All NPCs currently in a location
- All unresolved threads involving a faction
- Everything connected to an artifact
- All records relevant to the next session
- All information a particular player character knows
- Everything changed since the previous session

---

### 6. History, Versioning, and Temporal State

**Priority:** P1

The Archive should preserve both the history of campaign development and the history of the fictional world.

- Revision history
- Undo and restore
- Named snapshots
- Change attribution
- Change timestamps
- Change reasons
- Session-linked changes
- Campaign-development history
- Retcon records
- Dated facts
- Historical ownership
- Historical faction membership
- Historical allegiance
- Current versus former state
- Planned versus completed events
- “As of session” views
- “As of date” views
- World-state comparisons
- Before-and-after views
- Timeline of changes to an individual entity
- Ability to distinguish:
  - What was planned
  - What happened
  - What was believed
  - What is currently canon

---

### 7. Campaign and Story Planning

**Priority:** P1

The Archive should contain the planning structures that later drive the Dashboard and Battlefield.

- Player characters
- Sessions
- Scenes
- Encounters
- Story arcs
- Quests
- Clues
- Secrets
- Character goals
- Faction agendas
- Mysteries
- Unresolved questions
- Promises
- Debts
- Foreshadowing
- Pending consequences
- Alternate possible futures
- Preparation notes
- Expected outcomes
- Actual session outcomes
- Connections between campaign plans and permanent world entities
- Ability to track unresolved narrative threads over time

---

### 8. Dungeons & Dragons 5e Integration

**Priority:** P1

The first product iteration should be purpose-built for Dungeons & Dragons 5th Edition.

- 5e-first templates
- Player-character records
- Character-sheet import hooks
- Character-sheet synchronization hooks
- Manual character-sheet entry
- Ability scores
- Skills
- Saving throws
- Armor Class
- Hit points
- Temporary hit points
- Proficiency bonus
- Speed and movement types
- Senses
- Languages
- Conditions
- Exhaustion
- Class resources
- Inventory
- Equipment
- Currency
- Spells
- Spell slots
- Features
- Feats
- Species
- Backgrounds
- Classes and subclasses
- Monster and NPC stat blocks
- Items
- Magic items
- Rules references
- Linkage between player characters and Archive entities
- Linkage between characters, sessions, and encounters
- Integration points for licensed or user-provided 5e resources
- Clear distinction between open rules content, licensed content, and user-created content

The underlying architecture should remain modular so that other rulesets can be added later without weakening the 5e experience.

---

### 9. Player Knowledge and Publishing

**Priority:** P1

Player-facing information should be deliberately released rather than merely hidden through interface filters.

- Objective world truth
- DM-only knowledge
- Group knowledge
- Individual-player knowledge
- Character-specific knowledge
- Faction-specific knowledge
- Deliberate publication
- Player-safe summaries
- Handouts
- Per-player visibility
- Per-character visibility
- Publication preview
- Publication history
- Publication revocation
- Corrections and amendments
- Tracking when information was revealed
- Tracking how information was revealed
- Different public and private descriptions of the same entity
- Snapshot-based publications
- Derived or filtered publications
- Prevention of private information leaking into:
  - Player search
  - Player exports
  - Cached responses
  - Logs
  - Shared links

---

### 10. Maps, Timelines, and Graph Visualization

**Priority:** P2

Visualizations should be alternative views of Archive data rather than separate stores of information.

- Relationship graph
- Focused subgraphs
- Graph filtering
- Graph filtering by time
- Graph filtering by player knowledge
- Timeline views
- World maps
- Regional maps
- City maps
- District maps
- Building maps
- Dungeon maps
- Nested map levels
- Points
- Regions
- Routes
- Travel connections
- Distance metadata
- Travel-time metadata
- Entity placement on maps
- Location history
- Historical map states
- DM-only map layers
- Player-visible map layers
- Map-based search and filtering
- Visualization of faction territory
- Visualization of travel and event history

---

### 11. Reusable Libraries and Rich Media

**Priority:** P2

- Reusable setting content
- Reusable 5e resources
- Generic entity templates
- Campaign-specific instances
- Campaign-specific overrides
- Portraits
- Maps
- PDFs
- Audio
- Handouts
- Tables
- External references
- Tokens
- Searchable attachments
- Permission-aware media
- Reusable encounter components
- Reusable location components
- Reusable NPC archetypes
- Importable and exportable content packs

---

### 12. Portability, Backup, and Extensibility

**Priority:** P2–P3

- Complete campaign export
- Human-readable export
- Machine-readable structured export
- Attachment export
- Automated backups
- Manual backups
- Restore from backup
- Data validation
- Import from other note systems
- Import from structured campaign tools
- Optional ruleset modules
- Plugin hooks
- Integration hooks
- Custom terminology
- Campaign migrations
- Long-term schema migration support
- Support for additional game systems
- Ability to self-host or preserve data independently of the service
- Avoidance of irreversible vendor lock-in

---

## Cross-Cutting Product Qualities

These qualities should guide all Archive design and implementation decisions.

| Quality | Design implication |
|---|---|
| **Low-friction capture** | Recording an idea must be faster than deciding how to categorize it. |
| **Progressive structure** | Information may begin as prose and gain fields, relationships, and templates later. |
| **Single source of truth** | Dashboard and Battlefield reference Archive records rather than maintaining separate copies. |
| **Gracefully incomplete** | Partial, uncertain, contradictory, unnamed, or tentative information must remain valid. |
| **Historically aware** | The system preserves what was planned, what occurred, and what was believed at different times. |
| **Context preserving** | Related information should open without making the DM lose their current place. |
| **Fast during play** | Important information should be accessible within seconds and preferably by keyboard. |
| **Private by default** | Player access should always result from deliberate publication or explicit permission. |
| **Portable and durable** | A long-running campaign must remain usable outside the application. |
| **5e-first, modular underneath** | The first experience should feel purpose-built for 5e while preserving future ruleset extensibility. |
| **Composable** | Schemas, templates, fields, content blocks, and views should be reusable and combinable. |
| **Interoperable** | The Archive should integrate with player sheets, rules references, imports, exports, and later tools. |
| **Recoverable** | Accidental edits, failed migrations, and unwanted changes must be reversible. |
| **Explainable** | Users should be able to understand why information appears, who can see it, and where it came from. |

---

## Suggested Release Boundaries

### Release 1 — Archive MVP

Includes:

- Archive foundation
- Composable schemas and templates
- Relationships and knowledge semantics
- Authoring and knowledge capture
- Search and navigation
- Basic revision history

This release should prove that the Archive can serve as a flexible and reliable campaign knowledge base.

---

### Release 2 — 5e Campaign-Ready Archive

Includes:

- Full history and temporal state
- Campaign and story planning
- Initial 5e integration
- Player-character records
- Basic character-sheet import or synchronization
- Player knowledge and publishing
- Session-linked updates

This release should support preparation and operation of an actual 5e campaign.

---

### Release 3 — Rich Exploration and Visualization

Includes:

- Relationship graph
- Timeline visualization
- Maps and spatial hierarchy
- Player-visible map layers
- Reusable libraries
- Rich media
- Advanced contextual views

This release should make large campaign worlds easier to understand and explore.

---

### Release 4 — Platform and Ecosystem

Includes:

- Full portability
- Advanced import and export
- Ruleset modules
- Plugin and integration APIs
- Reusable content packs
- Broader character-sheet and rules-resource integrations
- Additional game systems

---

## Recommended First Vertical Workflow

The first complete implementation should prove the Archive’s central value through one end-to-end workflow:

1. Create a custom **Person** template.
2. Compose it from reusable sections such as:
   - Identity
   - Appearance
   - Personality
   - Affiliations
   - 5e statistics
   - Secrets
3. Instantiate a new NPC from the template.
4. Connect the NPC to a place and faction.
5. Find the NPC through full-text search and relationship navigation.
6. Add the NPC to a planned session.
7. Use the NPC during the session.
8. Record an improvised change or outcome.
9. Reconcile the change into permanent campaign history.
10. Publish a player-safe version of the NPC.
11. Verify that private facts remain hidden.
12. View the NPC in a relationship graph and on a map.

This workflow exercises the central systems without requiring the entire product vision to be complete.

---

## Initial Product Thesis

> **The Archive is a flexible, historically aware, 5e-first campaign knowledge system that allows a Dungeon Master to capture information quickly, structure it progressively, connect it semantically, use it during play, preserve what changes, and deliberately publish selected knowledge to players.**
