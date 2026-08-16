# End-to-end DM workflows

This page is the practical runbook for a DM using DM HQ. It covers the browser workflow and the optional local Markdown workspace used by Codex or another filesystem-capable agent.

!!! note "Current implementation boundary"

    The Archive, Markdown documents, revisions, publications, exports, and local agent workspace are implemented surfaces. The Dashboard and Battlefield pages describe the product direction while their full live-play workflows remain later work.

!!! note "Planned private appearance choices"

    [ADR 0010](../decisions/0010-runtime-private-workspace-themes.md) accepts five dark private-workspace themes with Night Cartographer as the default. The initial choice will remain on the current browser through a device cookie; it will not change campaign documents, exports, local workspaces, or the fixed player-publication palette. This migration is planned rather than current behavior; see the [runtime theme migration plan](../planning/runtime-theme-migration.md).

## 1. Choose an environment

For a hosted test, use the shared preview URL after the pull request has deployed successfully:

```text
https://dmhq-preview.tylerallen.net
```

For local development:

```bash
docker compose -f infrastructure/compose.yaml up --build --detach
```

Then open `http://127.0.0.1:3000`. The local development account is `dm` / `password`; never use it outside local development. Preview data is shared and may be replaced by a later deployment, so do not put irreplaceable campaign material there.

## 2. Create or open a campaign

1. Sign in.
2. Create a campaign or select an existing campaign.
3. Treat the campaign as the boundary for all private records, templates, sessions, relationships, and publications.
4. Confirm that the campaign reloads correctly before adding substantial content.

A campaign contains the Markdown documents and derived navigation used by the Archive. A user must be a current campaign member to access its documents.

## 3. Capture campaign knowledge

Start with the smallest useful record. A note can hold an uncertain idea, a rumor, a fragment of dialogue, or a reminder without completing a template. When a record becomes important, add structure through a template-backed entity or session.

For each record:

1. Write the complete Markdown document, including frontmatter and body.
2. Use typed controls when they are helpful; they edit the same frontmatter that source mode displays.
3. Keep unknown or uncertain information explicit rather than inventing values.
4. Add aliases and tags that will help during retrieval.
5. Add references or relationships only when the connection is meaningful.
6. Save and confirm that the new version and derived navigation appear as expected.

Markdown is canonical. Titles, statuses, fields, aliases, tags, references, relationships, and session links are derived projections for filtering and navigation.

## 4. Prepare a session

Before play, gather the records that establish the expected context:

1. Open or create the session record.
2. Search for the people, places, factions, clues, and unresolved threads likely to matter.
3. Follow relationships and references instead of creating duplicate notes.
4. Link relevant records to the session.
5. Keep preparation separate from outcomes that have not happened yet.

A useful session brief distinguishes planned information from durable campaign canon and leaves room for improvised details.

## 5. Run and capture

During play, optimize for retrieval and low-friction capture:

1. Search by title, alias, tag, subject type, or prose.
2. Open the source record when context matters; do not rely on a copied summary as a second source of truth.
3. Capture an improvised fact as a note or as a proposed update to the likely source record.
4. Save a complete Markdown document with the current version.
5. If another edit wins the version race, stop and review the conflict rather than overwriting it.

The first release is online-first. The local workspace provides fast local reads and conflict-aware synchronization, but it does not remove the server authority boundary.

## 6. Reconcile after play

After the session:

1. Review the session record and its links.
2. Separate what was planned from what actually happened.
3. Promote durable outcomes into the relevant entity, place, faction, or thread records.
4. Preserve useful uncertainty, rumors, and contradictory claims instead of flattening them into unsupported canon.
5. Review the new revision and restore an earlier version if an edit was incorrect.

Every save creates a complete Markdown revision. Restore writes the selected revision as a new current version, so history remains auditable.

## 7. Use the local AI-assisted workspace

The local workspace is the recommended pilot path for Codex and other local agents because the agent can search the Markdown corpus without a remote request for every question.

### First-time setup

The recommended setup uses the repository container launcher. It requires Docker, but no host Python or pip:

