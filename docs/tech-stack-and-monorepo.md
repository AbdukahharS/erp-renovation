# Tech Stack & Monorepo Structure
## ERP System for Streamlined Apartment Renovation

---

## Tech Stack

### Runtime — Bun
The entire project runs on Bun. It replaces Node.js as the runtime, npm/pnpm as the package manager, and Jest as the test runner — all in one tool. Native built-ins for S3, PostgreSQL, and Redis mean fewer third-party driver dependencies. Recent releases resolved the memory issues that were the main production concern. Bun's native workspace support handles the monorepo without extra tooling.

### Backend Framework — Elysia
Elysia is purpose-built for Bun and takes full advantage of it. End-to-end type safety is first-class via the Eden Treaty client — no adapter glue, no separate schema layer on top. The plugin system maps cleanly onto the ERP's module boundaries (properties, pipeline, users, finance). Significantly faster than any Node.js framework for this workload. Chosen over NestJS specifically to avoid the tRPC/NestJS integration friction that would have been the main architectural headache with the original stack.

### API Type Safety — Eden Treaty
Eden Treaty is Elysia's native E2E type-safety client. The Elysia router type is inferred automatically and consumed on the frontend — same guarantee as tRPC but with zero extra configuration. No shared router package needed; the `packages/validators` Zod schemas are the only manually shared type layer.

### ORM — Drizzle
The right ORM for Bun. Prisma's query engine has historically had Bun compatibility issues; Drizzle is pure TypeScript with no binary engine dependency. It's SQL-close and explicit — good for a schema with the relational complexity this ERP requires (multi-tenancy, stage locking, financial transactions). Schema-as-code integrates cleanly with the `packages/db` workspace. Migration tooling via `drizzle-kit`.

### Database — PostgreSQL
Non-negotiable for this project. Row-level security supports multi-tenant isolation. Relational integrity enforces stage-blocking logic at the database level, not just in application code. JSONB handles flexible checklist schemas that vary per stage type. Schema-per-tenant isolation chosen over `tenant_id` columns — cleaner for future SaaS, easier to backup and migrate individual clients.

### Queue — BullMQ + Redis
The "hidden automation" that fires when an inspector presses Accept (wage crediting, stage unlocking, notifications dispatch) must be async and reliable — not inline in the request cycle. BullMQ is the right tool: battle-tested, Redis-backed, with retry logic and job failure handling built in. **Now officially Bun-compatible** as of January 2026, with BullMQ running its full test suite on Bun in CI. Benchmarks show Bun is 25–38% faster than Node for most BullMQ operations. The concern from earlier in the planning process is fully resolved.

### Frontend Framework — React + Vite
Single-page application — the right model for a role-gated internal ERP where SSR provides no benefit. Vite gives fast HMR during development. React's ecosystem depth matters here: TanStack Query, shadcn/ui, and React Hook Form all have their strongest integrations in React. Chosen over Vue 3 + Vite for ecosystem reasons; the framework delta is small but the internal-tool library surface is marginally stronger on the React side.

### Routing — TanStack Router
File-based, fully type-safe routing. Route params, search params, and loader data are all typed end-to-end — no `useParams()` casting. Loader pattern integrates with TanStack Query for prefetching stage and unit data before render. The role-based access model (three distinct interfaces per role) is cleaner to implement with typed route guards than with React Router.

### Server State — TanStack Query
The ERP is heavily server-state-driven: stage transitions, live financials, checklist status. TanStack Query handles caching, background refetching, and query invalidation after mutations (e.g. invalidate unit data after a stage is accepted). Removes the need for a global state manager for most of the app. WebSocket events from Elysia trigger targeted query invalidations for the real-time dashboard.

### Forms — React Hook Form + Zod
TanStack Form v1 is capable but still maturing. React Hook Form is more battle-tested for the dynamic field complexity this app requires: conditional photo upload requirements, variable checklist fields per stage type, multi-step forms for unit creation. shadcn/ui form components are documented and pre-wired for RHF + Zod by default, which reduces integration friction throughout the project.

### Validation — Zod
Single validation layer shared across the stack. Zod schemas live in `packages/validators` and are consumed by both Elysia route input validation and React Hook Form field validation. One source of truth for all data shapes — no drift between frontend and backend validation rules.

### UI Components — shadcn/ui
Matches the "modern minimalism" UI requirement from the TZ exactly. Components are copied into the project (not imported from a package), which means full control over customization — important for the three very different role-based interfaces. Tailwind CSS underneath. Lives directly in `apps/web/src/components/ui`, not in a separate workspace (no second app shares it).

### Monorepo Orchestration — Turborepo
Sits on top of Bun workspaces. Build caching means changing the API doesn't trigger a rebuild of the web app. Parallel task execution with dependency graph awareness. `turbo watch` coordinates the dev server across all workspaces cleanly. Config overhead is one `turbo.json` file — worth keeping.

