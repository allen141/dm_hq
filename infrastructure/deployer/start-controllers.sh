#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
IMAGE=${DEPLOYER_IMAGE:-dmhq-deployer:local}

docker build \
  --tag "$IMAGE" \
  --file "$ROOT/infrastructure/deployer/Dockerfile" \
  "$ROOT"

# The Unraid host does not require a Compose plugin. The controller image carries
# a pinned Docker CLI and Compose plugin and uses the host daemon through its socket.
docker run --rm \
  --entrypoint docker \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$ROOT:/workspace:ro" \
  --workdir /workspace \
  "$IMAGE" \
  compose \
  --file infrastructure/deployer/controllers.compose.yaml \
  up \
  --detach \
  --no-build
