# Contributing

DM HQ is beginning with documentation so product assumptions can be examined before they become expensive implementation choices.

## Propose a documentation change

1. Create a focused branch.
2. Update the relevant Markdown page.
3. Add new pages to `nav` in `mkdocs.yml`.
4. Capture consequential decisions as an ADR.
5. Preview the documentation locally.
6. Run `mkdocs build --strict`.
7. Open a pull request explaining the user problem or decision behind the change.

## Writing conventions

- Write for a reader unfamiliar with the discussion that produced the page.
- Prefer concrete workflows and outcomes over feature names.
- Label uncertain material as a hypothesis, candidate, or open question.
- Use “DM” and “player” consistently with the home page.
- Keep player-visible and DM-private behavior explicit.
- Link to one source of truth instead of copying definitions.

## Decision records

Use an ADR when a choice constrains later work, is costly to reverse, or is likely to invite “why did we do this?” Small editorial choices do not need ADRs.

Copy `docs/decisions/0000-template.md`, use the next number, and add the record to `docs/decisions/index.md`.

## Continuous delivery

Pull requests run a strict MkDocs build. Updates to the `main` branch also publish the generated `site/` artifact through GitHub Pages. Generated output should not be committed.
