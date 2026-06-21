#--------------------------------------- Fase de construcción-----------------------------
FROM node:22.13.0-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

#------------------------------------------ Fase de producción-----------------------------
FROM node:22.13.0-slim AS production

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./

ENV NODE_ENV=production

RUN npm install --only=production --legacy-peer-deps && npm cache clean --force

CMD ["node", "dist/main"]