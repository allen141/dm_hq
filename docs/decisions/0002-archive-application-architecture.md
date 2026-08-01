# ADR 0002: Archive application architecture

- **Status:** Accepted
- **Date:** 2026-07-31
- **Owners:** Engineering

## Context

The Archive has a first-release product boundary and vertical workflow, but the project has not selected an implementation architecture. Development should establish a foundation that protects campaign privacy, supports progressive structure and revision recovery, and can later serve the Dashboard and Battlefield without building later roadmap infrastructure now.

The temporary implementation-architecture draft proposed a React and Next.js frontend, a Python and Django backend, PostgreSQL with PostGIS, object storage, several visualization libraries, and a multi-container production deployment. Its application boundary is useful, but much of the infrastructure supports features deferred beyond Release 1.

## Decision drivers

- Keep live-play interactions responsive on desktop and tablet browsers.
- Enforce campaign ownership and publication safety in the domain and data layers.
- Keep the frontend and backend contract explicit and testable.
- Support relational integrity, flat custom fields, full-text search, and immutable revisions.
- Preserve one source of truth for later Dashboard and Battlefield views.
- Minimize infrastructure until measured requirements justify it.
- Use supported, well-documented technology lines.

## Options considered

### Django full-stack application

Use Django templates and progressively enhanced server-rendered pages. This has the lowest initial runtime complexity, but the future Dashboard, Battlefield, and visualization-heavy interactions would likely require a separate frontend architecture later.

### Next.js frontend with a Django modular monolith

Use a TypeScript interface and a Python domain backend under one origin, connected through a versioned REST and OpenAPI contract. This adds a second runtime but provides a durable boundary for interactive clients while keeping domain rules and persistence together.

### Independent services from the start

Split Archive capabilities into separately deployed services and specialized stores. This increases operational and consistency costs before the product or scale requires them.

## Decision

Use a modular monolith with separately built web and API processes:

- **Web:** Next.js 16 App Router, React 19.2, TypeScript 5, and Node.js 24 LTS.
- **API:** Python 3.13, Django 5.2 LTS, and Django Ninja with Pydantic schemas.
- **Contract:** versioned REST endpoints with an OpenAPI document that generates the TypeScript API client.
- **Persistence:** PostgreSQL using relational columns for common query and authorization fields, JSONB for flat template definitions and custom values, and built-in full-text search.
- **Authentication:** Django users and secure HTTP-only session cookies, with CSRF protection and campaign membership checks applied by backend policies.
- **Topology:** expose the web and API processes under one origin. Keep domain modules in one Django application and one database.
- **Local environment:** pnpm and uv-managed workspaces orchestrated with Docker Compose.
- **Initial deployment:** one web process, one API process, and PostgreSQL on a single host or equivalent managed services. Select a production host separately before the first deployment.

Release 1 remains online-first. Offline editing, conflict resolution, co-DM realtime collaboration, and player accounts require later decisions.

## Deferred technology

Do not add the following until the linked product capability enters an active release and measured requirements justify it:

- PostGIS and mapping libraries.
- S3-compatible object storage and media-processing workers.
- Redis, Celery, schedulers, or WebSockets.
- Tiptap or another structured rich-text document model.
- Sigma.js, React Flow, MapLibre, deck.gl, or PixiJS.
- A graph database or dedicated search service.
- Docker Swarm, Kubernetes, multiple application replicas, or zero-downtime rollout machinery.

Markdown remains plain source text in Release 1. PostgreSQL remains the canonical graph and search store. Synchronous exports are acceptable until measured size or latency requires background processing.

## Consequences

- Domain rules, authorization, revisions, search indexing, publications, and exports remain testable without the frontend.
- The project accepts two application runtimes and must maintain a generated API client.
- Same-origin session authentication avoids a second identity system but requires deliberate CSRF handling.
- PostgreSQL schema and migration quality become critical to data durability.
- Deferred capabilities must not be preinstalled “for later”; each requires roadmap activation and, where consequential, another ADR.
- Exact patch versions are locked when the application scaffold is created and updated through ordinary dependency maintenance.

## References

- [Archive implementation plan](../planning/archive-implementation-plan.md)
- [Django 5.2 release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/)
- [Django Ninja authentication](https://django-ninja.dev/guides/authentication/)
- [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch-intro.html)
- [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation)
- [React versions](https://react.dev/versions)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Docker Compose in production](https://docs.docker.com/compose/how-tos/production/)
