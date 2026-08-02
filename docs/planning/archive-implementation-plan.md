# Archive implementation plan

This plan translates the [Archive roadmap](archive-roadmap.md) into incremental engineering work. It covers Release 1 only and preserves explicit seams for later releases without implementing their infrastructure.

**Status:** Active — Release 1 core implementation in progress. The architecture is recorded in [ADR 0002](../decisions/0002-archive-application-architecture.md).

The `tylera/archive-core` implementation now includes the persistence, API, workspace, publication, revision, session, and export/restore surfaces for Increments 2–6. Release 1 remains open until the complete browser workflow, leakage checks, production restore exercise, and CI review gates are demonstrated.

## Implementation outcome

Release 1 is complete when a DM can perform the documented vertical workflow through a tested application:

1. Create a campaign and Person template.
2. Capture an incomplete NPC.
3. Connect the NPC to a place and faction.
4. Find and reopen the NPC quickly.
5. Link it to a session and reconcile an improvised outcome.
6. Restore an earlier revision.
7. Publish and revoke a player-safe snapshot.
8. Export and restore the campaign without losing supported information.

Development proceeds in vertical increments. Each increment includes persistence, domain rules, API behavior, interface behavior, authorization, and automated tests before the next increment begins.

## Proposed technical foundation

```text
Browser
  |
  v
Same-origin reverse proxy
  |-- Next.js web application
  `-- Django API
        `-- PostgreSQL
```

- Next.js and React own layouts, interaction, keyboard behavior, and client-side view state.
- Django owns campaign rules, authorization, validation, revisions, publication safety, search, and exports.
- REST and OpenAPI form the boundary. The generated TypeScript client is the only routine frontend access path to the API.
- PostgreSQL is the canonical store and initial search engine.
- Docker Compose starts the web, API, and database services locally.

Release 1 does not require PostGIS, object storage, a worker queue, Redis, WebSockets, a rich-text document tree, or visualization libraries.

## Repository shape

The first scaffold should introduce only the structure needed by Release 1:

```text
apps/
  web/                  # Next.js and TypeScript
  api/                  # Django and Python
packages/
  api-client/           # generated from OpenAPI
infrastructure/
  compose.yaml          # local web, API, and PostgreSQL
docs/
```

The Django application begins with a small number of domain modules:

- `accounts`: users, sessions, and authentication integration.
- `campaigns`: campaigns, membership, and campaign access policies.
- `archive`: items, templates, aliases, tags, references, relationships, and search.
- `revisions`: immutable Archive item snapshots and restore operations.
- `publishing`: player-safe snapshots and revocation.
- `exports`: export generation, validation, and restore.

Do not create one deployable service or Django app per future feature. Split a module only when its behavior and ownership are proven to be independent.

## Release 1 data boundaries

The first schema should use a common Archive identity so notes, entities, and sessions can be linked and searched without duplicating shared fields.

| Record | Release 1 responsibility |
| --- | --- |
| User | Authenticated DM identity. |
| Campaign | Top-level ownership and authorization boundary. |
| Campaign membership | Owner membership now; future roles without granting them yet. |
| Archive item | Stable ID, campaign, kind, title, status, timestamps, and common Markdown body. |
| Entity detail | Built-in subject type, template version, and flat custom values. |
| Session detail | Template version, structured planning/status/outcome values, and compatibility projections for the initial session API. |
| Template and version | Immutable field definitions, defaults, and validation rules for the primary DM entry interface. |
| Alias and tag | Searchable labels attached to an Archive item. |
| Reference | Stable link between Archive items that produces a backlink. |
| Relationship | Typed, directional connection between entity items with reciprocal wording and notes. |
| Item revision | Immutable snapshot used for history and restore. |
| Publication | Revocable snapshot containing only deliberately selected player-safe data. |

Use UUIDs for externally visible identifiers. Every campaign-owned row must carry or derive a campaign ID, and every domain query must apply a campaign-access policy before returning data.

Archive items also carry a monotonically increasing version used for optimistic concurrency. Mutations supply the version they read; a stale mutation returns a conflict instead of silently overwriting a newer tab or request.

Release 1 does not hard-delete campaign content through ordinary application actions. Removing an item marks it archived, preserves its revisions and references, and allows restoration. Permanent erasure requires a later retention decision.

### Archive item kinds

Release 1 supports:

- `note`
- `entity`
- `session`

Entity subject types are:

- `person`
- `place`
- `faction`
- `thing`
- `event`
- `lore`

Subject types are fixed values in Release 1. Campaign-defined entity types remain a Release 2 capability.

### Template rules

Release 1 templates are campaign-local and use stable field keys that do not change when labels change. Supported custom field types are:

- short text
- long text
- number
- boolean
- calendar date
- choice
- entity reference

Template versions are immutable after use. Editing a template creates a new version; existing items retain their recorded version and values. Defaults apply only when creating a value. A draft may omit required fields so quick capture remains possible; required-field validation applies when an item moves to canon.

