#!/bin/sh

set -eu

CHANNEL=${CHANNEL:-}
STATE_DIR=${STATE_DIR:-/state}
CONFIG_FILE=${CONFIG_FILE:-/config/environment.env}
COMPOSE_FILE=${COMPOSE_FILE:-/opt/dmhq/deploy.compose.yaml}
POLL_SECONDS=${POLL_SECONDS:-60}
HEALTH_ATTEMPTS=${HEALTH_ATTEMPTS:-45}
RELEASE_REPOSITORY=${RELEASE_REPOSITORY:-ghcr.io/allen141/dm-hq-release}
API_REPOSITORY=${API_REPOSITORY:-ghcr.io/allen141/dm-hq-api}
WEB_REPOSITORY=${WEB_REPOSITORY:-ghcr.io/allen141/dm-hq-web}
OIDC_ISSUER=https://token.actions.githubusercontent.com

case "$CHANNEL" in
  preview)
    IDENTITY_REGEXP='^https://github.com/allen141/dm_hq/.github/workflows/application.yml@refs/pull/[0-9]+/merge$'
    ;;
  production)
    IDENTITY_REGEXP='^https://github.com/allen141/dm_hq/.github/workflows/application.yml@refs/heads/main$'
    ;;
  *) echo "CHANNEL must be preview or production" >&2; exit 2 ;;
esac

test -r "$CONFIG_FILE" || { echo "Missing $CONFIG_FILE" >&2; exit 2; }
set -a
. "$CONFIG_FILE"
set +a

: "${CONTAINER_PREFIX:?CONTAINER_PREFIX is required}"
: "${ENV_ROOT:?ENV_ROOT is required}"
: "${SECRETS_FILE:?SECRETS_FILE is required}"

case "$CHANNEL:$ENV_ROOT:$CONTAINER_PREFIX" in
  preview:/mnt/user/appdata/dm-hq/preview:dmhq-preview) ;;
  production:/mnt/user/appdata/dm-hq/production:dmhq-production) ;;
  *) echo "Configuration does not match the allowlisted environment" >&2; exit 2 ;;
esac

RELEASE_IMAGE="$RELEASE_REPOSITORY:$CHANNEL"
CURRENT_FILE="$STATE_DIR/current-release"
FAILED_FILE="$STATE_DIR/failed-release"
PREVIOUS_FILE="$STATE_DIR/previous-release"
LOCK_DIR="$STATE_DIR/deploy.lock"
LOG_FILE="$STATE_DIR/deploy.log"

mkdir -p "$STATE_DIR" "$ENV_ROOT/postgres" "$ENV_ROOT/backups" "$ENV_ROOT/documents"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" | tee -a "$LOG_FILE"
}

compose() {
  docker compose --project-name "$CONTAINER_PREFIX" --env-file "$CONFIG_FILE" --file "$COMPOSE_FILE" "$@"
}

container_health() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || printf 'missing'
}

wait_for_health() {
  container=$1
  attempt=1
  while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
    status=$(container_health "$container")
    case "$status" in
      healthy) return 0 ;;
      unhealthy|exited|dead|missing) log "$container entered terminal state: $status"; return 1 ;;
    esac
    sleep 2
    attempt=$((attempt + 1))
  done
  log "$container did not become healthy"
  return 1
}

label() {
  docker image inspect --format "{{index .Config.Labels \"$2\"}}" "$1" 2>/dev/null
}

validate_app_image() {
  case "$1" in
    ghcr.io/allen141/dm-hq-api@sha256:*|ghcr.io/allen141/dm-hq-web@sha256:*) return 0 ;;
    *) log "Refusing unmanaged application image: $1"; return 1 ;;
  esac
}

protected_images() {
  candidate_release=${1:-}
  test -n "$candidate_release" && printf '%s\n' "$candidate_release"
  for state_file in \
    /mnt/user/appdata/dm-hq/deployer/preview/current-release \
    /mnt/user/appdata/dm-hq/deployer/preview/previous-release \
    /mnt/user/appdata/dm-hq/deployer/production/current-release \
    /mnt/user/appdata/dm-hq/deployer/production/previous-release; do
    test -r "$state_file" || continue
    sed -n '1,3p' "$state_file"
  done
}

reclaim_image_storage() {
  candidate_release=${1:-}
  protected=$(protected_images "$candidate_release")
  protected_ids=$(printf '%s\n' "$protected" | while IFS= read -r protected_image; do
    test -n "$protected_image" || continue
    docker image inspect --format '{{.Id}}' "$protected_image" 2>/dev/null || true
  done)

  log "Reclaiming stale DM HQ image storage"
  docker image ls --digests --no-trunc --format '{{.Repository}}@{{.Digest}} {{.ID}}' | while IFS= read -r record; do
    image=${record%% *}
    image_id=${record#* }
    case "$image" in
      "$API_REPOSITORY"@sha256:*|"$WEB_REPOSITORY"@sha256:*|"$RELEASE_REPOSITORY"@sha256:*) ;;
      *) continue ;;
    esac
    case "$image_id" in
      sha256:*) ;;
      *) continue ;;
    esac
    if printf '%s\n' "$protected" | grep -Fqx "$image"; then
      continue
    fi
    if printf '%s\n' "$protected_ids" | grep -Fqx "$image_id"; then
      continue
    fi
    docker image rm "$image_id" >/dev/null 2>&1 || true
  done
  log "Stale DM HQ image cleanup completed"
}

