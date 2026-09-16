# Ryder server — distroless-style minimal image, non-root, zero npm deps.
FROM node:24-alpine AS base

# non-root user (defense in depth; see docs/SECURITY.md §7)
RUN addgroup -S ryder && adduser -S ryder -G ryder

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY web ./web
COPY scripts ./scripts

# data dir for SQLite (mount a volume here; StatefulSet in k8s/)
RUN mkdir -p /data && chown -R ryder:ryder /data /app
ENV RYDER_DATA_DIR=/data \
    NODE_ENV=production \
    PORT=4321

USER ryder
EXPOSE 4321

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/ready || exit 1

CMD ["node", "server/index.js"]
