FROM node:22-bookworm-slim

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
  && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && pnpm exec expo export --platform web --output-dir web-dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["pnpm", "start"]
