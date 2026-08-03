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
campaigns/{campaign_id}/campaign.md
campaigns/{campaign_id}/items/{item_id}.md
campaigns/{campaign_id}/templates/{template_id}/v{version}.md
campaigns/{campaign_id}/publications/{publication_id}/v{version}/{item_id}.md
```

`CampaignDocument` stores the owner, type, storage key, current version, hash, and derived search text containing body prose plus deliberately searchable metadata (title, aliases, tags, subject type, and field values), never raw frontmatter syntax. `CampaignDocumentVersion` stores complete immutable Markdown snapshots. Campaign, archive-item, template-version, and publication-entry rows point to their documents. Alias, tag, reference, relationship, session-link, title, status, and template projections are rebuilt from frontmatter; they are never independent sources of truth.

Writes validate the document type, UUIDs, campaign ownership, required values, template references, typed fields, canon requirements, and link shapes. Archive item writes also bind frontmatter identity to the server record: on first save the service rewrites `id` and `campaign_id` to match the created item, and on later saves it rejects markdown whose frontmatter `id` does not match the bound archive item. They normalize frontmatter, sanitize only the body for HTML rendering, create a version, update projections, fsync a temporary file, and atomically rename it. `reconcile_documents` compares the current file and SQL hash and repairs missing or stale files from SQL.

## Frontmatter identity

Every archive item document uses one stable UUID in three places: the `ArchiveItem` row, the `id` key in YAML frontmatter, and the `{item_id}` segment of the storage path (`campaigns/{campaign_id}/items/{item_id}.md`). Clients may omit `id` on create or supply a provisional value (for example from quick-capture UI code that drafts markdown before the server assigns an id); the API always rewrites frontmatter to the server-assigned item id before the first version is stored. Updates and workspace apply reject documents whose frontmatter `id` differs from the bound item. API responses always return matching values in the top-level `id` field and `metadata.id`.

## Export and restore

A Markdown archive contains `manifest.json` for technical format metadata, current `campaign.md`, `items/**/*.md`, `templates/**/*.md`, `publications/**/*.md`, and `revisions/<document-id>/v<n>.md`. No campaign content is stored in `campaign.json`, and bearer publication tokens are excluded. Restore validates every document and reference before rebuilding projections and version history.

## Agent workspace protocol

The initial local-agent implementation is documented in the [local agent workspace](agent-workspace.md) page. Authenticated agents use bearer tokens and can request:

- `GET /campaigns/{id}/workspace/snapshot?after={storage_key}&limit={n}` — paged current authorized Markdown files plus a stable technical cursor.
- `GET /campaigns/{id}/workspace/changes?after={cursor}&limit={n}` — paged upsert/delete events, complete Markdown for upserts, versions, and hashes.
- `GET /campaigns/{id}/workspace/documents/{document_id}` — one current authorized document.
- `POST /campaigns/{id}/workspace/apply` — a complete Markdown document, base version, and base hash.

Apply uses the same parser, validation, projection, version, and atomic-file service as the UI. A stale base version or hash returns a conflict and never overwrites newer server content.

## Publication safety

Publication creation treats submitted Markdown as a source for a separate safe document. Only the selected title and Markdown body are retained in the publication entry; private status, aliases, tags, template values, relationships, references, and session links are not player-visible. The player route renders the safe title and body only.
