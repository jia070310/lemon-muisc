# 柠檬音乐 · 自托管 / 服务器 Docker 镜像（与飞牛原生 FPK 独立）
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ tini
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && apk del python3 make g++
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts

ENV PORT=7983 \
    DOWNLOAD_PATH=/downloads \
    CONFIG_PATH=/config \
    NODE_ENV=production

EXPOSE 7983
VOLUME ["/music", "/downloads", "/config"]

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/index.js"]
