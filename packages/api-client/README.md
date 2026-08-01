# API client

The web application uses this package for routine access to the Django API.

`openapi.json` is the reviewed API contract. Run `pnpm --filter @dm-hq/api-client generate` after changing it. Generated TypeScript declarations are intentionally ignored; CI regenerates them before testing and building.

The API job exports the live Django Ninja schema and fails when it differs from `openapi.json`. This keeps backend behavior, the reviewed contract, and frontend types synchronized.
