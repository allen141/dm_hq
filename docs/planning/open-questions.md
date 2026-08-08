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

- Which readable Markdown syntax should encode a stable inline link to a logical campaign or item UUID?
- How should portable export represent those links, and how should existing frontmatter references coexist with the proposed `DocumentLink` projection?
- How should `campaign.md` store shared Wiki navigation without making ordinary home-page edits difficult to review?
- Which tab names and order are campaign-owned, and which focus, filter, selection, pan, and zoom state remains personal?
- Does durable map and relationship-board curation provide enough value to add canonical `archive_view` documents?
- Which edge classes and bounded query limits make the Graph useful without becoming cluttered?
- What stable asset identity can maps use before attachment storage, export, and restore are designed?
- Is automatic relationship layout sufficient, or should campaign-owned manual placement persist?
- What separate publication representation could make a graph, map, or relationship board player-safe?
- Which list and keyboard alternatives provide equivalent access to every visual exploration task?

Proposed [ADR 0006](../decisions/0006-archive-exploration-view-model.md) defines the boundary to test. The [Archive exploration views plan](archive-exploration-views.md) records the four proofs of concept and the evidence required before that proposal can be accepted or the roadmap changed.

## Technology

- Is reliable offline or local-network use a requirement?
- What scale of content and concurrent users should shape design?
- Is built-in search sufficient initially, or is a dedicated index justified?
- Which attachments and richer publication field allowlists should be added after the Markdown-only Release 1 archive format?

[ADR 0002](../decisions/0002-archive-application-architecture.md) establishes an online-first application using PostgreSQL search and Docker Compose initially. [ADR 0003](../decisions/0003-single-node-container-delivery.md) selects the first deployment target. Representative campaign data is still needed to validate search and storage behavior.

## Product identity

- Is “DM HQ” the intended public name or a working title?
- Which 2014 D&D 5e sources may be referenced, imported, stored, indexed, or redistributed?
- What visual tone supports prolonged use without becoming distracting?
