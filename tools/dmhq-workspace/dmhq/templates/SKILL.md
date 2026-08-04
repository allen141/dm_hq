# DM HQ local workspace skill

Use the local Markdown workspace as the campaign working set. Search local Markdown first, preserve complete frontmatter-plus-body documents, cite document IDs and versions, validate before pushing, and send complete Markdown with its base version and hash. Stop on conflicts and present `.dmhq/conflicts/` artifacts for review. Never access PostgreSQL, server filesystems, credentials, or arbitrary URLs.

Use the default human-readable command output when working with the DM; add `--json` when a tool or script needs machine-readable results.

- Treat `slug` in frontmatter as canonical path metadata. Title edits do not rename files; use `dmhq rename <path> --slug <new-slug>` or edit the slug explicitly, then validate and push.
- Never rename a local file without changing its frontmatter slug; the server emits a move event and remains authoritative.
