#!/bin/sh

set -eu

test "${CONFIRM_PREVIEW_RESET:-}" = dmhq-preview || {
  echo "Set CONFIRM_PREVIEW_RESET=dmhq-preview to reset the preview database" >&2
  exit 2
}

ENV_ROOT=/mnt/user/appdata/dm-hq/preview
CONFIG_FILE=/config/environment.env
COMPOSE_FILE=/opt/dmhq/deploy.compose.yaml
CONTAINER_PREFIX=dmhq-preview
SECRETS_FILE=/config/secrets.env
API_IMAGE=${API_IMAGE:-busybox:1.37}
WEB_IMAGE=${WEB_IMAGE:-busybox:1.37}
BUILD_VERSION=reset
BUILD_PR_NUMBER=
export ENV_ROOT CONFIG_FILE COMPOSE_FILE CONTAINER_PREFIX SECRETS_FILE API_IMAGE WEB_IMAGE BUILD_VERSION BUILD_PR_NUMBER

docker compose --project-name "$CONTAINER_PREFIX" --env-file "$CONFIG_FILE" --file "$COMPOSE_FILE" down

stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$ENV_ROOT/resets/postgres-$stamp"
mkdir -p "$ENV_ROOT/resets"
if test -d "$ENV_ROOT/postgres"; then
  mv "$ENV_ROOT/postgres" "$archive"
  echo "Previous preview database moved to $archive"
fi
mkdir -p "$ENV_ROOT/postgres"
echo "Restart dmhq-deployer-preview to create and migrate a clean preview database."
