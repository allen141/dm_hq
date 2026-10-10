# ADR 0011: Standard session blocks and isolated preview copies

- **Status:** Accepted
- **Date:** 2026-10-09
- **Owners:** DM HQ maintainers

## Context

Long session pages bury information needed during live play. DMs need reusable characters, readable location details, conversation pools, and plot guidance without maintaining separate copies for each layout. Campaign documents already provide revisions, authorization, search, links, and portable exports.

## Decision drivers

- Reduce the attention needed to run a session on desktop or tablet.
- Preserve Markdown as the canonical, recoverable content format.
- Keep DM secrets private and preview writes separate from production.
- Reuse campaign records while keeping session context distinct.

## Options considered

### Independent layout documents and block tables

Separate documents or tables would require synchronization and additional export and revision handling. They could drift as authors switch formats.

### Versioned blocks in canonical Markdown

Typed frontmatter supports both layouts through existing document APIs. It adds validation and rendering without a parallel content store.

## Decision

Use a version 1 `blocks` collection in Archive-item frontmatter. Ship Story, Scene, Character, Conversation encounter, and Challenge blocks. Scene workspace and Compact outline render the same saved definitions. Structured forms and complete Markdown source remain available.

Story conveys goals, stakes, branches, and ordered beats. Scene describes environment, sensations, and ambiance. Characters separate Attacks, Actions, Bonus Actions, Reactions, Special Actions, and Passive Traits. Mechanical character fields use the explicit `dnd_5e_2014` extension; lightweight roleplay fields remain system-neutral.

Scene and Character blocks can reference a concrete block on another item in the same campaign. Context belongs to the referencing page; canonical data belongs to the source. References are one hop. The service resolves them after campaign authorization and reports unavailable definitions explicitly.

Play tracking is device-local, keyed by account, campaign, page, block, and nested entry. It never changes authored definitions or creates shared runtime records. Layout preference is local to the account and device. Drawing dialogue is separate from marking it used or marking evidence revealed.

Preview uses independent database, network, and document storage. An operator can copy production campaign documents into new timestamped preview campaigns owned by an existing preview user. The export transaction is read-only. No users, passwords, sessions, tokens, or publications are copied. Existing preview campaigns and edits remain available. Production DokuWiki is outside this workflow.

## Consequences

Existing pages need no conversion and retain their current reader. New block metadata uses existing optimistic concurrency, revisions, and workspace synchronization. Search includes authored block text; references create backlinks. Restore remaps campaign/item IDs and retains document-scoped block and entry IDs.

No SQL migration is required. Unsupported block versions are rejected on write and must be converted explicitly in a future change. Reverting a document revision restores its authored blocks. Local tracking is disposable and can be reset or undone. Shared play state, player-facing block rendering, and additional ruleset extensions remain future work.

The preview copy is a current-document snapshot with baseline revisions. Original revision archives and UUID mappings are retained privately outside Git for recovery. A future refresh creates another campaign and does not overwrite preview edits.

See [the block contract and implementation plan](../planning/standard-session-blocks.md) and [preview copy operations](../operations/preview-campaigns.md).
