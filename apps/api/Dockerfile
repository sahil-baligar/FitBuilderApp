# FitBuilder API - build from the monorepo root so the npm workspace symlink
# to @fitbuilder/core resolves. Build context must be the repo root:
#   docker build -f apps/api/Dockerfile -t fitbuilder-api .

# ---------- build ----------
FROM node:20-slim AS build
WORKDIR /repo

# Workspace manifests first so the dependency layer is cached.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json

# Only the api workspace and its workspace deps (core). Native modules
# (sharp, onnxruntime-node) get their linux binaries here.
RUN npm ci --workspace apps/api --include-workspace-root=false --no-audit --no-fund

COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w apps/api

# ---------- runtime ----------
FROM node:20-slim AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    DATA_DIR=/data
WORKDIR /repo

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/core ./packages/core
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

RUN mkdir -p /data && chown -R node:node /data
USER node
WORKDIR /repo/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
