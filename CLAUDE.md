# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Assembly-line ERP for apartment renovation. SaaS-ready from day one with **schema-per-tenant multi-tenancy**. Features a strictly-sequenced, checklist-gated pipeline across ~8 stages, a 4-role model (Owner/Manager, Inspector, Master, Procurement), and financial tracking (wages, Plan-vs-Actual).

## Monorepo Structure

Turborepo over Bun workspaces:

```
apps/
  web/       # React + Vite + TanStack Router + PWA (port 3000)
  api/       # Elysia on Bun (port 3001)
packages/
  db/                 # Drizzle ORM client + schema (@repo/db)
  validators/         # Shared Zod schemas (@repo/validators)
  typescript-config/  # Shared tsconfig presets
```

Future backend packages (e.g. BullMQ workers) will be added under `packages/`.

## Key Commands

```bash
bun run dev          # Run all apps in dev mode (via turbo)
bun run build        # Build all apps and packages
bun run lint         # Biome lint (via turbo)
bun run check        # Biome check --write (lint + format, auto-fix)
bun run format       # Biome format --write (format only)
bun run typecheck  # Type-check all packages (via turbo)
```

To run a single app: `cd apps/web && bun run dev`

## Code Style (Biome)

Biome replaces both Prettier and ESLint. Config is in `biome.json` at the root.

- **Indentation**: tabs (not spaces)
- **Line width**: 100 characters
- **Quotes**: double quotes
- **Trailing commas**: all valid positions
- **Semicolons**: always required
- **Unused imports/variables**: warn (not error)
- **Import organization**: enabled (Biome organizes automatically)

Run `bun run check` after editing to auto-fix both lint and format issues.

## TypeScript

- Strict mode enabled everywhere (`strict: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`)
- Module system: NodeNext (`moduleResolution: "NodeNext"`)
- Target: ES2022
- Frontend never imports Drizzle directly — all data access goes through Elysia endpoints

## Critical Architecture Constraints

### Multi-Tenancy (non-negotiable)
Every data-touching code path **must resolve a tenant context first** and operate inside that tenant's PostgreSQL schema. There is no query that doesn't know its tenant. Treat any violation as a bug.

### Data Shape Source of Truth
- **Drizzle schema** (`packages/db`) is the canonical data model
- **Zod schemas** (`packages/validators`) are authoritative for runtime validation
- **Eden Treaty** client types are derived from Zod — never define parallel shapes
- If frontend and backend disagree on a shape, fix the shared schema, not one side

### BullMQ / Redis
Use **IORedis** (not `Bun.redis`) for BullMQ connections — this is the maintainer-endorsed configuration. BullMQ is officially supported on Bun as of May 2026.

## Tech Stack Reference

| Layer | Technology |
|-------|-----------|
| API | Elysia + Eden Treaty (end-to-end types) |
| DB | Drizzle ORM + PostgreSQL (schema-per-tenant) |
| Queue | BullMQ + IORedis + Redis |
| Forms | React Hook Form + Zod |
| UI | shadcn/ui (Maia `base-maia` style, neutral palette) + Tailwind CSS v4 + Inter Variable |
| Auth | Better Auth |
| Storage | Cloudflare R2 — **Bun native S3 client** (`Bun.s3`) for presigned URLs and server-side object ops |
| Notifications | Telegram (grammy) + Web Push |
| Infra (local) | Docker Compose → Railway (prod) |

## Definition of Done

Any feature is complete when it:
1. Works end-to-end through a real Elysia endpoint with Zod-validated input
2. Is consumed by the frontend via the Eden Treaty client
3. Has tenant isolation verified
4. Has the happy path covered by at least one Bun test

## Git Conventions

Use **Conventional Commits**:
- `feat:` new feature
- `fix:` bug fix
- `chore:` tooling, deps, config
- `docs:` documentation only
- `refactor:` code change with no behavior change
- `test:` adding or updating tests

## Phase-Based Development

The project is built in 10 phases (0–9), each a vertical slice from DB to UI. Critical path to MVP: Phase 0 → 1 → 2 → 3 → 4 → 5 → 7.

Phase 0 (tooling, CI, Docker, deploy skeleton) is currently in progress.

## UI Components (shadcn/ui)

`apps/web` uses shadcn/ui configured via `apps/web/components.json` with the **Maia `base-maia` style** (registry preset `bbVJxYW`), neutral base color, and Lucide icons. Tailwind v4 tokens + theme live in `apps/web/src/index.css` (CSS variables for light/dark, `oklch` palette, extended radii, Inter Variable font).

- Primitives live in `apps/web/src/components/ui/` (currently: `button.tsx`).
- Shared utilities: `apps/web/src/lib/utils.ts` (`cn` helper).
- Path alias `@/*` → `apps/web/src/*` (configured in `tsconfig.json` + `vite.config.ts`).
- Add a primitive: `cd apps/web && bunx --bun shadcn@latest add <component>`.
- Do **not** hand-edit files under `components/ui/` casually — they're generated and intended to stay close to the registry source so re-adds remain clean.

**Phase specs** — read the relevant file before implementing anything in a phase:

- @docs/README.md — project goals, roles, pipeline overview
- @docs/PHASE-0-foundation.md
- @docs/PHASE-1-tenancy-auth.md
- @docs/PHASE-2-templates-pipeline.md
- @docs/PHASE-3-properties.md
- @docs/PHASE-4-acceptance-flow.md
- @docs/PHASE-5-automation-jobs.md
- @docs/PHASE-6-hr-masters.md
- @docs/PHASE-7-finance.md
- @docs/PHASE-8-realtime-notifications.md
- @docs/PHASE-9-hardening-saas.md

