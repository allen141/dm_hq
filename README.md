# DM HQ

DM HQ is a planned toolkit for Dungeon Masters to build a world, organize campaign knowledge, prepare sessions, and run encounters without losing the thread of the story.

The product has three connected experiences:

- **The Archive** — campaign knowledge, story planning, notes, and player-facing resources.
- **The Dashboard** — a focused command center for running a session.
- **The Battlefield** — encounter setup, initiative, combatants, and combat workflow.

The project is currently in its documentation and discovery phase. Read the [project documentation](docs/index.md) for the vision, initial scope, architecture, and roadmap.

## Work with the documentation locally

Python 3.11 or newer is recommended.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs serve
```

Open <http://127.0.0.1:8000>. To run the same validation used by CI:

```bash
mkdocs build --strict
```

The generated `site/` directory is ignored. GitHub Actions validates pull requests and publishes the `main` branch with GitHub Pages.

## Contributing

Start with the [contribution guide](docs/contributing.md). Important technical or product decisions should be captured under `docs/decisions/`.
