# AGENTS.md

Guidance for AI coding agents working in this repository. Keep it concise and current.

## Commands

```bash
npm ci                  # install (CI); use `npm install` locally
npm run build           # next build
npm test                # jest (all tests)
npm test -- <path>      # run a single test file
npm run test:watch      # jest --watch
npm run lint            # eslint . --ext .ts,.tsx,.js,.jsx --quiet
npx tsc --noEmit        # typecheck (no dedicated script)
npm run prettier        # format (write)
npm run prettier:check  # format check (CI gate)
npm run dev             # next dev (local dev server)
```

## Validation Gate

Run before considering any change complete:

```bash
npm run lint && npm run prettier:check && npx tsc --noEmit && npm test
```

CI runs the same gate on PRs to `main`/`staging`/`development` (`.github/workflows/unit.yaml`, tests sharded 4×), plus a generated-Supabase-types check (`ci.yaml`). Note the CI format step is non-blocking (`prettier:check || echo ...`) — a formatting failure only shows in the job summary, so run it locally.

## Development Branch

Base new work on and open PRs against **`development`**.

## Conventions

- **TypeScript** strict mode; target es2020, `moduleResolution: bundler`. Import alias `@/*` → repo root. No `any`.
- **ESLint** extends `next` + `prettier`; `no-console` is an error (only `warn`/`error` allowed) outside `scripts/**` and `supabase/functions/**`.
- **Tests** live in `__tests__/`, named `*.test.ts` / `*.test.tsx`, run via `ts-jest` (Node env). New logic must ship with tests.
- **Commits** follow Conventional Commits, often with a `psk-####` Jira ref (e.g. `feat(investor): ...`, `fix(auth): ...`).
- **Node 22.x** (see `.nvmrc`, `engines`). Package manager: **npm** (`package-lock.json`).
- Pre-commit runs `lint-staged` (prettier + eslint --fix) via husky.
- **Next.js**: prefer API routes / route handlers for data fetching over fetching directly in Server Components.
- **Alertable failures**: for any failure a monitor should page on, call `logAlert` from `utils/logging/alert.ts` instead of sending an email. It emits an `error`-level log with a stable top-level `alert` code (a member of `AlertCode`), so monitors match on `@alert:<code>` (Datadog) / `alert="<code>"` (BetterStack) rather than free-text messages. Add a new `AlertCode` member when a failure needs its own monitor.

## Structure

```
app/         # Next.js App Router (routes, layouts, server actions)
components/   # Shared React components (Radix UI + Tailwind)
lib/         # Domain logic (e.g. lib/v2/inv — active investor module)
data/        # DB access layer; data/superuser/* uses the service client (bypasses RLS)
utils/       # Cross-cutting helpers (pino logging, logAlert, supabase clients)
hooks/ contexts/ stores/   # React state (zustand, react-query)
supabase/    # Migrations, edge functions, config
emails/      # react-email templates
__tests__/   # Jest tests
scripts/     # Build/release/seed/util scripts
database.types.ts   # Generated Supabase types (do not hand-edit)
proxy.ts            # Next.js proxy (request gate: auth/routing), Node runtime
```

## Working Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution over speed;
for trivial tasks, use judgment.

**1. Think before coding** — Don't assume, don't hide confusion, surface tradeoffs. State
assumptions; if uncertain, ask. Present multiple interpretations instead of silently picking
one. Call out a simpler approach and push back when warranted. If something is unclear, stop
and name it.

**2. Simplicity first** — Minimum code that solves the problem, nothing speculative. No
features beyond what was asked, no abstractions for single-use code, no unrequested
configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite
it. Ask: "Would a senior engineer call this overcomplicated?"

**3. Surgical changes** — Touch only what you must; clean up only your own mess. Don't improve
adjacent code, refactor what isn't broken, or change style you'd do differently. Mention
unrelated dead code — don't delete it. Remove imports/variables your change orphaned. Every
changed line should trace to the request.

**4. Goal-driven execution** — Define success criteria and loop until verified. Turn tasks
into verifiable goals ("fix the bug" → "write a failing test that reproduces it, then make it
pass"). For multi-step work, state a brief plan with a verify check per step.

## Rules

**Never**

- Reference AI/Claude/assistants in commits, comments, docs, or any context.
- Reference ticket numbers (e.g. `PSK-1234`) in code comments — they belong in the branch name, commit message, and PR, not the source.
- Push, create PRs, or act on "next steps" without explicit user request.

**Code** — Simplicity over complexity; strict typing (no `any`), prefer immutability and pure
functions; no dead code, magic numbers, or silent failures; clear naming over comments
all new logic ships with unit tests; tests pass before a
task is complete.

**Design** — Single responsibility, loose coupling, high cohesion; explicit, minimal
interfaces; fail fast with clear error messages.

**Quality** — Automated formatting/linting, no exceptions; meaningful coverage on logic and
boundaries; minimize dependencies and pin versions.

**Git** — Atomic commits with conventional messages; small, focused PRs; **ask before any git
operations**.

## Notes

<!-- Anything non-obvious an agent should know before editing -->

- Regenerate DB types with `npm run supabase:generate:types` after migration changes; never hand-edit `database.types.ts`.
- Queries in `data/superuser/**` use the service client, which **bypasses RLS** — every one must filter on `organization_id` explicitly. The RLS policy is not a fallback there.
- The type generator widens CHECK-constrained `text` columns to `string` (only real Postgres ENUMs become unions), so status-style unions are hand-restated in TS and can drift from the migration — change both together.
- New migration functions must pin `SET search_path TO 'public', 'pg_temp'`. Most existing functions predate this and do not — their omission is unconverted legacy, not a signal that it is optional.
- Background jobs use **Inngest**; the active investor module lives in `lib/v2/inv/` (legacy `investor_*` tables are deprecated).
- Feature-flag env vars use the `FF_` prefix; keep flag email lists server-side.
- Many `.env.*` files exist — never commit secrets; `.env.example`/`.env.sample` show the shape.
- The `claude-code-issue.yml` workflow triggers on the `claude-task` issue label (reusable workflow from `postsig/.github`).
