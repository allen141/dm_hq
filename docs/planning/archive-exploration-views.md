# Archive exploration views

**Status:** Accepted PoC plan; implementation validation in progress.

This plan records how the Archive PoC works as a campaign wiki with Wiki, Graph, Map, and Relationship lenses. Accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) authorizes its canonical document and read-model boundary. It does not move production-scale visualization, uploaded map assets, or player-visible visual views into Release 1.

The plan builds on the [Archive product](../product/archive.md), the [Archive roadmap](archive-roadmap.md), the [domain model](../architecture/domain-model.md), and the [Markdown document architecture](../architecture/markdown-documents.md). Sections below preserve the validation rationale; where the current PoC is narrower, the follow-up boundary is stated explicitly.

## Outcome

A DM should be able to:

- Open the campaign's canonical document as a useful wiki-style home page.
- Link one Archive page to another and follow the link in either direction.
- Explore an automatically derived graph of page links and meaningful relationships.
- Open a Maps tab, choose among named maps, and place existing Archive pages on them.
- Open a Relationships tab and choose a named family, faction, household, or other network.
- Move between views without creating copies of campaign facts.
- Reopen the same page from any view and arrive at the same canonical record.

The proofs of concept should answer whether these views improve preparation and retrieval enough to justify changing the roadmap. They should also expose which internal structures are genuinely shared and which are specific to one presentation.

## Non-goals

This plan does not include:

- A production release commitment or a change to the current Release 1 scope.
- A graph database, PostGIS, external map tiles, geocoding, or route finding.
- Selection of a final graph, canvas, or mapping library.
- A general attachment or media-processing pipeline.
- Rich-text editing, transclusion, reusable blocks, or live co-authoring.
- Historical, knowledge-scoped, or claim-aware graph calculations.
- Genealogical inference or a complete family-tree rules engine.
- Player-visible graphs or maps. Those require a separate player-safe publication design.
- Offline editing or conflict resolution beyond the current document version rules.

## Decision boundary

### Confirmed constraints

The following are existing product or architecture decisions:

- Archive items have stable identities and are the shared source used by the Dashboard and Battlefield.
- Complete Markdown documents with YAML frontmatter are canonical authored campaign content. PostgreSQL stores versions and rebuildable projections for authorization, search, and joins.
- References, backlinks, typed directional relationships, and relationship notes already belong to the Archive foundation.
- Maps, graphs, search results, and other visualizations derive from canonical Archive data instead of becoming parallel stores of campaign facts.
- Archive source content is private by default. Player publication is a separate, deliberately created and versioned representation.
- Shared concepts remain ruleset-neutral even though the first ruleset experience targets 2014 Dungeons & Dragons 5e.
- The interface must work on desktop and tablet, support keyboard use, and protect authorization boundaries in the backend.
- The current roadmap places production interactive maps and graphs in Release 3. [ADR 0002](../decisions/0002-archive-application-architecture.md) defers visualization libraries, PostGIS, and graph databases until an active capability and measured need justify them.

### Accepted PoC boundary

The following choices are accepted for the PoC by ADR 0006:

- Every note, entity, and session can be rendered as a wiki page. `Page` is a presentation role, not a new Archive item kind.
- Wiki and Graph are fixed core Archive tabs for every campaign.
- Maps and Relationships are optional top-level tabs. Each appears after the campaign creates its first view of that type. The accepted design contains a selector for named instances; the current PoC links to the first active instance.
- The canonical `campaign.md` body is the wiki home page. Until it has authored content, the interface may show a generated starting state without saving generated prose.
- The Graph is derived automatically and does not persist its own nodes or semantic edges.
- Map and Relationship view instances persist only configuration, membership, placement, and explanatory text. They do not copy titles, prose, or relationship facts from Archive items.
- Campaign-owned view definitions are canonical Markdown documents. Personal interaction state, such as the last open tab, current zoom, or temporary filters, is not campaign content and remains ephemeral.
- A generic derived `DocumentLink` resolves inline links from the campaign home or an Archive item to logical campaign or item UUIDs. Canonical links and public routes never use the internal `CampaignDocument.id`.
- The initial Graph includes the campaign home and uses document links, existing references, and typed relationships. Other possible edge sources remain opt-in until testing shows they are useful.

## Navigation model

### Tabs and view instances

