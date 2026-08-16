# Open questions

Resolve these through user research, prototypes, or architecture decisions. When one is answered, link the evidence or decision before removing it.

## Audience and scope

- Is the primary user a solo DM, a co-DM team, or both?
- Must the product be self-hostable in its first release?
- What devices and screen sizes are used at the table?

## Workflow

- What information does a DM most often fail to find during play?
- How do DMs distinguish rough ideas, prepared facts, and established canon?
- How much session preparation happens inside versus outside the tool?
- Which combat operations create the most friction?

## Sharing and trust

- Do players need accounts?
- Can players contribute notes, or only read published material?
- What richer preview flow (field selection, redaction, and player feedback) should follow the Release 1 title/body-only safe preview?
- What recovery, audit, and ownership guarantees are expected?

[ADR 0002](../decisions/0002-archive-application-architecture.md) establishes a single campaign owner and unlisted publication links for Release 1. Player accounts, co-DM roles, and contribution workflows remain open for later releases.

## Archive exploration

Accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) settles canonical UUID links, `campaign.md` navigation, durable `archive_view` documents, DM-only visual views, and the direct external HTTPS map-image exception for the PoC. [ADR 0009](../decisions/0009-sigma-relationship-board-renderer.md) settles Sigma networks, rectangular hierarchy trees, deterministic layout, transient automatic state, and equivalent Visual/List relationship experiences. The remaining questions are follow-up validation rather than blockers for those boundaries:

- When do measured query or rebuild costs justify dedicated membership and placement projection tables?
- Is automatic relationship layout sufficient, or should campaign-owned manual positions persist?
- What multiple-view selector or view manager remains usable with many maps or relationship boards?
- When should uploaded or self-contained map assets replace or supplement external URLs?
- What separate publication representation could make a graph, map, or relationship board player-safe?

The [Archive exploration views plan](archive-exploration-views.md) records the PoC slices and evidence required before production-scale visualization work changes the roadmap.

## Technology

- Is reliable offline or local-network use a requirement?
- What scale of content and concurrent users should shape design?
- Is built-in search sufficient initially, or is a dedicated index justified?
- Which attachments and richer publication field allowlists should be added after the Markdown-only Release 1 archive format?

[ADR 0002](../decisions/0002-archive-application-architecture.md) establishes an online-first application using PostgreSQL search and Docker Compose initially. [ADR 0003](../decisions/0003-single-node-container-delivery.md) selects the first deployment target. Representative campaign data is still needed to validate search and storage behavior.

## Product identity

- Is “DM HQ” the intended public name or a working title?
- Which 2014 D&D 5e sources may be referenced, imported, stored, indexed, or redistributed?

[ADR 0010](../decisions/0010-runtime-private-workspace-themes.md) resolves the private-workspace visual direction with five selectable dark themes and Night Cartographer as the default. Prolonged-use testing may refine their tokens, but account synchronization, campaign branding, and player-selectable themes remain deferred rather than open requirements for the initial migration.
