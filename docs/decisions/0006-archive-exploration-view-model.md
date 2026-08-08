# ADR 0006: Archive exploration view model

- **Status:** Accepted
- **Date:** 2026-08-07
- **Owners:** Product and Engineering

## Context

The Archive currently presents campaign items as a searchable list. The desired experience is a campaign-authored wiki with several ways to explore the same knowledge:

- a Wiki home page and linked Archive pages;
- an automatic graph of links between pages;
- optional, named maps that place Archive items on an image; and
- optional, named relationship boards for family and other relational knowledge.

[ADR 0005](0005-markdown-canonical-campaign-documents.md) makes complete Markdown documents canonical and SQL indexes rebuildable. The Archive already projects explicit references and typed relationships from item frontmatter. A view model must build on those decisions, keep DM-private content separate from publications, and avoid turning visual layout into another store of campaign facts.

The implementation PoC adopts the boundary below. It is intentionally limited to DM-private exploration; production-scale visualization, player publication, and uploaded media remain out of scope.

## Decision drivers

- Let each campaign deliberately organize its own front page and navigation.
- Keep links stable when titles, slugs, or materialized file paths change.
- Make the same Archive item open from every view without copying its content.
- Keep navigational links, semantic relationships, and view layout distinguishable.
- Make campaign-owned configuration versioned, conflict-checked, exportable, and restorable.
- Keep the first prototypes useful without requiring a graph database, PostGIS, an asset pipeline, or a visualization framework.
- Preserve a separate, deliberate publication boundary for anything players can see.

## Decision

### One Archive shell, several lenses

The Archive will have one route-backed shell that keeps search and quick capture available across its views.

- **Wiki** is always present and is the default view.
- **Graph** is always present and is a derived, read-only explorer.
- **Maps** appears when the campaign creates its first map.
- **Relationships** appears when the campaign creates its first relationship board.

A campaign may have several maps or relationship boards. The top-level tab represents the view type; the accepted interaction uses a selector or view manager inside that tab rather than growing the tab row with every board. The current PoC links each optional tab to its first active view; multiple-view selection is follow-up work.

Tab availability, names, order, and shared navigation are campaign-owned. The last open tab, graph focus, filters, selection, pan, and zoom are personal interface state and are not campaign canon.

### The campaign document is the Wiki front page

The existing canonical `campaign.md` document will supply the Wiki home body and campaign-owned navigation configuration. Archive item documents are the other wiki pages. Until the campaign home has authored content, the interface may show a generated starting state without saving generated prose as campaign content.

The application will expose the campaign document through the same versioned read and write rules used by other canonical documents. A logical campaign or item UUID is the public page identity. `CampaignDocument.id` remains an internal document identity and must not leak into canonical links or page routes.

### Links are not relationships

An internal document link means “this page points to that page.” It creates a backlink, but it does not assert a fictional fact. A relationship means “these campaign subjects are related in this way,” such as `parent_of` or `member_of`. Navigation placement and visual position mean only “show this item here.”

Internal links will use stable logical UUIDs with human-readable labels. Title lookup alone and materialized file paths are not stable enough to identify a target. The canonical Wiki representation is a standard Markdown link with the `dmhq://item/<uuid>` or `dmhq://campaign/<uuid>` application URI.

A new rebuildable `DocumentLink` projection will resolve links from any supported canonical source document, including `campaign.md`, to campaign or Archive-item logical identities. It will retain enough source context to show backlinks and broken-link diagnostics. Existing frontmatter `Reference` rows remain supported while their long-term relationship to inline links is evaluated.

Cross-campaign targets are invalid. A missing or malformed target is rejected, while an archived target remains resolvable and is reported as archived.

### Relationships remain in item Markdown

[ADR 0005](0005-markdown-canonical-campaign-documents.md) standardizes each semantic relationship as one entry in the source Archive item's `relationships` frontmatter. The entry owns a stable relationship UUID, target item UUID, machine-readable kind, optional forward and inverse labels, and optional notes. The containing document implies the source.

The target page does not store a reciprocal copy. Incoming panels, inverse wording, per-page relationship graphs, and campaign graph edges are rebuilt from the relationship projection. Editing an incoming edge or an edge shown on a board updates the owning source document with optimistic concurrency. Restoring a source-document revision restores its outgoing edges and refreshes every derived view.

### Graphs are read models

The default Graph is computed from current relational projections; it is not a canonical document and it does not own edges. Its campaign-scoped read model returns bounded nodes and typed edges. Link/reference edges and semantic relationship edges remain separately filterable and visually distinct.

The first query starts from a focus page and returns a limited one-hop neighborhood. A caller explicitly expands the graph or requests a broader scope. The response states when it was truncated. PostgreSQL and the existing projections are sufficient for the proof of concept; no graph database is introduced.

### Optional views store curation and layout only

