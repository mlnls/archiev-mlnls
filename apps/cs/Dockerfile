# 컴퓨터 기초 로드맵 (cs.<도메인>). 내용으로 정적 HTML을 만들고 nginx로 내보냅니다.
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/cs ./apps/cs
# 본문은 Node 기본 기능만으로 만들고, 메모 편집기(Tiptap)만 esbuild로 묶습니다
RUN pnpm install --frozen-lockfile --filter @archiev/cs --ignore-scripts
RUN node apps/cs/scripts/build.mjs

FROM nginx:1.29-alpine
COPY deploy/nginx-static.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's#SPA_FALLBACK#=404#' /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/cs/dist/ /usr/share/nginx/html/
# 원본은 mlnl.site 기준으로 적고, 이미지를 만들 때 실제 도메인으로 바꿉니다
ARG SITE_DOMAIN=mlnl.site
RUN find /usr/share/nginx/html -type f \( -name "*.html" -o -name "*.txt" -o -name "*.xml" \) \
      -exec sed -i "s#mlnl\.site#${SITE_DOMAIN}#g" {} +
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