The Archive tab strip contains:

1. **Wiki** — the primary writing and reading surface.
2. **Graph** — an automatic view of links and relationships.
3. **Maps** — an optional tab that selects among named maps such as “Sword Coast” or “Castle Level 2.”
4. **Relationships** — an optional tab that selects among named boards such as “Royal Family” or “Harbor Factions.”

Wiki and Graph remain present as the fixed core views. Maps or Relationships appears only after the first instance of that type exists. The accepted design changes named instances inside the optional tab without adding more top-level tabs. The current PoC opens the first active view, so the selector or view manager remains follow-up work. An “Add map” or “Add relationship board” action creates a view instance; it does not create an Archive item.

Each optional view has a stable ID, title, type, and deep link. Renaming a view changes its label, not its identity. Archiving the last view of one type removes that type's top-level tab while preserving view history and every item shown in it.

### Wiki behavior

The Wiki tab renders the canonical `campaign.md` body as the campaign home page. Before the DM authors that body, the interface may show a generated starting state with quick capture, search, recently changed items, and useful entry points. Generated prose is not saved as campaign content.

Campaign-owned shared navigation also belongs to `campaign.md`. Further organization comes from stable links among the campaign home and Archive items. A DM can make the campaign home link to an index, a place page link to its residents, a faction page link to its rivals, or a session page link to relevant clues without placing those records in separate folder-owned copies.

The editor inserts links through search so the stored link uses a stable logical target ID and the displayed label remains human-readable. Canonical links use `dmhq://campaign/<uuid>` or `dmhq://item/<uuid>`; exports rewrite them to relative Markdown paths and record logical ID/path mappings. Missing targets are invalid.

### Shared navigation configuration

The `campaign.md` frontmatter carries campaign-owned Archive navigation separately from the Wiki home body. The configuration supports:

- A schema version so the structure can migrate deliberately.
- Ordered navigation groups with stable group keys and human-readable titles.
- Ordered links whose targets use logical campaign or item UUIDs, with optional display labels.
- Optional ordering for the Wiki, Graph, Maps, and Relationships tab types while Wiki and Graph remain present as core views.
- Ordered view UUIDs within Maps and Relationships so each type selector has a shared campaign order.

One illustrative shape is:

```yaml
archive:
  schema_version: 1
  navigation:
    groups:
      - key: starting-points
        title: Starting points
        links:
          - target_type: campaign
            target_id: 11111111-1111-1111-1111-111111111111
            label: Campaign home
          - target_type: item
            target_id: 22222222-2222-2222-2222-222222222222
  tabs:
    order: [wiki, graph, maps, relationships]
    view_order:
      maps: [33333333-3333-3333-3333-333333333333]
      relationships: [44444444-4444-4444-4444-444444444444]
```

This shape is a prototype input, not an accepted frontmatter schema. It must not store personal graph focus, filters, selection, pan, zoom, or last-open state. It also must not encode semantic relationships; navigation links and view ordering only orchestrate access to facts stored elsewhere.

### Proposed browser routes

These routes describe stable navigation outcomes. They do not prescribe the current frontend file layout.

| Route | Purpose |
| --- | --- |
| `/campaigns/{campaign_id}/archive` | Open the `campaign.md` Wiki home or its unsaved generated starting state. |
| `/campaigns/{campaign_id}/archive/items/{item_id}` | Open one canonical Archive item as a wiki page. |
| `/campaigns/{campaign_id}/archive/graph` | Open the immersive built-in Graph workspace. |
| `/campaigns/{campaign_id}/archive/graph/table` | Open the keyboard-friendly accessible Graph table. |
| `/campaigns/{campaign_id}/archive/maps` | Open Maps with the current or first named map selected. |
| `/campaigns/{campaign_id}/archive/maps/{view_id}` | Deep-link to one named map. |
| `/campaigns/{campaign_id}/archive/relationships` | Open Relationships with the current or first named board selected. |
| `/campaigns/{campaign_id}/archive/relationships/{view_id}` | Deep-link to one named relationship board. |

Logical campaign, item, and view UUIDs are route identities. `CampaignDocument.id` is an internal persistence identity and must never appear in a page route or canonical link. Titles and slugs may appear in display URLs later, but a rename must not break a saved route.

### Proposed API seams

