FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @archiev/api... --ignore-scripts
RUN pnpm --filter @archiev/api build
# 번들에서 뺀 네이티브 SQLite 드라이버의 버전을 그대로 맞춥니다
RUN node -e "console.log(require('/app/packages/db/node_modules/@libsql/client/package.json').version)" > /tmp/libsql-version

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=4000 TZ=Asia/Seoul DB_FILE=/data/archiev.db UPLOAD_DIR=/data/uploads DB_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /tmp/libsql-version /tmp/libsql-version
RUN npm init -y >/dev/null && npm pkg set type=module >/dev/null && npm install --omit=dev --no-audit --no-fund "@libsql/client@$(cat /tmp/libsql-version)"
COPY --from=build /app/apps/api/dist/server.js ./server.js
COPY --from=build /app/packages/db/drizzle ./migrations
RUN useradd --system --no-create-home app && mkdir -p /data && chown app /data
USER app
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
