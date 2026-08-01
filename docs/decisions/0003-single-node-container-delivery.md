# ADR 0003: Single-node container delivery

- **Status:** Accepted
- **Date:** 2026-08-01
- **Owners:** Engineering

## Context

Phase 1 needs a complete review environment for each pull request and an automatic production deployment after merge. DM HQ includes PostgreSQL and will run on the existing Unraid Docker node behind SWAG. The node must not execute arbitrary pull-request code with Docker access.

The repository is stored on GitHub. GitHub Actions can build immutable images and publish them to GitHub Container Registry, but the node is not exposed as a deployment endpoint.

## Decision drivers

- Keep application and deployment behavior reproducible in containers.
- Preserve production and preview data independently.
- Avoid inbound deployment access to the node.
- Prevent pull-request workflows from gaining control of the Docker socket.
- Support health-gated deployment and application rollback on one node.
- Reuse the existing SWAG ingress and GHCR delivery pattern.

## Options considered

### Self-hosted GitHub Actions runner

A runner could execute deployment jobs directly on the node. This gives workflow code broad host access, including code proposed by a pull request, and makes the CI control plane part of the production trust boundary.

### Generic automatic image updater

A tag-watching updater is simple, but it cannot prove that the web and API images form one tested release or coordinate migrations and end-to-end health checks.

### Pull-based DM HQ deployment controller

A fixed controller can poll for a signed release descriptor, validate allowlisted image digests, coordinate the database and application containers, and retain the previous application release.

## Decision

GitHub Actions builds `linux/amd64` web and API images after all checks pass. It publishes an immutable release descriptor containing their digests and signs the descriptor through GitHub's OIDC identity.

Two instances of a fixed DM HQ deployment-controller image poll GHCR:

- `preview` deploys the latest successfully completed same-repository pull request.
- `production` deploys a successfully tested commit on `main`.

The controller verifies repository and workflow provenance, accepts only DM HQ image repositories, and uses a deployment definition embedded in its trusted image. Pull-request content is never mounted or executed on the node.

Preview and production have separate PostgreSQL directories, secrets, networks, cookies, and hostnames. Preview data persists across pull requests and has an explicitly guarded, recoverable reset operation. Production receives daily logical backups retained for 14 days.

SWAG terminates HTTPS at `dmhq.tylerallen.net` and `dmhq-preview.tylerallen.net`. Only the web containers join the ingress network. API and database containers are not published on host ports.

## Consequences

- The controller's Docker-socket mount is root-equivalent access to the node. Its image, release allowlist, provenance checks, and host configuration require security review.
- The latest successful pull-request build replaces the shared preview; this is intentional until parallel preview environments are justified.
- Application rollback does not reverse a completed database migration. Migrations must remain compatible with the previous application release and use expand-and-contract changes when necessary.
- Production has a short replacement interval on deployment because Phase 1 uses one container per role.
- DNS, SWAG certificate coverage, GHCR read credentials, and node secrets require one-time operator setup.
- A cluster scheduler, hosted deployment platform, and one-preview-per-PR infrastructure remain deferred.
