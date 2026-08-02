# ADR 0004: Structured template fields with Markdown extensions

- **Status:** Accepted
- **Date:** 2026-08-02
- **Owners:** Product and Engineering

## Context

The Archive needs to be useful during live play and understandable to automated agents. A page that presents every record as one Markdown textarea forces the DM to remember the schema and makes structured campaign data difficult to search, validate, compare, and interpret. Sessions also had a dedicated Markdown source plus an outcome/scratch textarea whose purposes overlapped.

Templates are the product's contract for structured campaign records. The interface should make that contract visible and easy to complete while preserving an escape hatch for details that do not belong in the template.

## Decision

For every template-backed record, immutable template-version fields are the primary DM entry surface. The web UI renders those fields with their labels, types, choices, and validation behavior. The API stores the values as structured data associated with the item and template version.

The common Markdown body remains available as optional extension prose. It is not a second structured field or a required scratch area. It is used when a DM needs to record context, examples, quotations, or an exceptional detail that the current template does not model. Notes remain Markdown-first because they are intentionally unstructured capture.

Release 1 applies this rule to entities and sessions. The Person/NPC template exposes the manual 2014 5e reference fields. The Session template exposes scheduled date, session status, and outcome as structured fields; the session's Markdown body is labeled as optional additional notes. No derived 5e calculations or character-building behavior is implied.

## Consequences

- DMs can enter common data directly without writing Markdown.
- Agents and future search/indexing processes can read stable field keys and typed values.
- Markdown remains portable and useful for content outside the current schema.
- Template versions must be included in item responses, revisions, exports, and restores.
- New fields are added through a new immutable template version rather than by changing existing records in place.
- A template may still be incomplete during draft capture; canon validation applies to required fields.
- The UI must not reintroduce separate textareas that duplicate a template field's meaning.
