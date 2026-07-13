# Worker d'encodage Worimo — image portable (local, Cloud Run, VPS)
# Node >= 22 requis : supabase-js s'appuie sur le WebSocket natif.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
