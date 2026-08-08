# ADR 0005: Markdown files as the canonical campaign-content format

- **Status:** Accepted
- **Date:** 2026-08-02
- **Updated:** 2026-08-07
- **Owners:** Product and Engineering
- **Supersedes:** [ADR 0004](0004-structured-template-fields.md)

## Context

Campaign knowledge must be portable, inspectable, and easy for a DM or an authorized design assistant to index locally. Keeping template fields, prose, aliases, relationship notes, and publication content in separate JSON columns makes a record harder to round-trip and creates competing sources of truth.

## Decision

Every DM-authored campaign record is one canonical Markdown document. YAML frontmatter carries typed identity, template, metadata, aliases, tags, references, relationships, and session links; the Markdown body carries prose. JSON is accepted as a YAML-subset serialization for deterministic API output, while hand-authored YAML is parsed and normalized.

Each semantic relationship is stored exactly once in the source Archive item's frontmatter. A relationship entry has its own stable UUID, a target Archive-item UUID, a system-neutral `kind`, optional forward and inverse display labels, and optional notes. The source is implied by the containing document. Incoming relationships, inverse wording, per-item relationship panels, backlinks, and graph edges are derived projections; the target document does not contain an automatically mirrored fact.

The current document is materialized as a file under a configurable persistent application volume. PostgreSQL stores document identity, campaign ownership, current version/hash, derived search text and relational projections, plus complete Markdown snapshots for every version. SQL projections are rebuildable and never authoritative. Writes validate and normalize frontmatter, create a full Markdown version, update projections, fsync a temporary file, and atomically rename it. A reconciliation command repairs missing or stale files from SQL.

Template controls are an editing projection over template frontmatter. Publications are independently versioned safe Markdown snapshots. Export archives contain Markdown files, revision Markdown, and a technical JSON manifest; bearer tokens are never exported.

Authorized local agents use the workspace snapshot, changes, and apply endpoints. Apply requires a document ID and base version, uses the same validation/service layer as the UI, and returns a conflict instead of overwriting a newer server version.

## Consequences

- Markdown is the only authored-content payload in item, template, publication, revision, export, restore, and workspace APIs.
- PostgreSQL remains valuable for authorization, filtering, joins, full-text search, synchronization cursors, and historical recovery.
- A durable document volume and SQL backups are both operational requirements; SQL versions can reconstruct the volume.
- Existing records require a one-time conversion migration. Old API shapes and JSON export formats are intentionally removed.
- Frontend form and source modes must edit the same Markdown string.
- A relationship edit versions the source document, and restoring that document restores its outgoing relationship set before rebuilding incoming and graph projections.
- Relationship targets must resolve inside the same campaign. Missing and cross-campaign targets fail validation instead of disappearing silently from projections.

## References

- [Markdown document architecture](../architecture/markdown-documents.md)
- [Archive product](../product/archive.md)
