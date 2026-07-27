# Agent guidance for DM HQ

These instructions apply to the entire repository.

## Project phase

DM HQ is in documentation and discovery. Do not introduce application code, frameworks, infrastructure, or persistent data stores unless the task explicitly moves the project into implementation. Prefer decisions that are easy to revise while requirements are still emerging.

## Product principles

- Optimize first for a Dungeon Master's limited attention during live play.
- Keep The Archive, The Dashboard, and The Battlefield connected through shared campaign concepts rather than duplicating data.
- Clearly distinguish private DM information from player-visible content.
- Treat campaign data as valuable, portable, and recoverable.
- Prefer system-neutral language. Ruleset-specific behavior must be an explicit extension or documented product decision.
- Design for desktop and tablet use; do not assume a constant network connection until offline expectations are decided.

## Documentation workflow

- Keep documentation in `docs/` and navigation in `mkdocs.yml`.
- Use short headings, plain language, and relative Markdown links.
- When adding or renaming a page, update `nav` in `mkdocs.yml`.
- Separate confirmed decisions from proposals and open questions.
- Record consequential decisions using `docs/decisions/0000-template.md`.
- Update relevant documentation in the same change as a product decision.
- Run `mkdocs build --strict` before considering documentation work complete.

## Change discipline

- Keep changes scoped to the request and preserve unrelated user work.
- Never commit generated `site/` output.
- Add dependencies only when they provide a clear documented benefit.
- Do not place campaign content, credentials, personal data, or secrets in examples.
- When requirements are ambiguous, document the assumption or open question rather than silently presenting it as settled.

## Future implementation guidance

Once implementation begins:

- Establish an accepted architecture decision before selecting the primary application stack.
- Prefer domain terms defined in `docs/architecture/domain-model.md`.
- Protect authorization boundaries between DM-private and player-visible data at the service/data layer, not only in the UI.
- Add automated tests for behavior introduced by each change.
- Include migrations and rollback considerations for data-model changes.

More specific `AGENTS.md` files may be added to subdirectories later and take precedence for files in their scope.