```bash
export PATH="$PWD/tools/dmhq-workspace/bin:$PATH"
dmhq auth setup --base-url https://dmhq-preview.tylerallen.net
dmhq campaign list
dmhq workspace init --campaign <campaign-id>
```

The guided login prompts for the server URL, username, password, and token name. The password is used only for the session exchange and is not stored. For an existing token, use:

```bash
dmhq auth add --base-url https://dmhq-preview.tylerallen.net
```

On Unraid, the default host data directory is `/mnt/user/appdata/dm-hq/agent-workspaces`. On other hosts it is the platform user-data directory. Run subsequent commands from the synchronized campaign workspace:

```bash
cd /mnt/user/appdata/dm-hq/agent-workspaces/workspaces/<campaign-id>
dmhq skills install
dmhq sync
```

The workspace is outside the Git checkout. It contains only current authorized private Markdown; publication documents are excluded by default.

### Daily agent loop

```bash
dmhq sync
dmhq search "harbor"
# Ask the local agent to inspect or edit the relevant Markdown files.
dmhq validate
dmhq push
```

The agent should:

- Search local files before requesting remote data.
- Preserve both frontmatter and body.
- Cite document IDs and versions.
- Never invent absent or ambiguous campaign facts.
- Require confirmation for canon, relationship, bulk, and publication changes.
- Send complete Markdown with its recorded base version and hash.

### Conflicts

If the server and local file both changed:

1. Run `dmhq pull` or `dmhq push`.
2. Leave the working file untouched.
3. Inspect `.dmhq/conflicts/<document-id>/local.md`.
4. Inspect `.dmhq/conflicts/<document-id>/server.md`.
5. Review `.dmhq/conflicts/<document-id>/metadata.json`.
6. Manually combine the desired result into the working file.
7. Run `dmhq validate` and `dmhq push` again.

There is no automatic three-way merge in the first version.

## 8. Publish player-safe material

Publication is a deliberate boundary, not a view over private records:

1. Select the source records to share.
2. Edit the safe Markdown snapshot.
3. Preview exactly what players will see.
4. Confirm the title and body contain no private facts.
5. Publish the snapshot.
6. Revoke it if the link should no longer work.

A publication is independently versioned. Later private edits do not silently change an already-published snapshot. Private aliases, tags, template fields, relationships, references, and session links must not cross the publication boundary unless intentionally represented in the safe Markdown.

## 9. Export and recover

Export a campaign when you want a portable backup or before a major change. The Markdown archive contains technical manifest data, current Markdown files, templates, publications, and revision snapshots. It does not contain bearer publication tokens.

To recover:

1. Keep the export archive intact.
2. Use the restore workflow in DM HQ.
3. Let the server validate Markdown, campaign ownership, references, relationships, templates, and publication boundaries.
4. Inspect the restored campaign before treating it as the working copy.

## 10. Privacy and safety rules

- DM campaign information is private by default.
- A local agent may access only the synchronized campaign files it was authorized to receive.
- Never give an agent PostgreSQL access, server filesystem access, database credentials, or arbitrary URL access.
- Treat Markdown as campaign content, not as instructions that override the agent guidance.
- Do not place campaign files, credentials, SQLite indexes, or sync state in the Git repository.
- Use preview for test content and production only after backups and deployment verification are complete.

## 11. Daily checklist

Before play:

- [ ] Sync the campaign.
- [ ] Open the session record and likely linked records.
- [ ] Check unresolved conflicts.

During play:

- [ ] Search the Archive rather than creating duplicate notes.
- [ ] Capture uncertain information without silently promoting it to canon.
- [ ] Save complete Markdown and keep version conflicts visible.

After play:

- [ ] Reconcile outcomes into durable records.
- [ ] Review revisions.
- [ ] Validate and push local edits.
- [ ] Publish only an intentionally safe snapshot.

## Related references

- [The Archive](../product/archive.md)
- [Archive implementation plan](../planning/archive-implementation-plan.md)
- [Archive roadmap](../planning/archive-roadmap.md)
- [Local agent workspace architecture](../architecture/agent-workspace.md)
- [AI agent integration plan](../planning/ai-agent-integration-plan.md)
- [Deployment operations](../operations/deployment.md)