Each durable map or relationship board is a campaign-owned `archive_view` Markdown document with its own stable UUID, type, title, revision, and optimistic-concurrency version. The current PoC materializes an `ArchiveView` SQL summary row. Membership and placement remain canonical frontmatter read directly from the document; dedicated rebuildable membership and placement rows are a follow-up optimization rather than an implemented projection.

An `archive_view` document may store:

- a `view_type` of `map` or `relationship`;
- references to existing Archive item UUIDs;
- view-only captions, filters, and presentation settings;
- stable placement IDs and normalized positions; and
- type-specific configuration, such as a relationship root or map background reference.

It must not copy item prose or own semantic relationship edges. A relationship board reads edges projected from canonical relationship entries in Archive-item Markdown. Adding, editing, or deleting a fact from the board updates the owning source document through the shared versioned document mutation. A map pin does not by itself mean that a subject is canonically located at that place.

As an explicit PoC portability exception, a map may use a direct external HTTPS image URL with required alt text. The server never fetches or proxies it. The browser requests it with `referrerPolicy="no-referrer"`; the interface warns that the host still receives the request and that exports retain the URL rather than the image, so they are not self-contained. Uploaded media, geographic coordinates, nested maps, regions, routes, and historical layers remain outside this decision until asset storage and portability are designed.

### Publications remain separate

All Archive exploration views and their read models are DM-private and campaign-authorized. Hiding private nodes or fields in the browser is not a publication mechanism.

A future player-visible wiki, graph, map, or relationship board requires its own versioned publication representation containing only deliberately selected safe content. Internal links become plain text unless the target has a deliberately published player URL. This decision does not add visual publications.

## Document and projection boundary

| Concern | Canonical campaign source | Rebuildable or transient form |
| --- | --- | --- |
| Wiki home and shared navigation | `campaign.md` | Navigation and link projections |
| Wiki page content | Archive item Markdown | Search, link, backlink, and item projections |
| Page-to-page link | Stable logical target encoded in Markdown | `DocumentLink` |
| Fictional or semantic connection | One stable relationship entry in source item frontmatter | `Relationship`, incoming, and graph projections |
| Map or relationship-board curation | `archive_view` Markdown | `ArchiveView` summary row; membership and placement rows follow after the PoC |
| Automatic graph | None | Bounded API read model |
| Personal focus, filters, pan, and zoom | None | URL or local interface state |

## Options considered

### Use an ordinary Archive item as the Wiki home

This would reuse the current item editor and reference model. It would still require campaign configuration to select the item and would leave the existing campaign document without a clear user-facing purpose. Using `campaign.md` gives every campaign a durable front page and allows it to link to items once links are projected at the document level.

### Store every view inside `campaign.md`

This requires fewer document types, but unrelated edits to multiple maps and boards would conflict on one version. Separate view documents keep histories and conflicts scoped while the campaign document only orchestrates navigation and ordering.

### Store view configuration only in SQL or browser storage

This is quick for a prototype but would make campaign-authored maps and boards incomplete in workspace sync, export, restore, and revision history. Temporary browser state is acceptable for disposable interaction tests, not as the durable product model.

### Add graph, GIS, or visualization infrastructure now

The PoC uses bounded neighborhood queries, simple SVG, and normalized image coordinates. Advanced canvas interaction and Dagre layout remain follow-up work until campaign size and interaction evidence justify them.

## Consequences

- Campaign-document editing and generic document-link projection become prerequisites for the complete Wiki and Graph experience.
- Link parsing, backlink generation, and broken-link reporting must cover both the campaign home and item documents.
- A new `archive_view` document type requires validation, materialization, versions, workspace sync, export, restore, reconciliation, API schemas, and authorization before optional views become durable.
- Relationship boards require clearer relationship create, update, and delete behavior; view layout must not bypass it.
- Map upload remains blocked on a separate asset-storage and portability decision. Direct external HTTPS backgrounds are accepted only as the documented PoC exception.
- The Graph endpoint must be bounded and accessible through an equivalent list or table representation.
- Canonical links use the selected `dmhq:` UUID syntax; validation must still confirm that users understand the distinction between links, relationships, and placements.

## Follow-up validation

- Exercise the four PoC slices with a representative synthetic campaign.
- Measure graph readability, keyboard/table fallbacks, map failure states, and revision conflicts.
- Revisit scale limits and asset portability before productionizing visual views.
- Add dedicated membership and placement projections if measured query or rebuild needs justify them.
- Evaluate an advanced canvas adapter and Dagre layout, then add persisted manual relationship-board positions if interaction testing supports them.
- Add a multiple-view selector or view manager for campaigns with several maps or relationship boards.

## References

- [The Archive](../product/archive.md)
- [Archive roadmap](../planning/archive-roadmap.md)
- [Archive exploration views plan](../planning/archive-exploration-views.md)
- [Markdown campaign documents](../architecture/markdown-documents.md)
- [ADR 0002: Archive application architecture](0002-archive-application-architecture.md)
- [ADR 0005: Markdown files as the canonical campaign-content format](0005-markdown-canonical-campaign-documents.md)
