FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=optional --omit=dev --no-audit

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
