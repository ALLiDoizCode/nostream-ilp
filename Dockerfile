FROM node:22-alpine AS build

WORKDIR /build

# Enable pnpm
RUN corepack enable

COPY ["package.json", "pnpm-lock.yaml", "./"]

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:22-alpine

LABEL org.opencontainers.image.title="Nostream ILP"
LABEL org.opencontainers.image.source=https://github.com/cameri/nostream
LABEL org.opencontainers.image.description="Nostream relay with ILP payment integration and BTP-NIPs"
LABEL org.opencontainers.image.authors="Ricardo Arturo Cabral Mejía"
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

# Install system dependencies including Akash CLI dependencies
RUN apk add --no-cache --update \
    git \
    bash \
    curl \
    jq \
    ca-certificates

# Install Akash CLI
RUN curl -sSfL https://raw.githubusercontent.com/akash-network/node/master/install.sh | sh && \
    mv ./bin/akash /usr/local/bin/akash && \
    chmod +x /usr/local/bin/akash && \
    rm -rf ./bin

# Verify Akash CLI installation
RUN akash version

# Enable pnpm
RUN corepack enable

# Environment variables for BTP-NIPs configuration
ENV BTP_NIPS_ENABLED=true
ENV RELAY_PORT=8008
ENV DASSIE_RPC_URL=ws://dassie:5000/trpc

ADD resources /app/resources

COPY --from=build /build/dist .
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json .
COPY --from=build /build/knexfile.js .
COPY --from=build /build/migrations ./migrations

USER node:node

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.RELAY_PORT || 8008) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "src/index.js"]
