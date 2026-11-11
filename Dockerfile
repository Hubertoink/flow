# Minimum patched Node runtime. The verified fallback covers the delay between
# Node security downloads and official Docker tags. Other architectures fail
# closed until their official base image contains this security release.
FROM node:22-bookworm-slim AS node-security-base
RUN set -eu; \
    if node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"; then exit 0; fi; \
    case "$(uname -m)" in \
      x86_64) archive="node-v22.23.5-linux-x64.tar.gz"; checksum="c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1" ;; \
      aarch64) archive="node-v22.23.5-linux-arm64.tar.gz"; checksum="8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3" ;; \
      *) echo "Patched Node 22.23.5 base image required for this architecture" >&2; exit 1 ;; \
    esac; \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl; \
    curl --fail --location --retry 3 -o /tmp/node-security.tar.gz "https://nodejs.org/dist/v22.23.5/$archive"; \
    echo "$checksum  /tmp/node-security.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/node-security.tar.gz --strip-components=2 -C /usr/local/bin "${archive%.tar.gz}/bin/node"; \
    rm /tmp/node-security.tar.gz; \
    node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"

FROM node-security-base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node-security-base
LABEL org.opencontainers.image.source="https://github.com/Hubertoink/flow"
ENV NODE_ENV=production FLOW_HOST=0.0.0.0 FLOW_PORT=8080
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY scripts/recover-admin.mjs ./scripts/recover-admin.mjs
COPY dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/main.mjs"]
