# ---- Build the React admin (served at /admin-app/) ----
FROM node:20-alpine AS admin-build
WORKDIR /build/admin-app
COPY admin-app/package*.json ./
RUN npm ci --no-audit --no-fund
COPY admin-app/ ./
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node . .
COPY --from=admin-build --chown=node:node /build/admin-app/dist ./admin-app/dist
RUN mkdir -p generated var && chown -R node:node generated var
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server/app.js"]
