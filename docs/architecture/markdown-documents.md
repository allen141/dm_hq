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

`CampaignDocument` stores the owner, type, storage key, current version, hash, and derived search text. `CampaignDocumentVersion` stores complete immutable Markdown snapshots. Campaign, archive-item, template-version, and publication-entry rows point to their documents. Alias, tag, reference, relationship, session-link, title, status, and template projections are rebuilt from frontmatter; they are never independent sources of truth.

Writes validate the document type, UUIDs, campaign ownership, required values, template references, typed fields, and link shapes. They normalize frontmatter, sanitize only the body for HTML rendering, create a version, update projections, fsync a temporary file, and atomically rename it. `reconcile_documents` compares the current file and SQL hash and repairs missing or stale files from SQL.

## Export and restore

A Markdown archive contains `manifest.json` for technical format metadata, current `campaign.md`, `items/**/*.md`, `templates/**/*.md`, `publications/**/*.md`, and `revisions/<document-id>/v<n>.md`. No campaign content is stored in `campaign.json`, and bearer publication tokens are excluded. Restore validates every document and reference before rebuilding projections and version history.

## Agent workspace protocol

An authenticated DM agent can request:

- `GET /campaigns/{id}/workspace/snapshot` — all current authorized Markdown files plus a technical manifest and cursor.
- `GET /campaigns/{id}/workspace/changes?after={cursor}` — document IDs, versions, hashes, and operations.
- `POST /campaigns/{id}/workspace/apply` — a complete Markdown document, document ID, and base version.

Apply uses the same parser, validation, projection, version, and atomic-file service as the UI. A stale base version returns a conflict and never overwrites newer server content. A local agent can therefore maintain a fast file cache, edit locally, and reconcile safely without gaining access to another campaign.
