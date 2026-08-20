FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && apk del python3 make g++
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

ENV PORT=7983
ENV DOWNLOAD_PATH=/music
ENV CONFIG_PATH=/config
EXPOSE 7983
VOLUME ["/music", "/config"]

CMD ["node", "server/index.js"]