Template fields are the primary DM entry surface for every template-backed entity and session. The web UI renders labels and typed controls from the selected template version, and the API stores those values under stable keys. The shared Markdown body is an optional extension for context or exceptional details that do not belong in the template; it must not be duplicated by a second scratch/outcome editor. Notes remain Markdown-first. The initial Session template defines scheduled date, session status, and outcome.

Choice options and fields use stable keys independent of their labels. Entity-reference values store Archive item IDs and participate in backlink queries. Calendar dates use ISO dates for real-world scheduling; fictional calendars remain text until the temporal model is designed.

The initial Person template includes optional core 2014 D&D 5e reference fields under a ruleset-specific namespace. No derived-stat calculation, character-building rules, or licensed compendium content is included.

### Revision rules

- Every successful item mutation creates a revision in the same database transaction.
- A revision captures the item, subtype data, custom values, aliases, tags, and stable references.
- Restoring a revision creates a new current revision; it never deletes later history.
- Relationship changes are audited but are not included in item restore until relationship revision behavior is designed.
- Revision timestamps record when DM HQ stored the change. Fictional effective time is deferred.

### Publication rules

- A publication copies a safe title, summary, selected fields, and selected prose into an independent snapshot.
- Private source fields, relationships, backlinks, and adjacent records are excluded unless explicitly copied.
- Internal links in selected prose become plain text unless their targets have deliberately published player URLs.
- Publishing a new version does not mutate the source item.
- Revocation disables the player route without deleting publication history.
- Release 1 uses an unlisted, high-entropy publication URL rather than player accounts. Store only a hash of the token.
- Private and publication responses use `Cache-Control: no-store` until revocation-safe caching is designed.
- Player responses set a no-referrer policy and load no third-party resources that could receive the publication URL.
- Proxy and application logs redact the player path. Error reports contain record IDs and operation metadata, not campaign prose, custom values, search queries, or publication tokens.

Player accounts, group knowledge, and per-character knowledge remain Release 2 decisions.

## Initial API surface

All private endpoints require a Django session and campaign access. Mutations require CSRF protection.

```text
/api/v1/campaigns
/api/v1/campaigns/{campaign_id}/items
/api/v1/campaigns/{campaign_id}/search
/api/v1/campaigns/{campaign_id}/templates
/api/v1/campaigns/{campaign_id}/sessions
/api/v1/campaigns/{campaign_id}/publications
/api/v1/campaigns/{campaign_id}/exports
/api/v1/items/{item_id}
/api/v1/items/{item_id}/references
/api/v1/items/{item_id}/relationships
/api/v1/items/{item_id}/revisions
/api/v1/items/{item_id}/restore
/p/{publication_token}
```

API rules:

- Scope nested collection routes to a campaign and verify item ownership on detail routes.
- Use explicit request and response schemas; never serialize ORM models directly.
- Require the current item version on mutations and return a conflict for stale writes.
- Render Markdown through an allowlist sanitizer; do not execute embedded HTML or script.
- Use cursor pagination with a stable ID tie-breaker for item lists and search results.
- Keep generator configuration in source control. Generate OpenAPI and the TypeScript client during development and CI; do not commit generated output in Release 1.
- Treat API version changes as additive during Release 1. Breaking changes require an explicit migration plan once external consumers exist.
- Return stable error codes for validation, authorization, conflict, and not-found behavior.

## Delivery increments

### Increment 0 — Accept the foundation

- Review and accept or revise ADR 0002.
- Confirm the initial single-DM ownership assumption.
- Confirm online-first Release 1 behavior.
- Confirm unlisted publication links as the initial player-delivery mechanism.
- Record the first production-hosting and delivery target in [ADR 0003](../decisions/0003-single-node-container-delivery.md).

**Exit:** the application stack and unresolved product assumptions are recorded as accepted decisions.

### Increment 1 — Walking scaffold

- Create the web, API, generated-client, and Compose workspaces.
- Pin supported dependency versions and lockfiles.
- Add PostgreSQL 18, Django migrations, local environment configuration, and non-secret example settings.
- Implement Django session authentication, CSRF handling, Campaign, and owner membership.
- Add `/health/live`, `/health/ready`, and `/health/version`.
- Use uv, Ruff, pytest, and pytest-django for Python dependency management, formatting, linting, and tests.
- Use pnpm, ESLint, TypeScript checks, Vitest, React Testing Library, and Playwright for the web workspace.
- Establish backend tests, frontend tests, API-schema drift checks, and a browser smoke test in CI.
- Build immutable production containers for the web and API processes.
- Publish signed, matched image releases from GitHub Actions after all checks pass.
- Run persistent pull-based preview and production deployment controllers on the selected node.
- Keep preview and production data, secrets, networks, cookies, and hostnames isolated.
- Provide health-gated deployment, application rollback, preview reset, and production backups.

**Exit:** an authenticated DM can create and reopen an empty campaign through the browser, cross-campaign access is rejected by automated tests, a successful pull request is reviewable in the shared preview, and a tested `main` commit deploys to production.

### Increment 2 — Capture and structure

