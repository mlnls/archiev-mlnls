FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/blog ./apps/blog
RUN pnpm install --frozen-lockfile --filter @archiev/blog... --ignore-scripts
RUN pnpm --filter @archiev/blog build

FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Seoul
WORKDIR /app
RUN useradd --system --no-create-home app
COPY --from=build /app/apps/blog/.next/standalone ./
COPY --from=build /app/apps/blog/.next/static ./apps/blog/.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/blog/server.js"]
