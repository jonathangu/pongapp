FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/room-server/package.json apps/room-server/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN pnpm install --frozen-lockfile

COPY apps/room-server apps/room-server
COPY packages/game-core packages/game-core
COPY packages/protocol packages/protocol
RUN pnpm --filter @pongapp/room-server build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache su-exec \
  && mkdir -p /data \
  && chown node:node /data
COPY --from=build /app/apps/room-server/dist/server.cjs ./server.cjs
EXPOSE 8080
CMD ["sh", "-c", "chown node:node /data && exec su-exec node node server.cjs"]