### File Storage — Cloudflare R2 + Bun S3 Client
Masters upload photos as a hard blocker for stage completion — this is critical path. Files go directly from client to R2 via presigned URLs generated by Elysia; binary data never passes through the application server. R2 chosen over AWS S3 specifically for zero egress fees, which matters when storing and serving large volumes of construction site photos.

### Notifications — Web Push (installed PWA) + in-app notification center
Field workers install the PWA to their home screen as part of onboarding; Web Push delivers task-available / rejection / acceptance events to the installed app via the service worker. An in-app notification center inside the PWA (unread badge, list, read state, deep links to the relevant property/stage) backs every dispatched intent so a missed or dismissed push is recoverable. The TZ frames mobile as "PWA *or* Telegram bot" (alternatives) and uses Telegram only as an example; the inspector notification is specified as push outright — so we ship PWA + Web Push and drop Telegram. The Phase 5 dispatch seam stays channel-agnostic, so Telegram (grammy) can be reintroduced later as an optional second channel if a tenant's device fleet demands it.

### Auth — Better Auth
Framework-agnostic, TypeScript-first, works with Bun and Elysia without adapter hacks. Supports the three-role model (Owner, Inspector, Master) with custom session data. Simpler than rolling JWT logic manually; more flexible than NextAuth for a non-Next environment.

### Infrastructure — Docker
Docker Compose for local dev: Postgres + Redis + Elysia API + React dev server all in one `docker-compose up`. Production hosting target is TBD. Migration path to AWS ECS or Kubernetes when B2B SaaS scale justifies the operational investment.

---

## Monorepo Structure

```
erp-renovation/
│
├── apps/
│   ├── api/                        # Bun + Elysia backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── properties/     # Unit cards, status, templating
│   │   │   │   ├── pipeline/       # Stage sequencing, blocking logic
│   │   │   │   ├── checklists/     # Per-stage checklist definitions
│   │   │   │   ├── masters/        # HR module, ratings, availability
│   │   │   │   ├── finance/        # Wage crediting, unit economics
│   │   │   │   ├── notifications/  # Web Push dispatch + in-app notification records
│   │   │   │   └── auth/           # Better Auth setup, role guards
│   │   │   ├── jobs/               # BullMQ job definitions + processors
│   │   │   │   ├── stage-accept.job.ts
│   │   │   │   ├── wage-credit.job.ts
│   │   │   │   └── notify-next-master.job.ts
│   │   │   ├── lib/
│   │   │   │   ├── redis.ts        # Redis client instance
│   │   │   │   ├── storage.ts      # Bun S3 client, presigned URL helpers
│   │   │   │   └── queue.ts        # BullMQ queue/worker setup
│   │   │   └── index.ts            # Elysia app entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                        # React + Vite frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/             # shadcn/ui components (live here, not a package)
│       │   │   └── shared/         # App-specific shared components
│       │   ├── routes/             # TanStack Router file-based routes
│       │   │   ├── _auth/          # Auth layout + login page
│       │   │   ├── _owner/         # Owner dashboard, settings, analytics
│       │   │   ├── _inspector/     # Inspector checklist, acceptance views
│       │   │   └── _master/        # Master task view, photo upload
│       │   ├── lib/
│       │   │   ├── api.ts          # Eden Treaty client instance
│       │   │   ├── query.ts        # TanStack Query client setup
│       │   │   └── auth.ts         # Auth client + session helpers
│       │   ├── hooks/              # Custom React hooks
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── db/                         # Drizzle schema + client (shared)
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── properties.ts
│   │   │   │   ├── pipeline.ts
│   │   │   │   ├── checklists.ts
│   │   │   │   ├── masters.ts
│   │   │   │   ├── finance.ts
│   │   │   │   └── index.ts
│   │   │   ├── client.ts           # Drizzle client + connection
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── validators/                 # Shared Zod schemas (shared)
│       ├── src/
│       │   ├── property.schemas.ts
│       │   ├── pipeline.schemas.ts
│       │   ├── checklist.schemas.ts
│       │   ├── master.schemas.ts
│       │   ├── finance.schemas.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docker-compose.yml              # Postgres + Redis for local dev
├── turbo.json                      # Turborepo task graph
├── package.json                    # Bun workspace root
└── tsconfig.base.json              # Shared TS config
```

### Workspace dependency graph

```
apps/api     →  packages/db
             →  packages/validators

apps/web     →  packages/validators
             (Eden Treaty replaces any shared API types package)
```

`packages/db` is consumed only by the API. The frontend never imports Drizzle directly — all data access goes through Elysia endpoints. `packages/validators` is the only package imported by both sides, keeping the shared surface minimal and deliberate.

### Key scripts (root package.json)

```json
{
  "scripts": {
    "dev":      "turbo watch --parallel",
    "build":    "turbo build",
    "db:push":  "bun --cwd packages/db drizzle-kit push",
    "db:migrate": "bun --cwd packages/db drizzle-kit migrate",
    "db:studio": "bun --cwd packages/db drizzle-kit studio"
  },
  "workspaces": ["apps/*", "packages/*"]
}
```