The proofs of concept may use fixtures or a thin prototype adapter. A production contract would likely need these campaign-scoped capabilities:

| Capability | Illustrative route |
| --- | --- |
| Read or update the versioned `campaign.md` Archive home | `GET` or `PUT /api/v1/campaigns/{campaign_id}/archive/home` |
| Resolve or search link targets | Existing campaign item search and item routes. |
| Read document links and backlinks | An additive campaign-scoped query over derived `DocumentLink` rows. |
| Read a bounded graph | `GET /api/v1/campaigns/{campaign_id}/archive/graph` |
| List or create views | `GET` or `POST /api/v1/campaigns/{campaign_id}/archive/views` |
| Read, update, or archive a view | `/api/v1/campaigns/{campaign_id}/archive/views/{view_id}` |

The graph query should accept an optional focus page, depth, edge classes, and filters. It must enforce a server-side node and edge limit. All routes must apply campaign authorization before resolving targets or reporting counts. Updating the Archive home must use the current document version so a stale edit cannot overwrite newer `campaign.md` content.

## Shared internal structures

The proofs of concept use a small shared vocabulary. These names describe responsibilities, not a finalized database schema.

### Archive item

The existing canonical note, entity, or session. A view stores its stable item ID and reads its current title, type, status, and other allowed projections when rendering. It never copies the item's body as view state.

### Reference

The existing frontmatter reference is a navigational connection from one Archive item to another. It produces a backlink but does not, by itself, claim that a fictional relationship is true. References remain supported while prototypes determine how they should coexist with inline links.

### Document link

The proposed `DocumentLink` is a generic, rebuildable projection of an inline link from any supported canonical wiki source. Its source may be `campaign.md` or an Archive item, and its target may be the logical campaign page or an Archive item.

A document-link projection should retain enough context to explain the link:

- Campaign ID.
- Logical source type and campaign or item UUID.
- Logical target type and campaign or item UUID.
- Display label or link context when useful.
- Source document version.
- Optional body position or section anchor if it can be captured reliably.

The internal `CampaignDocument.id` may support persistence joins, but it is never the canonical source or target identity exposed in Markdown, routes, or API link payloads. The exact inline syntax remains an open decision. Whatever syntax is selected must use stable logical identity, survive title changes, report unresolved targets, round-trip through source mode, and remain understandable in export.

### Relationship

A meaningful, typed, directional connection between durable subjects. It answers a campaign question such as “who belongs to this faction?” rather than merely “which page links here?”

The source Archive item's Markdown frontmatter owns one canonical entry with a stable relationship UUID, target item UUID, lower-`snake_case` kind, optional forward and inverse labels, and optional notes. The source is implied by the document; the target does not store a reciprocal copy. Incoming relationships and inverse wording on the target page are derived from the projection.

A graph or Relationship view reads these facts through projections. Editing an edge from an incoming panel or board updates the owning source document using its version. Moving a node or removing it from a view must never change or delete the underlying relationship.

### View configuration

A campaign-owned definition for one optional view instance. The proposed minimum shape is:

- Stable view ID and campaign ID.
- View type: `map` or `relationship` for the initial proofs of concept.
- Title and optional Markdown description.
- Schema version.
- Navigation state such as enabled or archived and relative order.
- Type-specific settings.
- Explicit item membership when the view is curated.
- View-specific placements and annotations.

The built-in Wiki and Graph do not need separate view documents for the first proof of concept. `campaign.md` owns the Wiki home and proposed shared navigation configuration. Saving Graph filters or layouts is deferred until there is evidence that a saved Graph is distinct from a curated Relationship view.

### Placement

A presentation-only association between a view and an Archive item. It never becomes the item's canonical fictional location or family relationship.

For a Map proof of concept, a placement contains:

- View ID and item ID.
- Normalized `x` and `y` coordinates between 0 and 1.
- Optional marker label, marker style key, and short view-specific note.

For a Relationship proof of concept, a placement may contain:

- View ID and item ID.
- Optional `x` and `y` layout coordinates.
- Optional collapsed or highlighted presentation state.

Normalized map coordinates keep point placement independent of displayed image size. They do not represent geographic coordinates. Regions, routes, floors, and world coordinates are outside the initial proof of concept.

### Edge projection

The Graph needs one read model that preserves the source and meaning of each edge. A projected edge should include:

