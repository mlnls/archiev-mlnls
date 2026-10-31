FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/employ ./apps/employ
RUN pnpm install --frozen-lockfile --filter @archiev/employ... --ignore-scripts
RUN pnpm --filter @archiev/employ build

FROM nginx:1.29-alpine
COPY deploy/nginx-static.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's#SPA_FALLBACK#/index.html#' /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/employ/dist/ /usr/share/nginx/html/
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
