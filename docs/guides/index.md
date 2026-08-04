# DM user guide

This section describes how a Dungeon Master uses DM HQ from first campaign setup through session play, local AI-assisted editing, publication, and recovery. It is the practical companion to the product, architecture, and planning documents.

## Start here

- [End-to-end DM workflows](dm-user-workflows.md) — the complete daily and campaign lifecycle.
- [Local agent workspace](../architecture/agent-workspace.md) — detailed CLI setup and synchronization behavior.
- [The Archive](../product/archive.md) — product concepts and the intended Archive experience.

## The DM loop

DM HQ is organized around a repeating loop:

1. Capture what you know, suspect, or improvise.
2. Organize it when structure will make it easier to find.
3. Prepare the next session from connected campaign records.
4. Run the session while keeping retrieval and capture fast.
5. Reconcile what happened into durable campaign knowledge.
6. Publish only the information intended for players.
7. Preserve revisions and export the campaign so it remains recoverable.

The local Markdown workspace adds an optional design-assistant loop: synchronize an authorized campaign, search and edit files locally, validate changes, and push complete documents back through the server.

## Environment notes

The shared preview environment is useful for testing but contains shared, disposable test data. Use production only for real campaign data after deployment and backup procedures have been verified. The local agent workspace keeps its cache outside the Git checkout by default.
