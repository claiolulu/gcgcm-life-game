# 多阶段构建：先编译前端，再打进只装生产依赖的运行镜像
FROM node:22-slim AS web

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN node scripts/make-icons.mjs && npm run build


FROM node:22-slim AS runtime

WORKDIR /app/server
COPY server/package*.json ./

# better-sqlite3 在没有预编译包的平台上需要现场编译。
# 编译工具装完就在同一层里删掉 —— 分层删除是删不掉体积的，
# 留着会让镜像多几百 MB，现场改配置重新部署时白等。
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && npm cache clean --force \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY server/src ./src
COPY --from=web /app/web/dist /app/web/dist

# SQLite 数据目录，部署时必须挂成持久卷，否则重启就丢数据
ENV MLG_DATA_DIR=/data
ENV NODE_ENV=production
ENV PORT=3000
RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