- Campaign ID.
- Logical source and target page types and campaign or item UUIDs.
- Edge class, such as `document_link`, `reference`, `relationship`, `entity_reference`, or `session_link`.
- Stable edge identity when the canonical source defines one.
- A kind plus forward and inverse labels when the source defines them.
- Direction and canonical source ownership.
- Source document version.

The projection is rebuilt from canonical documents and existing relationship projections. A one-hop request presents every directly connected component in the campaign edge atlas, including the campaign home when it links to or is linked from an Archive item. Parallel edges are retained in the API even if the interface groups them visually. This prevents a document link, an existing reference, and a semantic relationship between the same pages from being mistaken for one fact.

The first Graph proof of concept includes `document_link`, `reference`, and `relationship` edges by default. Entity-reference template fields and session links should be tested as filters before becoming default edges because they may create noise.

## Persistence alternatives

### Alternative A — SQL-only view records

Store view definitions and placements only in relational tables.

This is straightforward to query and update, but a campaign-authored map or relationship board would not naturally appear in the Markdown workspace or portable export. It would create a second authored-content model unless view state were explicitly limited to disposable personal preferences.

### Alternative B — Embed views in existing documents

Store every optional view definition in `campaign.md` and view membership or placement in each item document.

Shared Wiki navigation already belongs in `campaign.md`, but embedding every map and board there would couple unrelated view edits to the campaign home. Spreading placement across item documents would revise unrelated items, increase conflicts, and require coordinated changes when a view is archived.

### Alternative C — One canonical Markdown document per view

Add a campaign-owned document type for each Map or Relationship view. Its frontmatter stores type-specific configuration, membership, and placement; its body stores optional explanatory prose. PostgreSQL holds the current version, projections, and immutable Markdown versions, while the document volume materializes a readable file such as:

```text
campaigns/{campaign-slug}--{campaign-short-id}/views/{view-slug}--{view-short-id}.md
```

View documents use the same validation, optimistic concurrency, revision, workspace, current-document export/restore, and reconciliation services as other canonical campaign documents. The current restore creates a fresh baseline revision for each imported document; importing exported historical revision files and their metadata remains follow-up work.

### Recommended proposal

Use Alternative C for campaign-owned view instances and Alternative A only for clearly personal, ephemeral interaction preferences.

This model best matches campaign portability and lets an authorized agent understand how a campaign is organized without scraping UI state. It also keeps presentation configuration separate from Archive item facts. ADR 0006 accepts the model, and the PoC implements canonical current view documents with migration, export, restore, and workspace behavior.

The current-document round trip proves that a view can reload, revise, export, and restore without copying Archive content. Full portability acceptance additionally requires restoring exported historical revisions with their original numbers, timestamps, reasons, and content; that is a future completion goal, not current PoC behavior.

## Cross-cutting requirements

### Privacy

- Every view and graph query is campaign-scoped and authorized in the backend.
- An unauthorized item is omitted without exposing its title, edge label, existence, or hidden-edge count.
- View documents are DM-private source content by default.
- Browser logs, server logs, analytics, and errors must not contain campaign prose, relationship notes, view notes, link labels, or search terms.
- A player-visible graph or map cannot be made by filtering a private view at render time. It requires a separate safe publication snapshot with its own review, revision, and revocation lifecycle.
- The Map proof of concept uses a local synthetic image. It must not load third-party tiles or media that could receive campaign URLs or publication tokens.

### Accessibility

- Tabs use standard keyboard navigation, visible focus, clear selected state, and deep links that work without pointer gestures.
- Every graph has a text list or table of nodes and edges with equivalent navigation.
- Every map has a searchable marker list that can open the same pages and expose the same marker notes.
- Relationship views provide an adjacency or grouped-list alternative to the canvas.
- Dragging is never the only way to place or move an item; coordinates or a position action must be keyboard-operable.
- Color, line style, proximity, and hover are not the sole carriers of meaning.
- Reduced-motion preferences disable animated graph rearrangement and nonessential map motion.
- Tablet layouts retain readable page content, usable touch targets, and access to overflowed tabs.

### Performance

