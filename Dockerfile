FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npx vite build

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["npx", "tsx", "server.ts"]
