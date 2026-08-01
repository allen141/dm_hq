# Deployment operations

DM HQ uses a shared pull-request preview and a production environment on the Unraid Docker node.

| Environment | URL | Release channel | Persistent directory |
| --- | --- | --- | --- |
| Preview | `https://dmhq-preview.tylerallen.net` | Latest successful same-repository pull request | `/mnt/user/appdata/dm-hq/preview` |
| Production | `https://dmhq.tylerallen.net` | Successful `main` commit | `/mnt/user/appdata/dm-hq/production` |

The [deployment ADR](../decisions/0003-single-node-container-delivery.md) defines the trust and rollback model.

## What GitHub Actions publishes

The application workflow runs backend, frontend, contract, container, and browser checks. A release is published only after all checks pass.

Each release contains immutable API and web image digests plus the commit and pull-request identity. The final release descriptor is signed using the workflow's GitHub OIDC identity. Forked pull requests cannot publish a preview.

The controllers poll the mutable `preview` and `production` channel tags, then resolve and deploy the signed immutable digest. The active commit and preview pull request are available from `/api/v1/health/version`.

## One-time node setup

These steps affect the host and are deliberately not run by GitHub Actions.

### Prepare DNS and SWAG

1. Add DNS records for `dmhq.tylerallen.net` and `dmhq-preview.tylerallen.net` pointing at the SWAG endpoint.
2. Add `dmhq,dmhq-preview` to the SWAG subdomain certificate configuration and restart SWAG to obtain the expanded certificate.
3. Copy the two files under `infrastructure/swag/` into `/mnt/user/appdata/swag/nginx/proxy-confs/`.
4. Connect SWAG to `proxynet` and record that network in its Unraid container template so recreation preserves it.
5. Validate and reload nginx.

```bash
docker network connect proxynet swag
docker exec swag nginx -t
docker exec swag nginx -s reload
```

### Prepare registry authentication

Create a GitHub credential that can only read the DM HQ GHCR packages. Store its Docker configuration outside the repository:

```bash
mkdir -p /mnt/user/appdata/dm-hq/registry
DOCKER_CONFIG=/mnt/user/appdata/dm-hq/registry docker login ghcr.io
chmod -R go-rwx /mnt/user/appdata/dm-hq/registry
```

GitHub Actions publishes with its workflow token. The node credential does not need write access.

### Prepare environment configuration

Create the directories:

```bash
mkdir -p /mnt/user/appdata/dm-hq/deployer/preview
mkdir -p /mnt/user/appdata/dm-hq/deployer/production
mkdir -p /mnt/user/appdata/dm-hq/preview
mkdir -p /mnt/user/appdata/dm-hq/production
```

Copy the environment and secret examples from `infrastructure/deployer/` to these targets:

```text
/mnt/user/appdata/dm-hq/preview/environment.env
/mnt/user/appdata/dm-hq/preview/secrets.env
/mnt/user/appdata/dm-hq/production/environment.env
/mnt/user/appdata/dm-hq/production/secrets.env
```

Replace every placeholder with an independent random value. Preview and production must not share database passwords, Django keys, or account credentials. Restrict the secret files:

```bash
chmod 600 /mnt/user/appdata/dm-hq/preview/secrets.env
chmod 600 /mnt/user/appdata/dm-hq/production/secrets.env
```

Keep the internal and loopback hostnames from the examples in `DJANGO_ALLOWED_HOSTS`; container health checks use them.

The preview seed account is idempotent. Production deliberately has no seed account.

### Start the controllers

From the repository checkout:

```bash
infrastructure/deployer/start-controllers.sh
```

The bootstrap builds the controller and runs its pinned Compose plugin against the host Docker daemon, so the Unraid host does not need a Compose plugin installed. The controllers use `restart: unless-stopped` and resume polling after a Docker or node restart. Re-run the command after controller code changes.

## Review a pull request

1. Wait for the Application workflow to complete.
2. Open `https://dmhq-preview.tylerallen.net`.
3. Sign in with the preview credentials stored on the node.
4. Confirm the active commit and pull-request number through `/api/v1/health/version`.
5. Exercise campaign creation and reload the page to confirm persistence.

When another pull request finishes successfully, it replaces the application containers while retaining the preview database.

## Production ownership

After the first production deployment, create the first owner interactively:

```bash
docker exec -it dmhq-production-api python manage.py createsuperuser
```

No production credentials are present in an image or repository file.

## Observe and recover deployments

Controller state and logs are stored under:

```text
/mnt/user/appdata/dm-hq/deployer/preview
/mnt/user/appdata/dm-hq/deployer/production
```

Useful commands:

```bash
docker logs --tail 100 dmhq-deployer-preview
docker logs --tail 100 dmhq-deployer-production
docker inspect --format '{{.State.Health.Status}}' dmhq-preview-web
docker inspect --format '{{.State.Health.Status}}' dmhq-production-api
```

A failed candidate is recorded and skipped until a different signed release appears. The controller restores the previously healthy application images when candidate startup or health checks fail. It does not reverse database migrations.

## Reset preview data

Reset is guarded and recoverable. The previous PostgreSQL directory is moved under `preview/resets/` rather than deleted.

```bash
docker stop dmhq-deployer-preview
docker run --rm \
  --env CONFIRM_PREVIEW_RESET=dmhq-preview \
  --entrypoint /usr/local/bin/dmhq-reset-preview \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume /mnt/user/appdata/dm-hq:/mnt/user/appdata/dm-hq \
  --volume /mnt/user/appdata/dm-hq/preview/environment.env:/config/environment.env:ro \
  --volume /mnt/user/appdata/dm-hq/preview/secrets.env:/config/secrets.env:ro \
  dmhq-deployer:local
docker start dmhq-deployer-preview
```

Remove an archived reset only after confirming it is no longer needed.

## Back up and restore production

The production backup container creates a plain SQL dump every 24 hours and retains 14 days under `/mnt/user/appdata/dm-hq/production/backups/`.

To validate a backup, restore it into a temporary database or a stopped, empty recovery environment. Never test a restore over the live production database. Record the selected backup, validation result, and application version.

The first Phase 1 operational review must include one successful restore exercise before production contains valuable campaign data.
