# DM HQ

DM HQ is a planned toolkit for Dungeon Masters to build a world, organize campaign knowledge, prepare sessions, and run encounters without losing the thread of the story.

The product has three connected experiences:

- **The Archive** — campaign knowledge, story planning, notes, and player-facing resources.
- **The Dashboard** — a focused command center for running a session.
- **The Battlefield** — encounter setup, initiative, combatants, and combat workflow.

The project is transitioning from discovery into the first Archive implementation increment. Read the [project documentation](docs/index.md) for the vision, scope, architecture, and roadmap.

## Run the first Archive scaffold

The implementation uses Node.js 24, Python 3.13, Django, Next.js, and PostgreSQL. The reproducible local path uses Docker:

```bash
docker compose -f infrastructure/compose.yaml up --build
```

Open <http://127.0.0.1:3000> and sign in with the development-only account `dm` / `password`. Do not use that account outside local development.

The API is available at <http://127.0.0.1:8000/api/v1/health/live>; interactive OpenAPI documentation is available at <http://127.0.0.1:8000/api/v1/docs>.

## Hosted environments

Successful same-repository pull requests publish a signed container release for the shared preview at <https://dmhq-preview.tylerallen.net>. A tested merge to `main` publishes the production release for <https://dmhq.tylerallen.net>.

The node pulls releases from GHCR; GitHub Actions does not receive access to the Docker host. See the [deployment operations guide](docs/operations/deployment.md) for bootstrap, review, recovery, reset, and backup procedures.

## Local agent workspace

The repository includes a local Markdown cache and sync CLI for Codex and other filesystem-capable agents. See the [local agent workspace guide](docs/architecture/agent-workspace.md).

```text
python -m pip install -e tools/dmhq-workspace
dmhq auth add --base-url http://127.0.0.1:8000
dmhq workspace init --campaign <campaign-id>
cd <workspace-path>
dmhq sync
```

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
