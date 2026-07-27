# DM HQ — Implementation Architecture

## Architecture Summary

DM HQ should begin as a **modular monolith deployed as multiple coordinated containers**.

- **Frontend:** React + Next.js + TypeScript
- **Backend:** Python + Django + Django Ninja
- **API:** REST + OpenAPI
- **Database:** PostgreSQL + PostGIS
- **Storage:** S3-compatible object storage
- **Deployment:** Docker Compose locally, Docker Swarm initially in production
- **Graphics:** Tiptap, Sigma.js, React Flow, MapLibre GL JS, deck.gl, and PixiJS where appropriate

```text
Browser
  │
  ▼
Reverse Proxy
  ├── Next.js frontend replicas
  └── Django REST API replicas
          ├── PostgreSQL + PostGIS
          ├── S3-compatible object storage
          ├── Background workers
          └── Scheduler
```

React controls presentation and interaction. Python controls meaning, validation, permissions, history, and persistence.

---

## Core Stack

| Area | Technology |
|---|---|
| Frontend | React + Next.js App Router |
| Frontend language | TypeScript |
| Backend | Django |
| Backend language | Python |
| REST framework | Django Ninja |
| API contract | REST + OpenAPI |
| Validation | Pydantic |
| Database | PostgreSQL |
| Spatial support | PostGIS |
| Database access | Django ORM with targeted raw SQL |
| Server-state management | TanStack Query |
| Local UI state | React state; Zustand where justified |
| Forms | React Hook Form |
| Rich-text editor | Tiptap |
| Knowledge graph | Sigma.js |
| Visual editors | React Flow |
| World maps | MapLibre GL JS + deck.gl |
| Specialized 2D rendering | PixiJS where needed |
| Object storage | S3-compatible interface |
| Python tooling | uv, Ruff, pytest |
| Node tooling | pnpm, Vitest, React Testing Library |
| Browser tests | Playwright |
| Local orchestration | Docker Compose |
| Production orchestration | Docker Swarm initially |

---

## Responsibility Boundary

### React and Node.js

- Routing and layouts
- Interactive editors
- Graph, map, timeline, and canvas rendering
- Drag-and-drop
- Client-side caching
- Optimistic updates
- Form interaction
- Dashboard and Battlefield interfaces
- Accessibility, animation, and keyboard controls
- Visualization state

### Python and Django

- Campaign-domain rules
- Entity and template semantics
- Template composition and validation
- Relationship rules
- Revision creation and change sets
- Temporal world state and retcons
- Permissions and player publishing
- Search indexing
- 5e resource ingestion
- Character-sheet normalization
- Import and export
- Session reconciliation
- Map geometry persistence
- Background jobs and audit history

---

## Backend Structure

The Django backend remains one modular application:

```text
campaigns
archive
entity_types
templates
relationships
revisions
publishing
search
rules_5e
characters
sessions
encounters
maps
media
exports
```

Each module may expose models, domain services, policies, Pydantic schemas, REST routers, query functions, and tests. API handlers should remain thin; business rules belong in reusable Python services.

---

## REST API

```text
/api/v1/
├── campaigns/
├── entities/
├── entity-types/
├── templates/
├── relationships/
├── revisions/
├── change-sets/
├── search/
├── publications/
├── players/
├── characters/
├── rules/5e/
├── sessions/
├── encounters/
├── maps/
└── attachments/
```

Django Ninja generates `openapi.json`. The TypeScript client and request/response types should be generated from that schema.

REST changes should remain compatible with at least one prior frontend release. Prefer additive fields, optional request properties, new endpoints, explicit versioning, and deprecation windows.

---

## Database Design

PostgreSQL is the canonical source of truth and initially handles:

- Relational integrity
- JSONB custom fields
- Typed relationship edges
- Recursive graph traversal
- Full-text search
- Revision history
- Transactions
- Temporal state
- Permission enforcement
- Spatial data through PostGIS

Do not add separate graph or search databases until measured requirements justify them.

### Relational records

```text
Campaign
CampaignMembership
Entity
EntityRevision
EntityType
Template
TemplateVersion
Relationship
RelationshipRevision
ChangeSet
Publication
PublicationRevision
Session
Scene
Encounter
Ruleset
RulesResource
Character
CharacterSnapshot
Map
MapLayer
MapFeature
Attachment
```

### JSONB usage

Use JSONB for template definitions, custom entity fields, Tiptap document trees, imported character payloads, rules resources, provider metadata, and visualization settings.

Keep frequently queried values as normal columns, including campaign, entity type, title, status, visibility, effective dates, current revision, and current location.

---

## Relationships and Graph Data

Relationships are first-class, versioned records with:

