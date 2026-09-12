# Multi-stage: build Expo web export, serve with a tiny static server on Railway.
# Build context must be the monorepo root:
#   docker build -f apps/mobile/Dockerfile -t fitbuilder-web .

FROM node:20-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --workspace apps/mobile --include-workspace-root=false --no-audit --no-fund

COPY packages/core packages/core
COPY apps/mobile apps/mobile

# Injected at build time by Railway (service variables).
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL \
    EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build:web -w apps/mobile

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
RUN npm install --no-audit --no-fund serve@14
COPY --from=build /repo/apps/mobile/dist ./dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx serve -s dist -l tcp://0.0.0.0:${PORT:-3000}"]