- The one-hop view is a bounded edge-atlas overview that includes every directly connected component; two-hop exploration remains focused on the selected page.
- Graph requests declare depth and edge classes and enforce server-side node and edge caps.
- The UI reports truncation and offers filters instead of silently dropping edges.
- PostgreSQL projections and ordinary indexed joins are the first implementation hypothesis. A graph database is considered only after representative evidence shows they are insufficient.
- The Map proof of concept uses image coordinates and point indexes only. It does not need spatial queries or PostGIS.
- Record response, layout, and interaction timings against the representative fixture and identify the device and environment used.

Initial safety limits for testing may be 100 rendered nodes and 250 rendered edges. These are hypotheses to measure, not product limits. A useful proof of concept should render a focused view within one second and keep pan, zoom, focus, and selection responsive on the agreed tablet test device.

## Proofs of concept

Each proof of concept uses the same synthetic campaign and produces evidence, not just a visual demo. A prototype may be a narrow application slice, a disposable route, or an interactive design artifact. It must not introduce production infrastructure without a separate decision.

### PoC 1 — Wiki and backlinks

**Scope**

- Render `campaign.md`, notes, entities, and sessions through one page presentation.
- Use the authored campaign body as the Wiki home and show an unsaved generated starting state while that body is empty.
- Insert a stable link from the campaign home or an item to a logical campaign or item UUID through search or autocomplete.
- Follow the link, show a backlink, and return to the source without losing context.
- Show clear states for an archived or unresolved target.
- Demonstrate that title and slug changes do not change target identity.

**Acceptance**

- A tester authors the campaign home, links it to an item, follows the link, and uses the backlink without copying content.
- An item can link back to the logical campaign page without using `CampaignDocument.id`.
- The link continues to resolve after the target title changes.
- The document-link projection identifies the correct logical source, target, and source version.
- Keyboard-only use completes the workflow at a tablet viewport.
- A cross-campaign target is rejected without revealing whether it exists.
- The test records completion time, navigation errors, and any confusion between a reference and a relationship.

**Out of scope**

- Transclusion, embedded blocks, rich-text editing, folders, and live collaboration.
- Automatic creation of missing pages from free text.
- Player publication of linked page networks.

### PoC 2 — Derived Graph

**Scope**

- Open a built-in Graph centered on the campaign home, the current item, or a bounded campaign overview.
- Derive nodes from the campaign home and Archive items, with edges from document links, existing references, and typed relationships.
- Filter by item type, edge class, and relationship kind.
- Open the canonical item from a node and inspect an edge's class and label.
- Provide an equivalent node-and-edge list.
- Report when the query reaches a node or edge limit.

**Acceptance**

- The rendered graph and list match the expected fixture edge set, including campaign-home links.
- Document-link, reference, and relationship edges between the same pages remain distinguishable.
- Direction and reciprocal wording are understandable without relying only on arrow shape or color.
- Clicking or keyboard-activating a node opens the same item as the Wiki.
- A focused fixture graph renders within the provisional performance budget without a graph database.
- Authorization tests prove that an inaccessible node cannot leak through nodes, edges, counts, labels, or error details.

**Out of scope**

- Editing campaign facts on the graph.
- Saved layouts, saved Graph filters, time travel, claims, knowledge scopes, clustering, or community detection.
- A final force-layout algorithm or visualization library choice.

### PoC 3 — Map view instance

**Scope**

- Create one named Map view from a direct external HTTPS raster image URL with required alt text and an explicit privacy and portability warning.
- Add an existing Archive item as a point marker using normalized coordinates.
- Move and remove the marker without editing or deleting the item.
- Open linked items and use numeric coordinate controls and a marker list. Advanced canvas pan and zoom remain follow-up work.
- Persist canonical view configuration so marker placements survive reloads.

**Acceptance**

- A tester creates or opens the Map view, places three existing items, reloads, and finds the same placements.
- Marker positions remain correct when the image is displayed at different sizes.
- Renaming an item updates the displayed marker title without changing placement identity.
- Removing a marker leaves the Archive item and its relationships unchanged.
- Every marker action has a keyboard-operable path through the marker list or position controls.
- The result uses no PostGIS, external tile service, or duplicate item content.

**Out of scope**

- Image upload and processing, geographic coordinates, regions, routes, distance, travel time, nested levels, fog of war, and location history.
- Player-visible layers or publication.

### PoC 4 — Relationship view instance

**Scope**

