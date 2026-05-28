#!/bin/sh
set -e
# The packages/db scripts pin --env-file=../../.env; bypass and invoke
# the migrators directly so docker-compose env_file supplies the env.
cd /app/packages/db
echo "[migrate] control schema..."
bun src/migrations/control.ts
echo "[migrate] tenant fanout..."
bun src/migrations/fanout.ts
echo "[migrate] done."
