FROM ghcr.io/sigstore/cosign/cosign:v3.1.2 AS cosign

FROM docker:27.5.1-cli

RUN apk add --no-cache curl

COPY --from=cosign /ko-app/cosign /usr/local/bin/cosign
COPY infrastructure/deployer/deploy.sh /usr/local/bin/dmhq-deploy
COPY infrastructure/deployer/reset-preview.sh /usr/local/bin/dmhq-reset-preview
COPY infrastructure/deployer/deploy.compose.yaml /opt/dmhq/deploy.compose.yaml

RUN chmod 0555 /usr/local/bin/dmhq-deploy /usr/local/bin/dmhq-reset-preview /usr/local/bin/cosign \
    && chmod 0444 /opt/dmhq/deploy.compose.yaml

ENTRYPOINT ["/usr/local/bin/dmhq-deploy"]