- Create one named Relationship view with an explicit curated set of existing items.
- Draw only canonical typed relationships among those items.
- Create one canonical relationship through the shared relationship form, save it in the source item's Markdown, and refresh the board from the resulting projection.
- Add or remove view membership without changing the relationship facts.
- Display a deterministic simple SVG layout. Advanced canvas interaction, Dagre layout, and persisted manual node positions remain follow-up work.
- Open the canonical item from a node and provide an adjacency-list alternative.
- Use a small synthetic family network to test reciprocal labels, cycles, and more than one relationship between two people.

**Acceptance**

- The view shows exactly the selected members and expected canonical relationships among them.
- A relationship edit in the source document is reflected after projection refresh; the view does not retain a stale copied edge.
- A relationship created through the shared form has a stable edge UUID in the source Markdown, appears after refresh, and is available through ordinary relationship navigation outside the board.
- The target item page renders the incoming edge with inverse wording without adding a mirrored relationship to the target Markdown.
- Restoring the source document to an earlier revision restores its outgoing relationship set and refreshes both item pages and the board.
- Removing a member does not remove the item or any relationship.
- Parallel relationship kinds remain inspectable rather than being silently merged.
- Keyboard users can traverse the equivalent adjacency list and open every member page.
- A tester can explain the difference between the automatic Graph and the curated Relationship view after using both.

**Out of scope**

- Inferring ancestors, descendants, marriage validity, household membership, or biological relationships.
- Historical or knowledge-filtered relationships, claim reconciliation, automatic family validation, or relationship editing directly on the canvas.
- Player publication.

## Staged work

| Stage | Work | Dependency | Exit evidence |
| --- | --- | --- | --- |
| 0. Record boundary | Apply accepted ADR 0006: stable UUID links, campaign-owned view documents, and the external HTTPS map exception. | Existing Archive decisions. | Accepted boundary and explicit follow-ups. |
| 1. Build the fixture | Create one deterministic synthetic campaign and expected document-link, reference, relationship, graph, map, and view outcomes. | Stage 0 vocabulary. | Fixture manifest and expected edge tables. |
| 2. Prove Wiki links | Run PoC 1 and validate reference/backlink projections. | Stable item identity and item authoring. | Link, rename, archive, and authorization results. |
| 3. Prove derived Graph | Run PoC 2 from the reference and relationship projections. | Stage 2 reference behavior. | Correctness, accessibility, and timing evidence. |
| 4. Prove view documents | Round-trip the minimum Map and Relationship configuration model or document fixture. | Accepted view persistence decision. | Current-document reload, revision, export, and baseline-restore findings; historical restore gap recorded. |
| 5. Prove optional views | Run PoCs 3 and 4. These may proceed in parallel after Stage 4. | Shared view model and fixture media. | Task tests, accessibility results, and no-copy checks. |
| 6. Decide roadmap fit | Compare evidence with DM attention, retrieval, safety, and portability goals. | All PoC evidence. | Promote, revise, defer, or reject each capability. |

Production dependencies must not be added merely to make a prototype resemble a finished feature. If a disposable prototype needs a library, record why, isolate it from the production dependency graph where practical, and remove it or authorize it through the normal architecture decision before implementation continues.

## Test fixture and evidence

### Synthetic campaign

The shared fixture must contain no real campaign content, personal data, licensed rules text, or secrets. It should include:

- At least 250 Archive items across notes, people, places, factions, things, events, lore, and sessions.
- Repeated and similar titles, aliases, renamed items, archived items, and one intentionally unresolved document link.
- At least 500 document links and existing references, including campaign-home links, cycles, and several pages with many backlinks.
- At least 150 typed relationships, including directional, reciprocal, cyclic, and parallel relationship kinds.
- Entity-reference fields and session links that can be toggled as experimental Graph edge classes.
- One synthetic map image with markers near boundaries and at overlapping coordinates.
- One curated family-style Relationship view and one non-family network.
- A second campaign with sentinel items used only to prove campaign isolation.

The exact size may be generated in layers so interaction testing can compare small, representative, and stress cases.

### Evidence to record

For each proof of concept, record:

- The fixture version and prototype revision.
- The device, viewport, browser, and server environment.
- Task completion time, errors, abandoned attempts, and tester comments.
- API response, graph projection, layout, and first-interaction timings where applicable.
- Keyboard, screen-reader, reduced-motion, touch, and overflow-tab observations.
- Expected versus actual nodes, edges, backlinks, placements, and revisions.
- Authorization and private-data leakage test results.
- What was learned, what remains uncertain, and whether the capability should be promoted, revised, deferred, or rejected.