rollback() {
  test -r "$CURRENT_FILE" || { log "No previous release is available for rollback"; return 1; }
  previous_api=$(sed -n '2p' "$CURRENT_FILE")
  previous_web=$(sed -n '3p' "$CURRENT_FILE")
  previous_version=$(sed -n '4p' "$CURRENT_FILE")
  previous_pr=$(sed -n '5p' "$CURRENT_FILE")
  validate_app_image "$previous_api" && validate_app_image "$previous_web" || return 1
  log "Restoring application release $previous_version"
  API_IMAGE=$previous_api WEB_IMAGE=$previous_web BUILD_VERSION=$previous_version BUILD_PR_NUMBER=$previous_pr \
    compose up --detach api web
  wait_for_health "$CONTAINER_PREFIX-api" && wait_for_health "$CONTAINER_PREFIX-web"
}

deploy_once() {
  log "Checking $RELEASE_IMAGE"
  if ! docker pull "$RELEASE_IMAGE" >/dev/null; then
    log "Release pull failed; reclaiming image storage before one retry"
    reclaim_image_storage
    if ! docker pull "$RELEASE_IMAGE" >/dev/null; then
      log "Release pull failed after cleanup; current deployment was not changed"
      return 0
    fi
  fi

  release_digest=$(docker image inspect --format '{{index .RepoDigests 0}}' "$RELEASE_IMAGE" 2>/dev/null || true)
  case "$release_digest" in
    "$RELEASE_REPOSITORY"@sha256:*) ;;
    *) log "Release did not resolve to the allowlisted repository"; return 0 ;;
  esac

  if test -r "$CURRENT_FILE" && test "$(sed -n '1p' "$CURRENT_FILE")" = "$release_digest"; then
    return 0
  fi
  if test -r "$FAILED_FILE" && test "$(cat "$FAILED_FILE")" = "$release_digest"; then
    log "Skipping release previously marked unhealthy: $release_digest"
    return 0
  fi

  if ! cosign verify --certificate-identity-regexp "$IDENTITY_REGEXP" --certificate-oidc-issuer "$OIDC_ISSUER" "$release_digest" >/dev/null; then
    log "Release signature or provenance verification failed"
    return 0
  fi

  release_channel=$(label "$RELEASE_IMAGE" net.tylerallen.dmhq.channel)
  api_image=$(label "$RELEASE_IMAGE" net.tylerallen.dmhq.api)
  web_image=$(label "$RELEASE_IMAGE" net.tylerallen.dmhq.web)
  version=$(label "$RELEASE_IMAGE" org.opencontainers.image.revision)
  pr_number=$(label "$RELEASE_IMAGE" net.tylerallen.dmhq.pr)

  test "$release_channel" = "$CHANNEL" || { log "Release channel mismatch"; return 0; }
  validate_app_image "$api_image" && validate_app_image "$web_image" || return 0
  test -n "$version" || { log "Release version is missing"; return 0; }

  reclaim_image_storage "$release_digest"
  if ! docker pull "$api_image" >/dev/null || ! docker pull "$web_image" >/dev/null; then
    log "Application image pull failed"
    return 0
  fi

  export API_IMAGE="$api_image" WEB_IMAGE="$web_image" BUILD_VERSION="$version" BUILD_PR_NUMBER="$pr_number"

  if ! compose up --detach db || ! wait_for_health "$CONTAINER_PREFIX-db"; then
    log "Database is not ready; deployment was not changed"
    return 0
  fi

  if ! compose run --rm --no-deps api python manage.py check --deploy; then
    log "Django deployment checks failed"
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    return 0
  fi
  if ! compose run --rm --no-deps api python manage.py migrate --noinput; then
    log "Database migration failed"
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    return 0
  fi
  if ! compose run --rm --no-deps api python manage.py reconcile_documents; then
    log "Campaign-document reconciliation failed"
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    return 0
  fi
  if test "$CHANNEL" = preview; then
    if ! compose run --rm --no-deps api python manage.py seed_dev_user; then
      log "Preview user bootstrap failed"
      printf '%s\n' "$release_digest" > "$FAILED_FILE"
      return 0
    fi
  fi

  if ! compose up --detach api web; then
    log "Application containers failed to start"
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    rollback || true
    return 0
  fi
  if ! wait_for_health "$CONTAINER_PREFIX-api" || ! wait_for_health "$CONTAINER_PREFIX-web"; then
    docker logs --tail 100 "$CONTAINER_PREFIX-api" 2>&1 | tee -a "$LOG_FILE" || true
    docker logs --tail 100 "$CONTAINER_PREFIX-web" 2>&1 | tee -a "$LOG_FILE" || true
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    rollback || true
    return 0
  fi
  if ! docker exec "$CONTAINER_PREFIX-web" node -e "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
    log "End-to-end health check failed"
    printf '%s\n' "$release_digest" > "$FAILED_FILE"
    rollback || true
    return 0
  fi

  if test "$CHANNEL" = production; then
    compose --profile backup up --detach backup
  fi

  if test -r "$CURRENT_FILE"; then cp "$CURRENT_FILE" "$PREVIOUS_FILE"; fi
  {
    printf '%s\n' "$release_digest"
    printf '%s\n' "$api_image"
    printf '%s\n' "$web_image"
    printf '%s\n' "$version"
    printf '%s\n' "$pr_number"
  } > "$CURRENT_FILE"
  rm -f "$FAILED_FILE"
  log "Deployment succeeded: $version${pr_number:+ (PR $pr_number)}"
  reclaim_image_storage "$release_digest"
}

run_with_lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "Another deployment check holds the lock"
    return 0
  fi
  deploy_once
  result=$?
  rmdir "$LOCK_DIR" 2>/dev/null || true
  return "$result"
}

rmdir "$LOCK_DIR" 2>/dev/null || true
if test "${RUN_ONCE:-0}" = 1; then
  run_with_lock
  exit 0
fi

while true; do
  run_with_lock || true
  sleep "$POLL_SECONDS"
done
