# Markdown campaign documents

DM-authored campaign content is portable Markdown rather than a collection of JSON fields. Each document begins with YAML frontmatter and ends with a Markdown body:

```markdown
---
document_type: archive_item
id: 10f0...
campaign_id: ...
kind: entity
title: Marra Venn
status: canon
subject_type: person
template:
  id: ...
  version: 3
fields:
  species: Human
aliases:
  - The Ferrymaster
tags:
  - harbor
relationships:
  - id: 7d0c...
    target_id: 2c91...
    kind: works_at
    label: works at
    inverse_label: employs
    notes: Marra handles the public ledgers.
---

Marra keeps the harbor records...
```

## Storage and projections

Current files live below `DM_HQ_DOCUMENT_ROOT`:

```text
campaigns/{campaign-slug}--{campaign-short-id}/campaign.md
campaigns/{campaign-slug}--{campaign-short-id}/items/{item-slug}--{item-short-id}.md
campaigns/{campaign-slug}--{campaign-short-id}/views/{view-slug}--{view-short-id}.md
campaigns/{campaign-slug}--{campaign-short-id}/templates/{template-slug}--{template-short-id}/v{version}.md
campaigns/{campaign-slug}--{campaign-short-id}/publications/publication--{publication-short-id}/v{version}/{item-slug}--{item-short-id}.md
```

`CampaignDocument` stores the owner, type, storage key, current version, hash, and derived search text containing body prose plus deliberately searchable metadata (title, aliases, tags, subject type, and field values), never raw frontmatter syntax. `CampaignDocumentVersion` stores complete immutable Markdown snapshots. Campaign, archive-item, Archive-view, template-version, and publication-entry rows point to their documents. An `ArchiveView` row provides the campaign-owned view identity, type, title, status, and link to its canonical document. Alias, tag, reference, relationship, session-link, title, status, and template projections are rebuilt from frontmatter; they are never independent sources of truth.

Writes validate the document type, UUIDs, campaign ownership, required values, template references, typed fields, canon requirements, and link shapes. Archive item writes also bind frontmatter identity to the server record: on first save the service rewrites `id` and `campaign_id` to match the created item, and on later saves it rejects markdown whose frontmatter `id` does not match the bound archive item. They normalize frontmatter, sanitize only the body for HTML rendering, create a version, update projections, fsync a temporary file, and atomically rename it. `reconcile_documents` compares the current file and SQL hash and repairs missing or stale files from SQL.

## Canonical relationships

A semantic relationship is authored once in the `relationships` list of its source Archive item. The containing document implies `source_id`; the entry must not repeat it. The target document does not store a mirrored entry. Its item page, backlinks, relationship panels, and graphs receive the incoming edge from a rebuildable projection.

Each relationship entry uses this shape:

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | Yes | Stable UUID for the relationship edge. It survives wording and layout changes. |
| `target_id` | Yes | Stable UUID of another Archive item in the same campaign. |
| `kind` | Yes | System-neutral machine key in lower `snake_case`, such as `member_of` or `parent_of`. |
| `label` | No | Forward wording shown from the source, such as "member of." The interface humanizes `kind` when omitted. |
| `inverse_label` | No | Wording shown from the target, such as "has member." It changes presentation, not direction or ownership. |
| `notes` | No | Private explanatory Markdown associated with this edge. |

Relationship IDs identify edges; source and target item IDs identify pages. An item may have several different relationship kinds to the same target, but one document must not contain duplicate entries with the same `target_id` and `kind`. `kind` is intentionally ruleset-neutral and campaign-extensible. A future relationship-kind catalog may supply default labels or validation without becoming the source of individual relationship facts.

Saving a source document validates relationship UUIDs, duplicate IDs and pairs, and target campaign membership. A missing or cross-campaign target is a validation error rather than an edge silently omitted from the projection. An archived target remains resolvable and is presented as archived so historical knowledge is not destroyed.

The relationship projection retains the stable relationship ID, campaign ID, logical source and target item IDs, kind, forward and inverse labels, notes, and source document version. Per-item reads return both authored outgoing edges and derived incoming edges. Editing an incoming relationship therefore edits its source document with optimistic concurrency; it never writes a second edge into the target document.

