# Project notes

Meal planning app: AI recipe import, a weekly plan with leftovers, grocery lists and calorie tracking. Hobby project.

## Stack

- SvelteKit 2 (Svelte 5 runes) with `adapter-node`, Tailwind 4. `adapter-node` 6 needs SvelteKit 3, so upgrade both together; App Hosting runs a plain Node server, so there is no hosting-wrapper constraint any more. Path alias is `$lib`. Public config uses `$env/static/public`. Secrets use `$env/dynamic/private` and are read lazily (`getDb()`, `getAdminAuth()`), because they only exist at runtime on App Hosting.
- Firebase App Hosting (Cloud Run, built from GitHub on push to `production`) for SSR, and Firebase Auth for sign-in only. Config is in `apphosting.yaml` and `firebase.json`.
- Neon Postgres through Drizzle. Schema in `src/lib/server/db/schema.ts`. Every user-data row has a `user_id` (the Firebase uid) and every query must filter by it. There are no database security rules.
- Anthropic API for recipe parsing (`src/lib/server/ai`). The model parses and matches only. Calorie and macro numbers always come from the `foods` table, never from the model.

## Rules

- Packages the server imports belong in `dependencies`, not `devDependencies`. App Hosting prunes `devDependencies` from the runtime image. `npm run check:server` (run after `npm run build`) catches misses.
- Keep unit conversion, grocery aggregation and nutrition math as pure functions in `src/lib/domain` with Vitest specs. Leftover meals must never add to the grocery list.
- Snapshot macros onto `food_log` rows at log time.
- Use the Neon pooled connection string.

## Design

Mockups: https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5 (weekly plan, import review, nutrition, phone grocery list). Palette tokens are in `src/routes/layout.css`.

## Branches

`develop` deploys to the dev site, `production` to prod. Work on feature branches and merge to `develop` first.

## Database notes

- The Neon HTTP driver (`drizzle-orm/neon-http`) has no interactive transactions. Use `db.batch([...])` for multi-step writes, or switch to the WebSocket `Pool` driver if a flow needs real transactions (for example drawing down leftover servings while inserting a planned meal).

## Deployment

Early development: one deployed site (production) and a separate dev database branch. No dev site yet.

- Firebase project id: `lehman-meals`
- Neon: project `plain-wind-36684347` (org `org-green-unit-56216445`), branch `production`. `neon.ts` is the Neon config; `neon env pull` refreshes `.env`.
- `DATABASE_URL` is the pooled string the app uses; `DATABASE_URL_UNPOOLED` is the direct one drizzle-kit uses for migrations.
- Neon branches: `production` (default, the real database) and `dev` (a child of production with no expiry, for rehearsing migrations and running integration tests). Reset `dev` from production with `neon branches reset dev --parent --project-id plain-wind-36684347` when it drifts. `neon.ts` gives other new branches a 7 day TTL.
- `npm run db:smoke` proves the connection with a write, read and delete.
- `/api/health` returns `{"db":"ok"}` when the database is reachable.
- There is still no dev _site_, only the dev database branch. Point integration tests and QA at the `dev` Neon branch, never `production`, and do not run `dev-lifecycle` QA until a dev backend exists.
- App Hosting backend id: `meal-planner`, live branch `production`. Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `FB_CLIENT_EMAIL`, `FB_PRIVATE_KEY`) live in Cloud Secret Manager (`firebase apphosting:secrets:set <NAME>`), not in GitHub. There is no deploy GitHub Action: App Hosting builds and rolls out itself. GitHub Actions only runs `CI` and the OpenSpec archive.
- `dev-lifecycle` still waits on a `firebase-hosting-merge.yml` run for the dev deploy. That workflow no longer exists, so rework that stage when a dev backend is added.

## Migrations

Schema changes: edit `schema.ts`, run `npm run db:generate`, commit the new files under `drizzle/`. Never edit an applied migration.

- Merging to `develop` runs `.github/workflows/migrate.yml` against the Neon `dev` branch. Merging to `production` runs it against production. Each GitHub environment (`develop`, `production`) holds its own `DATABASE_URL_UNPOOLED` secret (the direct connection).
- Migrations must be additive. App Hosting starts rolling out new code on the same push, so for a few minutes old code runs on the new schema. `npm run check:migrations` (also in CI) rejects drops, renames, type changes, `SET NOT NULL`, and `NOT NULL` columns without a default. To remove something, stop using it in one change and drop it in a later one, with `-- allow-destructive: <reason>` as the first line of that migration file.
- Because changes flow develop then production, every migration has already run on `dev` before it reaches production.
- Run one locally against dev: `DATABASE_URL_UNPOOLED=$(neon connection-string dev --project-id plain-wind-36684347) npx drizzle-kit migrate`.

## Process

OpenSpec and the `dev-lifecycle` skill are set up as in the property app: `openspec/` holds specs and changes, `.claude/skills` the workflows, `.claude/commands/opsx` the slash commands. `dev-lifecycle` needs a Playwright `qa` project and dev QA accounts (`.env.qa`, gitignored) before its QA stage can run.
