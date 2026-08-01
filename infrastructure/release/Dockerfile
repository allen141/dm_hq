FROM scratch

ARG CHANNEL
ARG API_IMAGE
ARG WEB_IMAGE
ARG BUILD_VERSION
ARG BUILD_PR_NUMBER

LABEL net.tylerallen.dmhq.channel=$CHANNEL \
      net.tylerallen.dmhq.api=$API_IMAGE \
      net.tylerallen.dmhq.web=$WEB_IMAGE \
      net.tylerallen.dmhq.pr=$BUILD_PR_NUMBER \
      org.opencontainers.image.revision=$BUILD_VERSION
