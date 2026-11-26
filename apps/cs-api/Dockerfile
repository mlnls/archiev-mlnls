# 컴퓨터 기초 책의 계정과 학습 기록 API (cs.<도메인>/api). 의존성 없이 Node 기본 기능만 씁니다.
FROM node:24-slim
ENV NODE_ENV=production PORT=4100 TZ=Asia/Seoul DB_FILE=/data/cs.db
WORKDIR /app
COPY apps/cs-api/src ./src
COPY apps/cs-api/package.json ./package.json
RUN useradd --system --no-create-home app && mkdir -p /data && chown app /data
USER app
VOLUME /data
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
