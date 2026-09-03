FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-mar tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/electoral-roll-search/package.json artifacts/electoral-roll-search/package.json
COPY artifacts/electoral-roll-worker/package.json artifacts/electoral-roll-worker/package.json
RUN corepack enable && pnpm install --frozen-lockfile

COPY artifacts/electoral-roll-search/src artifacts/electoral-roll-search/src
COPY artifacts/electoral-roll-worker/src artifacts/electoral-roll-worker/src

ENV ELECTORAL_ROLL_PDF_DIR=/tmp/electoral-roll-pdfs
CMD ["pnpm", "--filter", "@workspace/electoral-roll-worker", "worker"]
