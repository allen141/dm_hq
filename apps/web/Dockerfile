FROM node:24-bookworm-slim AS builder
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}
WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/api-client ./packages/api-client
RUN pnpm --filter @dm-hq/api-client generate \
    && pnpm --dir apps/web build

FROM node:24-bookworm-slim AS runtime
ARG BUILD_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BUILD_VERSION=${BUILD_VERSION}
WORKDIR /app

COPY --from=builder --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
