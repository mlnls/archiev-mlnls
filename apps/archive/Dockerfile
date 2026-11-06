FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/archive ./apps/archive
RUN pnpm install --frozen-lockfile --filter @archiev/archive... --ignore-scripts
RUN pnpm --filter @archiev/archive build

# 서버는 하나의 파일로 묶여 있어 node_modules가 필요 없습니다
FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=4100 TZ=Asia/Seoul ARCHIVE_DATA_DIR=/data ARCHIVE_PUBLIC_DIR=/app/public
WORKDIR /app
COPY --from=build /app/apps/archive/dist/server.js ./server.js
COPY --from=build /app/apps/archive/dist/public ./public
RUN useradd --system --no-create-home app && mkdir -p /data && chown app /data
USER app
VOLUME /data
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
