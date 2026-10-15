# Tiny image for the Railway cron services (docs/ops/railway-cron.md). Set the service's Root Directory to
# scripts/cron and its Custom Start Command to e.g. `node cron-trigger.mjs weekly-digest`.
FROM node:22-alpine
WORKDIR /app
COPY cron-trigger.mjs .
CMD ["node", "cron-trigger.mjs"]
