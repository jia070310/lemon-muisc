FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

ENV PORT=7983
ENV DOWNLOAD_PATH=/data
ENV CONFIG_PATH=/config
EXPOSE 7983
VOLUME ["/data", "/config"]

CMD ["node", "server/index.js"]