- Source and target entities
- Relationship type
- Direction and reciprocal wording
- Notes
- Confidence
- Provenance
- Visibility
- Effective dates
- Current or former state

PostgreSQL remains canonical. Sigma.js renders large graph neighborhoods. React Flow supports smaller authoring tasks such as template composition, story flow, and editable relationship diagrams.

A graph database should only be added later as a derived projection if PostgreSQL traversal performance proves insufficient.

---

## Revision and Temporal Model

Campaign history belongs in PostgreSQL, not Git.

```text
Entity
  id
  current_revision_id

EntityRevision
  id
  entity_id
  previous_revision_id
  recorded_at
  effective_from
  effective_to
  actor_id
  change_set_id
  payload
```

A **change set** groups all revisions caused by one logical action and commits them atomically.

The system tracks two time dimensions:

| Dimension | Meaning |
|---|---|
| Recorded time | When the user entered or changed information |
| World-effective time | When the fact became true in the campaign |

This enables historical views, retcons, planned versus completed events, player-knowledge history, and timelines.

Use immutable snapshots plus change sets initially. Full event sourcing is unnecessary.

---

## Template System

Templates are composable and versioned. Each template separates:

- Data schema
- Presentation schema
- Validation
- Reusable components
- Defaults
- Required and optional fields

Reusable sections may include identity, description, affiliations, relationships, secrets, 5e statistics, inventory, location details, and history.

Every entity revision records the template version used to create it. Updating a template must not silently overwrite existing entities.

---

## 5e Integration

DM HQ is **5e-first but modular underneath**.

Python owns:

- Rules-resource imports
- SRD normalization
- Character-sheet normalization
- Stat-block parsing
- Spell and item indexing
- Ruleset-version distinctions
- Provider adapters
- Validation
- Import and export

```text
Ruleset
  key
  version

RulesResource
  ruleset
  resource_type
  external_key
  name
  data
  source
  license
```

Character integrations use provider adapters:

```python
class CharacterProvider:
    def identify(self, source): ...
    def import_character(self, source): ...
    def refresh(self, external_id): ...
```

Initial providers should include manual entry, JSON import, CSV import, and user-provided stat blocks. Imported data is normalized into a DM HQ-owned snapshot so it remains usable if the external source disappears.

---

## Frontend Graphics

### Tiptap

Store canonical document content as structured JSON. Potential custom nodes include entity mentions, relationship references, secrets, player-visible blocks, read-aloud text, 5e stat blocks, spells, items, characters, maps, scenes, and dice expressions.

### Sigma.js

Use for large graph exploration, relationship filtering, time filtering, player-knowledge filtering, clustering, path highlighting, and contextual subgraphs.

### React Flow

Use for template composition, story-flow diagrams, scene dependencies, conditional narrative paths, and small editable relationship diagrams.

### MapLibre GL JS + deck.gl

Use for world and regional maps, routes, territory, travel history, faction influence, historical states, DM/player layers, and large feature sets.

### PixiJS

Use only for specialized image-coordinate maps such as dungeons, ships, buildings, or token-heavy scenes where MapLibre is awkward.

PostGIS remains the canonical geometry store.

---

## Authentication and Permissions

Expose frontend and backend under one origin:

```text
https://dmhq.example/
  /       → Next.js
  /api/   → Django
```

Use Django users, secure HTTP-only session cookies, CSRF protection, campaign membership, roles, and publication-specific access rules. Do not duplicate authentication in Next.js.

Player requests should preferably query publication records rather than dynamically stripping secrets from private records.

```text
Private Archive record
        │
        ▼
Deliberate publication revision
        │
        ▼
Player-facing API
```

PostgreSQL row-level security may later provide defense in depth.

---

## Container Deployment

Use multiple containers by runtime role while keeping the application modular and monolithic in code.

| Service | Purpose | Initial production replicas |
|---|---|---:|
| `proxy` | TLS and routing | 1 |
| `web` | Next.js frontend | 2 |
| `api` | Django REST API | 2 |
| `worker` | Imports, exports, thumbnails, indexing | 1 |
| `scheduler` | Periodic jobs | 1 |
| `postgres` | PostgreSQL + PostGIS | 1 |
| `object-storage` | Maps, images, handouts, exports | 1 or external |
| `redis` | Queue or cache | Deferred |

The API, worker, and scheduler should share the same Python image with different startup commands.

Do not create separate containers for Archive, relationships, revisions, templates, and publishing.

---

## Orchestration

| Stage | Platform |
|---|---|
| Local development | Docker Compose |
| CI and integration tests | Docker Compose |
| Early personal deployment | Docker Compose |
| Low-interruption single-host production | Docker Swarm |
| Multi-host or larger deployment | k3s or Kubernetes |

