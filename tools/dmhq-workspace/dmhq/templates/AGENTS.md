# DM HQ local campaign workspace

This directory is a synchronized working set, not the source of truth. DM HQ owns the authoritative Markdown documents and versions.

- Search local Markdown before making remote requests.
- Preserve YAML frontmatter and Markdown body.
- Do not invent campaign facts.
- Cite document IDs and versions when explaining campaign information.
- Run `dmhq validate` before `dmhq push`.
- Push complete Markdown documents with their recorded base version and hash.
- Treat conflicts under `.dmhq/conflicts/` as requiring DM review; never overwrite either copy silently.
- Ask for confirmation before canon, relationship, bulk, or publication changes.
- Never access PostgreSQL, server filesystems, credentials, or arbitrary URLs.

- Treat `slug` in frontmatter as canonical path metadata. Title edits do not rename files; use `dmhq rename <path> --slug <new-slug>` or edit the slug explicitly, then validate and push.
- Never rename a local file without changing its frontmatter slug; the server emits a move event and remains authoritative.
