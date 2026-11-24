# syntax=docker/dockerfile:1
# 柠檬音乐 · 自托管 / 服务器 Docker 镜像（与飞牛原生 FPK 独立）
# builder / prod-deps 在 BUILDPLATFORM 执行，避免 arm64 经 QEMU 跑 npm 触发 Illegal instruction

FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM --platform=$BUILDPLATFORM node:22-alpine AS prod-deps
ARG TARGETARCH
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
# 在宿主机架构上拉取 linux/$TARGETARCH 依赖（含 better-sqlite3 预编译包），不进 QEMU
RUN NODE_ARCH="$TARGETARCH"; \
    if [ "$TARGETARCH" = "amd64" ]; then NODE_ARCH=x64; fi; \
    npm_config_arch="$NODE_ARCH" \
    npm_config_platform=linux \
    npm_config_target_arch="$NODE_ARCH" \
    npm_config_target_platform=linux \
    npm ci --omit=dev \
    && npm cache clean --force

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
# 关于页 QQ：运行时拉 GitHub；镜像内只留 README + 兜底二维码
COPY --from=builder /app/README.md ./README.md
COPY --from=builder /app/public/qq-group-qr.png ./public/qq-group-qr.png

ENV PORT=7983 \
    DOWNLOAD_PATH=/downloads \
    CONFIG_PATH=/config \
    LEMON_EDITION=docker \
    NODE_ENV=production

EXPOSE 7983
VOLUME ["/music", "/downloads", "/config"]

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/index.js"]
