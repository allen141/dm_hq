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
  - target_id: ...
    kind: works_at
    reciprocal_label: employs
    notes: ...
---

Marra keeps the harbor records...
```

## Storage and projections

Current files live below `DM_HQ_DOCUMENT_ROOT`:

```text
campaigns/{campaign-slug}--{campaign-short-id}/campaign.md
campaigns/{campaign-slug}--{campaign-short-id}/items/{item-slug}--{item-short-id}.md
campaigns/{campaign-slug}--{campaign-short-id}/templates/{template-slug}--{template-short-id}/v{version}.md
campaigns/{campaign-slug}--{campaign-short-id}/publications/publication--{publication-short-id}/v{version}/{item-slug}--{item-short-id}.md
```

`CampaignDocument` stores the owner, type, storage key, current version, hash, and derived search text containing body prose plus deliberately searchable metadata (title, aliases, tags, subject type, and field values), never raw frontmatter syntax. `CampaignDocumentVersion` stores complete immutable Markdown snapshots. Campaign, archive-item, template-version, and publication-entry rows point to their documents. Alias, tag, reference, relationship, session-link, title, status, and template projections are rebuilt from frontmatter; they are never independent sources of truth.

Writes validate the document type, UUIDs, campaign ownership, required values, template references, typed fields, canon requirements, and link shapes. Archive item writes also bind frontmatter identity to the server record: on first save the service rewrites `id` and `campaign_id` to match the created item, and on later saves it rejects markdown whose frontmatter `id` does not match the bound archive item. They normalize frontmatter, sanitize only the body for HTML rendering, create a version, update projections, fsync a temporary file, and atomically rename it. `reconcile_documents` compares the current file and SQL hash and repairs missing or stale files from SQL.

## Frontmatter identity

Every document keeps its authoritative UUID in PostgreSQL and the `id` key in frontmatter. The `slug` key is canonical path metadata: it is normalized to lowercase ASCII kebab-case, bounded to 80 characters, and cannot contain path separators. Display-name edits do not change a path. An explicit slug edit changes the storage key, atomically moves the current file, creates a new version, and emits one workspace `move` event containing both paths. The short UUID suffix prevents collisions between equal names while keeping paths readable.

## Export and restore

A Markdown archive contains `manifest.json` for technical format metadata, current `campaign.md`, `items/**/*.md`, `templates/**/*.md`, `publications/**/*.md`, and `revisions/<document-id>/v<n>.md`. No campaign content is stored in `campaign.json`, and bearer publication tokens are excluded. Restore validates every document and reference before rebuilding projections and version history.

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
