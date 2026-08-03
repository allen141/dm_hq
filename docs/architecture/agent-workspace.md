# Local agent workspace

DM HQ’s first agent integration is a local Markdown workspace. The repository provides a Python `dmhq` CLI, provider-neutral agent guidance, and a campaign-scoped synchronization protocol. The local files and SQLite index are disposable working data; PostgreSQL-backed Markdown versions and current server files remain authoritative.

## Setup

Create a personal agent token in the DM HQ web application, then run:

```text
python -m pip install -e tools/dmhq-workspace
dmhq auth add --base-url https://dm-hq.example
dmhq workspace init --campaign <campaign-id>
cd <workspace-path>
dmhq skills install
dmhq sync
```

The CLI stores the cache under the platform user-data directory by default. `DMHQ_DATA_ROOT`, `DMHQ_BASE_URL`, `DMHQ_TOKEN`, and `--workspace-root` provide development overrides. Campaign files, credentials, sync state, conflicts, and indexes must not be committed to Git.

## Local layout

```text
<user-data>/dm-hq/workspaces/<campaign-id>/
  .dmhq/
    config.toml
    state.json
    index.sqlite
    conflicts/<document-id>/
  campaigns/<campaign-id>/
    campaign.md
    items/*.md
    templates/**/*.md
```

Publication documents are excluded from the default private-DM cache.

## Synchronization

The initial snapshot is paged by storage key and records a change cursor. Each document is stored with its server version and SHA-256 hash. Incremental changes are paged after that cursor and include complete Markdown for upserts or a delete operation. The cursor advances only after the local file and index update succeeds.

A local file is clean when its hash matches the recorded server hash. A clean file is replaced by a newer server copy. A dirty file is preserved when the server has not changed. If both copies changed, the CLI writes local and server Markdown plus metadata under `.dmhq/conflicts/` and never overwrites either copy.

Push submits complete Markdown with the base version and hash. The server reuses the normal Markdown parser, validator, projection, version, and atomic-file services. Version or hash mismatches return `409 stale_version`; the CLI fetches the current server copy and creates a conflict artifact.

## Authentication

The web application creates and lists personal bearer tokens through session-authenticated endpoints. The raw token is returned once and stored by the CLI in the operating-system keychain when available, with a protected local fallback for development. A bearer token may access any campaign the user currently belongs to, but every request and local workspace remains bound to one selected campaign. Bearer self-revocation is allowed; arbitrary token management remains a browser-session operation.

## Agent guidance

`skills/dmhq-workspace/SKILL.md` is the provider-neutral skill source. `dmhq skills install` writes a workspace-level `AGENTS.md` and a local skill copy for Codex or another filesystem-capable agent. Agents search local Markdown first, preserve frontmatter and body, cite document IDs and versions, validate before pushing, and stop for conflicts or approval-gated canon/publication actions.

Custom GPT Actions, MCP, embeddings, and hosted DM HQ assistants are adapters for later phases; they are not required for local operation.
