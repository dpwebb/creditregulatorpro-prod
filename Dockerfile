FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && (apt-get install -y --no-install-recommends apt-utils >/tmp/apt-utils-install.log 2>&1 \
    || { cat /tmp/apt-utils-install.log; exit 1; }) \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
  && rm -f /tmp/apt-utils-install.log \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=3334
ENV CRP_DETERMINISTIC_OCR_ENABLED=true

EXPOSE 3334

CMD ["pnpm", "tsx", "server.ts"]
