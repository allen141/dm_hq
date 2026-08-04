# Local agent workspace

DM HQ’s first agent integration is a local Markdown workspace. The repository provides a Python `dmhq` CLI, provider-neutral agent guidance, and a campaign-scoped synchronization protocol. The local files and SQLite index are disposable working data; PostgreSQL-backed Markdown versions and current server files remain authoritative.

## Setup

The recommended path uses the repository container launcher. It requires Docker, but does not require Python or pip on the DM's host. The launcher builds a Python 3.13 image, mounts the local data directory, and routes the CLI's API calls through that container:

```text
export PATH="$PWD/tools/dmhq-workspace/bin:$PATH"
dmhq auth setup --base-url https://dm-hq.example
dmhq campaign list
dmhq workspace init --campaign <campaign-id>
cd <workspace-path>
dmhq skills install
dmhq sync
```

On Unraid, the default host data directory is `/mnt/user/appdata/dm-hq/agent-workspaces`. On other hosts it defaults to the platform user-data directory. Set `DMHQ_DATA_ROOT` to override it. Set `DMHQ_IMAGE` to select an image tag or `DMHQ_REBUILD=1` to rebuild after package changes.

The guided setup prompts for the DM HQ URL, username, password, and token name; the password is used only for the session exchange and is never stored. `DMHQ_BASE_URL` and `DMHQ_TOKEN` may be supplied for non-interactive development. Campaign files, credentials, sync state, conflicts, and indexes must not be committed to Git.

A direct Python installation remains available for hosts with Python 3.11 or newer:

```text
python -m pip install -e tools/dmhq-workspace
```

## Local layout

```text
<user-data>/dm-hq/workspaces/<campaign-id>/
  .dmhq/
    config.toml
    state.json
    index.sqlite
    conflicts/<document-id>/
  campaigns/<campaign-slug>--<campaign-short-id>/
    campaign.md
    items/<item-slug>--<item-short-id>.md
    templates/<template-slug>--<template-short-id>/v<n>.md
```

Publication documents are excluded from the default private-DM cache.

## Synchronization

The initial snapshot is paged by storage key and records a change cursor. Each document is stored with its server version and SHA-256 hash. Incremental changes are paged after that cursor and include complete Markdown for upserts and moves, or a delete operation. A move includes the previous storage key so the client can remove the old clean file atomically. The cursor advances only after the local file and index update succeeds.

A local file is clean when its hash matches the recorded server hash. A clean file is replaced by a newer server copy. A dirty file is preserved when the server has not changed. If both copies changed, the CLI writes local and server Markdown plus metadata under `.dmhq/conflicts/` and never overwrites either copy.

Push submits complete Markdown with the base version and hash. The server reuses the normal Markdown parser, validator, projection, version, and atomic-file services. Version or hash mismatches return `409 stale_version`; the CLI fetches the current server copy and creates a conflict artifact.

## Authentication

The web application creates and lists personal bearer tokens through session-authenticated endpoints. The raw token is returned once and stored by the CLI in the operating-system keychain when available, with a protected local fallback for development. A bearer token may access any campaign the user currently belongs to, but every request and local workspace remains bound to one selected campaign. Bearer self-revocation is allowed; arbitrary token management remains a browser-session operation.

## Agent guidance

`skills/dmhq-workspace/SKILL.md` is the provider-neutral skill source. `dmhq skills install` writes a workspace-level `AGENTS.md` and a local skill copy for Codex or another filesystem-capable agent. Agents search local Markdown first, preserve frontmatter and body, cite document IDs and versions, validate before pushing, and stop for conflicts or approval-gated canon/publication actions.

Custom GPT Actions, MCP, embeddings, and hosted DM HQ assistants are adapters for later phases; they are not required for local operation.

To intentionally rename a document, edit its `slug` frontmatter and push, or run `dmhq rename <path> --slug <new-slug>`. Never rename a file alone; the server validates the Markdown slug and remains authoritative.
