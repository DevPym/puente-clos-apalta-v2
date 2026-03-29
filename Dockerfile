# Stage 1: Build
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=optional --no-audit
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=optional --omit=dev --no-audit
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
