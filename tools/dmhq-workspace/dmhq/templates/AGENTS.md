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
