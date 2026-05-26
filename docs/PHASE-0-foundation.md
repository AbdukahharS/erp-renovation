# Phase 0 — Foundation

**Depends on:** nothing · **Est:** ~1 week · **Critical path:** yes

## Goal

A running monorepo skeleton. `bun install` at the root works, `turbo watch` brings up the API and web dev server together, a `docker-compose up` gives you Postgres + Redis locally, and a trivial "hello" endpoint is reachable from the React app *through the Eden Treaty client*. Nothing in this phase does renovation work — it proves the plumbing of the whole stack end-to-end before any feature rides on it. By the end, a public deploy exists even if it serves almost nothing.

## Why now

Every later phase assumes the workspace graph, the shared-package wiring, and the type-safe API↔web link already work. The single most expensive thing to get wrong on this stack is the Bun + Elysia + Eden Treaty + Drizzle integration — better to shake it out on a hello-world than on the pipeline module. Doing the deploy skeleton now (not at the end) means every phase ships to a real environment instead of accumulating an integration debt that detonates at launch.

## Scope

### 0.1 Monorepo & workspaces
- Initialize Bun workspace root (`package.json` with `workspaces: ["apps/*", "packages/*"]`).
- Scaffold the exact tree from the stack doc: `apps/api`, `apps/web`, `packages/db`, `packages/validators`.
- `tsconfig.base.json` shared config; per-workspace `tsconfig.json` extending it.
- `turbo.json` with `dev`, `build`, `db:*` task graph. Verify build caching: changing the API does not rebuild web.

### 0.2 Backend bootstrap
- Minimal Elysia app in `apps/api/src/index.ts` with one typed route (`/health`).
- Export the app *type* for Eden Treaty consumption.
- Wire Bun's native test runner; one passing test against `/health`.

### 0.3 Shared packages, empty but real
- `packages/validators` exports one Zod schema and is importable from both apps.
- `packages/db` sets up the Drizzle client + connection (`client.ts`) and `drizzle.config.ts`, with an empty schema barrel. `db:push` runs against local Postgres successfully.

### 0.4 Frontend bootstrap
- React + Vite app in `apps/web` with Tailwind + shadcn/ui initialized (shadcn components live in `apps/web/src/components/ui`).
- Eden Treaty client in `apps/web/src/lib/api.ts` typed against the API. The React app calls `/health` and renders the result — proving E2E type safety works.
- TanStack Query client + TanStack Router scaffolding with a single route.
- PWA manifest + service worker baseline (so D3's PWA requirement isn't bolted on later).

### 0.5 Local infra
- `docker-compose.yml`: Postgres + Redis. `docker-compose up` + `bun dev` is the entire local setup.
- `.env` handling and a documented `.env.example`.

### 0.6 Deploy skeleton & CI
- Hosting target (TBD): API + Postgres + Redis provisioned. Web served (static or alongside).
- A minimal CI pipeline on Bun: install, typecheck, test, build. Green on the hello-world.

## Out of scope
- Any auth, any tenancy, any renovation domain logic.
- Real schema tables (Phase 1 owns the first ones).
- BullMQ workers (Phase 5) — Redis is provisioned but unused.

## Data model touched
- `packages/db`: client + config only, empty schema barrel.
- `packages/validators`: one throwaway schema to prove the import path.

## Key risks & decisions
- **Bun + Drizzle + Postgres in Docker** can have connection-string/SSL quirks. Resolve here, not later.
- **Eden Treaty type inference** across workspace boundaries is the make-or-break integration. If the API type doesn't flow to the web client cleanly, stop and fix before Phase 1 — everything downstream depends on it.
- **PWA service worker + Vite** caching can fight HMR in dev. Decide the dev/prod SW strategy now.

## Definition of Done
- [ ] `bun install` + `docker-compose up` + `bun dev` brings up everything from a clean clone.
- [ ] React app displays data fetched from `/health` via Eden Treaty, fully typed (break the API return type → web typecheck fails).
- [ ] `turbo build` caches correctly; CI is green.
- [ ] A public deploy is reachable on the internet.
- [ ] `db:push` applies cleanly to local Postgres.
