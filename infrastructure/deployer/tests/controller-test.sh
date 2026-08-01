#!/bin/sh

set -eu

IMAGE=${1:-dmhq-deployer:test}
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)

if docker run --rm --entrypoint /usr/local/bin/dmhq-deploy -e CHANNEL=staging "$IMAGE"; then
  echo "Controller accepted an invalid channel" >&2
  exit 1
fi

if docker run --rm \
  --entrypoint /usr/local/bin/dmhq-deploy \
  -e CHANNEL=preview \
  -v "$ROOT/infrastructure/deployer/production.environment.example:/config/environment.env:ro" \
  "$IMAGE"; then
  echo "Controller accepted production configuration for preview" >&2
  exit 1
fi

docker run --rm \
  --entrypoint /usr/local/bin/dmhq-deploy \
  -e CHANNEL=preview \
  -e RUN_ONCE=1 \
  -e PATH=/test:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -v "$ROOT/infrastructure/deployer/preview.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/tests/fake-docker:/test/docker:ro" \
  "$IMAGE"

docker run --rm \
  --entrypoint sh \
  -v "$ROOT/infrastructure/deployer/preview.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/preview.secrets.example:/config/secrets.env:ro" \
  "$IMAGE" -c '
    set -a
    . /config/environment.env
    set +a
    export API_IMAGE=ghcr.io/allen141/dm-hq-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    export WEB_IMAGE=ghcr.io/allen141/dm-hq-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    export BUILD_VERSION=test BUILD_PR_NUMBER=1
    docker compose --env-file /config/environment.env -f /opt/dmhq/deploy.compose.yaml config --quiet
  '

docker run --rm \
  --entrypoint sh \
  -v "$ROOT/infrastructure/deployer/production.environment.example:/config/environment.env:ro" \
  -v "$ROOT/infrastructure/deployer/production.secrets.example:/config/secrets.env:ro" \
  "$IMAGE" -c '
    set -a
    . /config/environment.env
    set +a
    export API_IMAGE=ghcr.io/allen141/dm-hq-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    export WEB_IMAGE=ghcr.io/allen141/dm-hq-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    export BUILD_VERSION=test BUILD_PR_NUMBER=
    docker compose --env-file /config/environment.env -f /opt/dmhq/deploy.compose.yaml --profile backup config --quiet
  '

echo "Deployment controller policy tests passed"
