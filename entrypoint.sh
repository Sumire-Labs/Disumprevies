#!/bin/sh
set -e

# pnpm の仮想ストア構造では node_modules/prisma/ が直接存在しない。
# find で実際の prisma CLI エントリポイントを動的に解決する。
PRISMA_BIN=$(find /app/node_modules -path "*/prisma/build/index.js" -type f | head -1)

if [ -z "$PRISMA_BIN" ]; then
  echo "ERROR: prisma CLI not found in node_modules" >&2
  exit 1
fi

echo "Using prisma CLI: $PRISMA_BIN"
node "$PRISMA_BIN" migrate deploy --schema packages/core/prisma/schema.prisma

exec node packages/core/dist/bot/index.js