Docker Swarm is a good initial production choice because it supports replicas, rolling updates, `start-first` deployment, health monitoring, rollback, service discovery, and secrets.

Kubernetes should be deferred until multi-host placement, advanced storage, autoscaling, or broader infrastructure needs justify it.

---

## Low-Interruption Deployment Requirements

### Stateless application containers

Store campaign data in PostgreSQL, uploads in object storage, sessions in PostgreSQL or shared cache, jobs in a durable queue, secrets outside images, and logs outside local container filesystems.

### Replicas

Run at least two frontend and two API replicas.

### Health endpoints

```text
GET /health/live
GET /health/ready
GET /health/version
```

- `live`: process is responsive
- `ready`: instance can accept traffic
- `version`: build SHA, image version, and schema compatibility

### Graceful shutdown

On `SIGTERM`, stop accepting traffic, finish active requests, release database connections, and exit within the termination window.

### Immutable images

```text
ghcr.io/allen141/dm-hq-api:git-a83fbc1
ghcr.io/allen141/dm-hq-web:git-a83fbc1
```

Keep the previous known-good image available for rollback.

---

## Database Migrations

Rolling deployments temporarily run old and new application versions together. Use an **expand-and-contract** process.

### Expand

- Add nullable columns
- Add new tables
- Add compatible indexes
- Keep old fields working
- Deploy code that understands both representations

### Backfill

- Populate new data
- Validate results
- Monitor behavior

### Switch

- Make the new representation authoritative
- Stop writing the old representation

### Contract

- Remove obsolete fields later
- Tighten constraints after validation
- Remove compatibility code only after rollback is no longer needed

Do not run migrations from every API container startup.

Deployment sequence:

1. Build and publish immutable images.
2. Run tests.
3. Verify database recovery.
4. Run one migration job.
5. Roll API replicas one at a time.
6. Verify readiness and smoke tests.
7. Roll frontend replicas.
8. Roll workers and scheduler.
9. Roll back automatically on failed health checks.

---

## Background Jobs and Realtime Features

Start without Redis or a complex queue where possible. Implement jobs as ordinary Python functions so they can later move behind a worker.

Likely jobs:

- Character imports
- Search reindexing
- Image thumbnails
- PDF processing
- Campaign exports
- Backup validation
- Publication rendering
- Large graph calculations

Add Celery or another durable Python task system when needed. Add WebSockets only when Dashboard or Battlefield requires shared live-session state.

Version queue payloads so old and new workers can overlap safely during deployments.

---

## Repository Layout

```text
dm-hq/
├── apps/
│   ├── web/                         # Next.js / React
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── package.json
│   │
│   └── api/                         # Django / Python
│       ├── manage.py
│       ├── pyproject.toml
│       ├── dm_hq/
│       ├── campaigns/
│       ├── archive/
│       ├── entity_types/
│       ├── templates/
│       ├── relationships/
│       ├── revisions/
│       ├── publishing/
│       ├── search/
│       ├── rules_5e/
│       ├── characters/
│       ├── sessions/
│       ├── encounters/
│       ├── maps/
│       └── media/
│
├── packages/
│   ├── api-client/
│   ├── eslint-config/
│   └── typescript-config/
│
├── infrastructure/
│   ├── compose.yaml
│   ├── swarm-stack.yaml
│   ├── proxy/
│   └── containers/
│
├── docs/
│   ├── architecture/
│   └── adr/
│
├── pnpm-workspace.yaml
├── Makefile
└── README.md
```

Use `uv` and `pyproject.toml` for Python, `pnpm` for TypeScript, Docker Compose for local orchestration, and a Makefile or task runner for shared commands.

---

## Initial Technical Prototype

1. Define and version a Person template.
2. Create an NPC using custom fields and Tiptap content.
3. Connect the NPC to a place and faction.
4. Create and restore immutable revisions.
5. Search with PostgreSQL full-text search.
6. Return a two-hop graph neighborhood over REST.
7. Render the graph with Sigma.js.
8. Place the NPC on a PostGIS-backed map.
9. Publish a player-safe snapshot.
10. Verify the player API cannot retrieve private fields.
11. Import a basic 5e stat block through a Python provider.
12. Deploy a new API image with two replicas using a start-first rolling update.
13. Verify requests continue during deployment.
14. Roll back to the previous image.

---

## Final Direction

> **DM HQ should use a modern React and Next.js interface, a Python and Django domain backend, REST and OpenAPI as the formal boundary, PostgreSQL and PostGIS as the canonical data platform, and a modular-monolith architecture deployed across multiple role-specific containers.**

This provides modern browser graphics, a powerful Python domain layer, strong revision and temporal modeling, safe player publishing, 5e-first integration, and low-interruption deployment without premature microservices.