Adding, changing, or removing a relationship creates a new complete revision of the source Markdown document. Restoring that revision restores its outgoing relationship set and rebuilds incoming panels and graph data. Relationship frontmatter remains DM-private and is omitted from player publications unless a later decision introduces a separate, deliberately safe relationship publication.

Existing documents that use `reciprocal_label` require a migration to `inverse_label` before this schema is enforced. The migration must preserve wording, create stable relationship IDs, version the rewritten documents, and rebuild projections.

## Frontmatter identity

Every document keeps its authoritative UUID in PostgreSQL and the `id` key in frontmatter. The `slug` key is canonical path metadata: it is normalized to lowercase ASCII kebab-case, bounded to 80 characters, and cannot contain path separators. Display-name edits do not change a path. An explicit slug edit changes the storage key, atomically moves the current file, creates a new version, and emits one workspace `move` event containing both paths. The short UUID suffix prevents collisions between equal names while keeping paths readable.

## Archive exploration documents

Accepted [ADR 0006](../decisions/0006-archive-exploration-view-model.md) makes the existing `campaign.md` body the Wiki home and stores shared Archive navigation in its frontmatter. Inline links from that campaign document or an Archive item use `dmhq://campaign/<uuid>` or `dmhq://item/<uuid>` targets and produce rebuildable `DocumentLink` rows. Logical campaign or item UUIDs are canonical page identities; internal `CampaignDocument.id` values never appear in canonical link targets or page routes.

The automatic Graph is a bounded transient read model, not a canonical document. Each durable named map or relationship board is a separate `archive_view` Markdown document. An `ArchiveView` SQL row projects its identity, campaign, type, title, status, and document association. Map placements and relationship-board members currently remain structured frontmatter read from the canonical document; separate membership and placement projection tables are not part of the PoC and remain follow-up work.

Map frontmatter may reference a direct external HTTPS background URL and must include alt text. The server never fetches that image. The browser uses `referrerPolicy="no-referrer"`, while the UI warns that the external host still receives the image request and that the URL does not make the export self-contained. Uploaded or bundled campaign map assets require a later storage and portability decision.

## Export and restore

A Markdown archive contains `manifest.json` for technical format and logical-ID/path mappings, current `campaign.md`, `items/**/*.md`, `views/**/*.md`, `templates/**/*.md`, `publications/**/*.md`, and `revisions/<document-id>/v<n>.md`. Internal `dmhq:` links are rewritten to relative Markdown paths for export. The current PoC restore parses current documents before creation, allocates remapped campaign, item, view, edge, member, and placement identities, then rewrites links, navigation, relationships, view membership, and map placements before rebuilding current projections. Each restored document starts a new baseline revision. Although revision files are exported, restore does not yet import those files or reconstruct their original revision numbers, timestamps, reasons, or history; complete historical revision restoration remains follow-up work. External map backgrounds remain URLs and are marked as non-self-contained. No campaign content is stored in `campaign.json`, and bearer publication tokens are excluded.

## Agent workspace protocol

The initial local-agent implementation is documented in the [local agent workspace](agent-workspace.md) page. Authenticated agents use bearer tokens and can request:

- `GET /campaigns/{id}/workspace/snapshot?after={storage_key}&limit={n}` — paged current authorized Markdown files plus a stable technical cursor.
- `GET /campaigns/{id}/workspace/changes?after={cursor}&limit={n}` — paged upsert/move/delete events, complete Markdown for upserts and moves, versions, hashes, and old paths for moves.
- `GET /campaigns/{id}/workspace/documents/{document_id}` — one current authorized document.
- `POST /campaigns/{id}/workspace/apply` — a complete Markdown document, base version, and base hash.

Apply uses the same parser, validation, projection, version, and atomic-file service as the UI. A stale base version or hash returns a conflict and never overwrites newer server content.

## Publication safety

Publication creation treats submitted Markdown as a source for a separate safe document. Only the selected title and Markdown body are retained in the publication entry; private status, aliases, tags, template values, relationships, references, and session links are not player-visible. The player route renders the safe title and body only.

## Forward migration

Migration `0012_slug_based_paths` converts the currently deployed UUID-only database and document volume in place. It derives slugs, adds them to current and historical Markdown frontmatter, rewrites files with atomic materialization, updates storage keys and hashes, and backfills workspace events. It preflights missing files, malformed documents, and path collisions and aborts with a report instead of discarding authored data. Legacy paths and payloads are not supported after the migration.