- Add Archive items for notes and entities.
- Add Markdown authoring, draft/canon state, built-in entity subject types, aliases, and tags.
- Add campaign-local templates, immutable template versions, flat custom values, and canon validation.
- Seed the initial Person template and optional user-entered 2014 5e NPC reference fields.
- Add quick capture and promotion from note to entity while preserving the stable Archive item ID.

**Exit:** a DM can capture an incomplete note, promote it into an NPC, add optional structure, and reopen it without losing prose or identifiers.

### Increment 3 — Connect and find

- Add stable references, backlinks, and simple typed relationships.
- Add PostgreSQL full-text indexing for title and Markdown prose.
- Include aliases and tags in search and filter by subject type.
- Add keyboard-accessible quick-open and relationship navigation.
- Measure search behavior with a representative campaign fixture before adding another search service.

**Exit:** a DM can connect the NPC to a place and faction and retrieve it by title, prose, alias, tag, or relationship navigation.

### Increment 4 — Use and recover

- Add session items and links to relevant Archive items.
- Add the Session template and render its structured planning/status/outcome fields.
- Retain optional Markdown extension prose for details outside the template.
- Promote an improvised outcome into the durable item.
- Create immutable item revisions transactionally.
- Add revision comparison sufficient to understand a restore and implement restore-as-new-revision.

**Exit:** a DM can use the NPC in a session, reconcile a change, and safely restore an earlier item state.

### Increment 5 — Publish safely

- Add publication creation, preview, versioning, correction, and revocation.
- Serve publication snapshots only through the isolated player route.
- Add negative authorization and data-leakage tests covering search, exports, caches, logs, error responses, links, and source-record changes.
- Perform a manual threat-model review before enabling the public route outside development.

**Exit:** a DM can prove what a player will see, publish it, change private source content without leaking it, and revoke access.

### Increment 6 — Export and restore

- Define a versioned export manifest.
- Export supported campaign data as UTF-8 Markdown and structured JSON in a portable archive.
- Include templates, items, custom values, aliases, tags, references, relationships, revisions, and publications.
- Include publication snapshots and status, but never bearer tokens; restored publications receive new tokens only when a DM republishes them.
- Validate archive integrity before download and before restore.
- Restore into a new campaign so validation cannot overwrite the source.
- Document compatibility and migration behavior for each export schema version.

**Exit:** the complete vertical-workflow campaign survives an export and restore with stable internal references and no private data added to player publications.

## Test strategy

Each increment must add tests at the layer that owns the behavior.

### Backend

- Domain tests for templates, state transitions, revisions, restore, publications, and exports.
- UI and API tests verify template fields are primary and Markdown is optional extension prose rather than a duplicate input.
- Policy tests for owner access, unauthenticated access, cross-campaign access, and public access.
- API tests for schemas, status codes, CSRF behavior, filtering, pagination, and error codes.
- Migration tests that build a database from zero and upgrade a previous supported schema.
- Search tests for titles, Markdown prose, aliases, tags, ranking, and campaign isolation.

### Frontend

- Component tests for forms, validation, previews, empty states, and error recovery.
- Keyboard and accessibility tests for capture, quick-open, navigation, and publication preview.
- Contract tests against the generated API client.
- No private campaign data in browser logs or persistent client storage.

### End to end

- One Playwright test grows with the documented vertical workflow.
- Dedicated leakage tests attempt to retrieve private content through every player-facing path.
- Export/restore round-trip tests compare semantic content and stable references, not byte-for-byte archives.
- A tablet-sized viewport is included in the browser test matrix.

## Migration, recovery, and delivery

- Every data-model change includes a forward migration, data validation, and rollback or restore notes.
- Before production use, backups and a tested database-restore procedure are mandatory.
- Use expand-and-contract migrations only when old and new application versions must overlap; do not add compatibility machinery before that deployment model exists.
- Build immutable application images, but begin with a single instance per role.
- Docker Compose is sufficient for local development and an early single-host deployment.
- Add workers, replicas, rolling deployment, or an orchestrator only after measured latency, availability, or scale requires them.

## Later roadmap compatibility

Release 1 preserves these seams without implementing them:

| Future capability | Release 1 preparation |
| --- | --- |
| Rich templates | Stable field keys and immutable template versions. |
| Claims and fictional history | Revisions record storage time without pretending it is world-effective time. |
| Knowledge scopes | Publications are separate from private source content. |
| Graphs and maps | Stable Archive item IDs and canonical relationships. |
| Attachments | Export format is versioned and can add binary manifests later. |
| Character providers | 5e fields are namespaced and user-entered. |
| Offline use | Mutations have stable IDs and explicit revision semantics, but no offline conflict protocol yet. |
| Co-DM collaboration | Campaign membership exists, but only the owner role is granted. |
| Additional rulesets | Shared Archive concepts do not contain mandatory 5e fields. |

## Definition of Release 1 complete

- Every step in the Archive vertical workflow passes in the browser test.
- Authorization is enforced by backend policies, not only hidden controls.
- Publication leakage tests pass.
- Revision restore and export/restore are demonstrated against representative campaign data.
- The strict documentation build, application builds, migrations, tests, and security checks pass in CI.
- No deferred infrastructure or feature is present without a documented need and decision.