At least one simulated live-session exercise should ask a DM to move from an unfamiliar clue to its page, connected people, a mapped location, and a focused relationship view while under time pressure. The evidence should focus on attention and retrieval, not visual novelty.

## Risks

| Risk | Response to test |
| --- | --- |
| A large Graph becomes an unreadable hairball. | Default to a focused neighborhood, apply caps, expose filters, and measure whether the list fallback is more useful. |
| Views become duplicate stores of campaign facts. | Store only stable IDs, view membership, layout, and annotations; derive titles, prose, and semantic edges. |
| Link syntax is portable but fragile, or stable but opaque outside DM HQ. | Test stable IDs, human labels, rename behavior, and export rewriting before accepting a syntax. |
| Named views overwhelm navigation. | Keep two core tabs, group named instances under Maps and Relationships selectors, and test campaigns with many views of each type. |
| A hidden item leaks through graph shape or counts. | Authorize before projection output and add negative tests for nodes, edges, labels, and aggregate counts. |
| External map media leaks requests or weakens portability. | Require direct HTTPS URLs and alt text, use a no-referrer browser request, warn that the host receives the request, and mark exports as non-self-contained. |
| View frontmatter grows too large or creates edit conflicts. | Measure representative placement counts and compare a future per-placement document model only if evidence shows a problem. |
| Family diagrams imply facts the model does not contain. | Render only explicit relationships, preserve edge kinds, and avoid inferred genealogy. |
| Canvas interactions exclude keyboard or screen-reader users. | Build and test equivalent lists from the first prototype rather than treating them as later remediation. |
| A visually successful PoC silently changes Release 1 scope. | End with an explicit roadmap decision; do not merge prototype dependencies into production by default. |

## Open questions

ADR 0006 resolved the shared persistence boundary. These remaining questions guide PoC validation and follow-up work.

### Implementation follow-ups

- When do membership and placement query patterns justify dedicated rebuildable projection rows instead of reading canonical view frontmatter?
- When should uploaded or self-contained map assets replace the direct external HTTPS URL exception?
- Which relationship-kind presets need refinement after representative campaign testing?

### To answer with prototypes

- Which edge classes belong in the Graph by default?
- Should the Graph open as a focused neighborhood, a filtered campaign overview, or remember a personal last state?
- Which multiple-view selector or view manager remains usable with many maps or relationship boards?
- Should Relationship view membership remain explicit only, or gain query-driven curation?
- Does an advanced canvas adapter and Dagre layout improve the experience enough to adopt them?
- Is automatic layout sufficient, or is saved manual positioning important enough to persist?
- Which map marker notes belong in view configuration versus the linked Archive item's prose?
- What node, edge, backlink, marker, and tab counts remain useful on the target tablet?
- Do users understand the difference between a reference, a relationship, a Graph, and a curated Relationship view?

### Deferred product questions

- How are saved Graphs different from Relationship view instances?
- How should fictional time, knowledge scopes, claims, and contradictory relationships affect visualizations?
- How are nested maps, regions, routes, travel metadata, and location history represented?
- What player-safe graph or map publication format preserves the separate-publication boundary?
- Which view information must be available offline, and how are conflicting placement edits reconciled?
- When does measured scale justify specialized spatial, graph, or search infrastructure?

## Decision gate

After the proofs of concept, review each capability independently. A capability moves from PoC toward productionization only if evidence shows that it:

- Reduces the DM's time or attention needed to capture, retrieve, or understand campaign knowledge.
- Reuses canonical Archive items and relationships without creating competing facts.
- Preserves campaign authorization and publication safety, and completes the intended revision, export, and restore guarantees, including historical revision reconstruction.
- Works accessibly on desktop and tablet.
- Has a bounded implementation that does not require speculative infrastructure.

ADR 0006 is accepted and the integrated PoC is the implementation increment under validation. Evidence from this gate determines whether each visual capability is productionized, revised, or deferred. Advanced canvas and Dagre layout, persisted manual relationship positions, dedicated membership and placement projections, and a multiple-view selector remain explicit follow-ups rather than implied completed scope.
