# ERP Renovation

Assembly-line ERP for apartment renovation. SaaS-ready from day one with schema-per-tenant multi-tenancy. See `CLAUDE.md` for working conventions and `docs/` for the phase-by-phase delivery plan (`docs/README.md` is the entry point).

## Stack

- **Runtime / package manager**: Bun 1.3.14
- **Monorepo**: Turborepo over Bun workspaces
- **Frontend** (`apps/web`): React + Vite + TanStack Router + TanStack Query + Tailwind v4 + shadcn/ui (Maia `base-maia` style) + PWA
- **Backend** (`apps/api`): Elysia on Bun (Eden Treaty for end-to-end types)
- **Data** (`packages/db`): Drizzle ORM + PostgreSQL (schema-per-tenant)
- **Validation** (`packages/validators`): Zod (shared between API routes and RHF forms)
- **Lint / format**: Biome
- **Queue** (planned): BullMQ + IORedis + Redis

## Layout

```
apps/
  web/       # React + Vite frontend (port 3000)
  api/       # Elysia backend (port 3001)
packages/
  db/                 # Drizzle client + schema (@repo/db)
  validators/         # Shared Zod schemas (@repo/validators)
  typescript-config/  # Shared tsconfig presets
docs/        # Phase 0–9 specs and the delivery plan
```

## Commands

```sh
bun install          # install workspace deps
bun run dev          # turbo dev: web + api in parallel
bun run build        # turbo build
bun run lint         # turbo lint (Biome via each workspace)
bun run check        # biome check --write (lint + format, auto-fix)
bun run format       # biome format --write
bun run typecheck    # turbo typecheck (tsc --noEmit per workspace)
```

Run a single workspace, e.g.:

```sh
cd apps/web && bun run dev
```

## Adding a shadcn primitive

```sh
cd apps/web && bunx --bun shadcn@latest add <component>
```

Primitives land in `apps/web/src/components/ui/`; the `@/*` alias resolves to `apps/web/src/*`.
