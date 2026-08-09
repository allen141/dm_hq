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

For a template-backed record, typed controls edit YAML frontmatter in the canonical Markdown document. The complete frontmatter and body are sent, versioned, exported, and indexed together. Notes remain Markdown-first because they are intentionally unstructured. See [ADR 0005](../decisions/0005-markdown-canonical-campaign-documents.md).

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
| Reference | A navigational connection from one Archive item to another that produces a backlink without asserting a fictional fact. |
| Relationship | A meaningful connection between durable subjects, such as a person belonging to a faction. |
| Claim | An assertion that may carry a source, confidence, effective time, and knowledge scope. |
| Session record | A plan for, and later a record of, a period of play. |
| Revision | A recoverable change to Archive content. |
| Publication | A deliberate, player-safe representation of private source content. |

### Reference, relationship, and placement

A reference means that one Archive item points to another. It supports navigation and backlinks but does not state that the subjects are related in the fictional world. A relationship is a typed semantic connection, such as a person belonging to a faction. Each relationship is authored once in the source item's Markdown frontmatter; incoming connections, inverse wording, per-page panels, and graphs are derived from that canonical entry rather than copied into the target document.

Accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) adds a generic document-link projection so the campaign home and item bodies can link through stable logical campaign or item identities. It also defines view placement for presentation-only choices such as putting an item at a map coordinate or adding it to a relationship board. A placement must not become a location fact or relationship merely because it appears in a view.

### Relationship and claim

A relationship connects subjects. A claim captures what is asserted about the campaign and can represent canon, a rumor, a secret, a belief, an assumption, or contradictory information. This distinction allows the product to grow into provenance and knowledge tracking without making every first-release link complex.

### Revision and campaign history

Revision history answers what the user edited and when. Fictional chronology answers when something was true in the campaign. Planning state distinguishes an expected event from an actual outcome. Knowledge history answers who knew or believed something and when. The first release requires revision recovery; the richer historical views remain future work.

### Source content and publication

A publication has its own safe Markdown document, revision, and lifecycle. Editing a private Archive record does not silently publish the change. Revocation prevents future player access without erasing the publication history.

## Archive exploration experience

**Status:** Accepted architecture with an integrated DM-only proof of concept.

The Archive shell keeps search and quick capture available across several lenses over the same campaign knowledge:

- **Wiki** is a fixed core tab. The canonical `campaign.md` body is its home page, and notes, entities, and sessions are its other pages.
- **Graph** is a fixed core tab. Its one-hop view derives a bounded, read-only edge atlas from all campaign links, references, and semantic relationships; two-hop exploration expands from the selected page.
- **Maps** appears after a campaign creates its first map.
- **Relationships** appears after a campaign creates its first relationship board.

The accepted model allows several named maps and relationship boards. The current shell links to the first active view of each type; a multiple-view selector or view manager is follow-up work.

The document-link projection uses logical campaign and item UUIDs; the internal `CampaignDocument.id` is never a page identity or canonical link target. Each map or relationship board has a canonical `archive_view` Markdown document and an `ArchiveView` SQL summary row. The Markdown stores curation, layout, captions, and references to existing items; the current PoC reads membership and placements directly from that Markdown rather than materializing separate projection tables. Relationship boards read canonical relationship entries from item Markdown rather than creating canvas-only edges.

Maps accept a direct external HTTPS image URL and required alt text. The browser loads that URL with a no-referrer policy; the UI warns that the image host still receives the request and that the exported campaign contains the URL, not a self-contained image. All exploration views remain DM-private. A player-visible wiki, graph, map, or relationship board would require a separate, versioned safe publication artifact instead of hiding private nodes in the browser.

See the [Archive exploration views plan](../planning/archive-exploration-views.md) and accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) for the PoC boundary. The approved [Graph UI revamp](../planning/graph-ui-revamp.md) and [ADR 0007](../decisions/0007-webgl-graph-renderer.md) promote the automatic Graph to a client-only Sigma.js and Graphology experience with bounded summaries and an equivalent semantic fallback. Persisted automatic-graph positions remain out of scope. Persisted manual relationship-board positions, dedicated membership and placement projections, and multiple-view selection remain follow-up work.

## Core workflows

**Capture:** record a scratch note or create an entity without completing a schema.

**Prepare:** structure or link notes, associate people and places, and collect relevant records into a planned session.

**Run:** find relevant information quickly, follow connections without losing context, and capture improvised details.

**Reconcile:** promote session outcomes into durable records while preserving what was originally planned.

**Publish:** create and preview a safe representation before releasing it to players.

**Recover:** restore an unwanted edit and export the complete campaign in a portable form.

## Release direction

[The Archive roadmap](../planning/archive-roadmap.md) defines release boundaries, while the [Archive implementation plan](../planning/archive-implementation-plan.md) tracks the active Release 1 foundation. The accepted exploration boundary supports the integrated PoC; remaining production hardening and richer visual interaction stay explicit follow-up work.


## Canonical campaign documents

Every DM-authored campaign document, item, template version, and publication entry is one Markdown file with YAML frontmatter and a Markdown body. Typed controls edit frontmatter; source mode edits the complete document. The API returns Markdown, rendered HTML, parsed metadata, projections, version, and hash. PostgreSQL indexes and relationship tables are derived for fast navigation and search, while the persistent document volume provides a local-file working set for authorized agent workspaces.
