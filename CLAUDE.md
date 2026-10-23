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

## Auth and recipes

- Access is gated twice: `/api/session` refuses to start a session unless the email is allowlisted and verified, and `hooks.server.ts` re-checks both on every request (so removing an email takes effect immediately). Public routes are `/signin`, `/signup`, `/reset` and `/api/*` (`src/lib/domain/paths.ts`).
- Accounts are created only by the sign-up server action after the allowlist check. Keep "Enable create (sign-up)" off in the Firebase console.
- Routes get the user from `requireUserId(locals)` and talk to recipes only through `getRecipeStore()` (`src/lib/server/recipes.ts`), whose methods all take the owner id. Someone else's recipe must look exactly like a missing one (404). Never query the recipe tables from a route directly.
- Ingredients are structured rows (amount, unit, name, note) edited with `IngredientRows.svelte` on the add, edit and import review forms; steps are free text, one per line. `raw_text` is the display line: kept as written while a row is untouched, rebuilt from the fields once edited. `match_status` is `parsed`, `check` or `skipped`, always computed on the server (`ingredientStatus` in `src/lib/domain/ingredient-line.ts`). Rows saved before structured rows are `unparsed` with a null `name`; the edit form pre-fills them with the line parser and they convert when saved.

## Recipe import

- `/recipes/import` imports from a link, pasted text or a photo and ends on a review form; nothing is saved until "Save to recipe shelf" (the `save` action, which validates like any recipe form). The draft is not stored anywhere.
- Links: `src/lib/server/ai/safe-fetch.ts` reaches only public addresses (checked on every redirect, max 3, and the socket connects to the vetted address), ports 80/443, 10 s, 2 MB, HTML only. A page with schema.org Recipe data is mapped in code with no model call; otherwise its text (max 30,000 chars) goes to the model. Unreadable pages fall back to pasted text with the link kept.
- Limits (`src/lib/server/import-usage.ts`, table `import_usage`, one row per user): 20 AI imports per user per UTC day, 10 s between imports, pasted text max 20,000 chars, photos max 5 MB (shrunk to 1600 px in the browser; `BODY_SIZE_LIMIT=6M` in `apphosting.yaml`). A reserved AI import is refunded only if the request never reached the model.
- Photos are sniffed by their bytes (JPEG, PNG, WebP), sent to the model and never stored or logged.
- The model (`claude-haiku-5-5`) output is salvaged field by field (`salvageRecipe`); missing servings stay blank, never guessed.
- Integration tests (`recipes.integration.spec.ts`) run when `TEST_DATABASE_URL` points at the Neon `dev` branch and are skipped otherwise. They clean up their own rows.
- Drizzle prints a bare column name in single-table queries, so a correlated subquery must write the outer table's name out by hand.

## Database notes

- The Neon HTTP driver (`drizzle-orm/neon-http`) has no interactive transactions. Use `db.batch([...])` for multi-step writes, or switch to the WebSocket `Pool` driver if a flow needs real transactions (for example drawing down leftover servings while inserting a planned meal).

## Deployment

Two deployed sites in one Firebase project: production (`meal-planner`, branch `production`) and dev (`meal-planner-dev`, branch `develop`). Both are Firebase App Hosting backends built from this repo.

- Firebase project id: `lehman-meals`
- Neon: project `plain-wind-36684347` (org `org-green-unit-56216445`), branch `production`. `neon.ts` is the Neon config; `neon env pull` refreshes `.env`.
- `DATABASE_URL` is the pooled string the app uses; `DATABASE_URL_UNPOOLED` is the direct one drizzle-kit uses for migrations.
- Neon branches: `production` (default, the real database) and `dev` (a child of production with no expiry, for rehearsing migrations and running integration tests). Reset `dev` from production with `neon branches reset dev --parent --project-id plain-wind-36684347` when it drifts. `neon.ts` gives other new branches a 7 day TTL.
- `npm run db:smoke` proves the connection with a write, read and delete.
- `ALLOWED_EMAILS` is a comma-separated list of the emails allowed to sign up and sign in (case-insensitive). Only people on it get an account or a session; edit it with `firebase apphosting:secrets:set ALLOWED_EMAILS` and roll out again.
- `/api/health` returns `{"db":"ok"}` when the database is reachable.
- Dev site: App Hosting backend `meal-planner-dev` (live branch `develop`, environment name `dev`, config in `apphosting.dev.yaml`) at https://meal-planner-dev--lehman-meals.us-east5.hosted.app. It uses the Neon `dev` branch (secret `DATABASE_URL_DEV`) and its own allowlist (secret `ALLOWED_EMAILS_DEV`: the owner plus the two QA accounts). The QA accounts are not on the production allowlist. Firebase Auth is one project for both sites. Never point QA or tests at production.
- App Hosting backend id: `meal-planner`, live branch `production`. Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, `FB_CLIENT_EMAIL`, `FB_PRIVATE_KEY`, `ALLOWED_EMAILS`) live in Cloud Secret Manager (`firebase apphosting:secrets:set <NAME>`), not in GitHub. There is no deploy GitHub Action: App Hosting builds and rolls out itself. GitHub Actions only runs `CI` and the OpenSpec archive.
- QA: `npm run test:qa` runs `tests/qa` (Playwright, project `qa`) against the dev site, or any URL in `QA_BASE_URL`. Credentials come from the gitignored `.env.qa`; recreate or reset the two verified QA accounts with `node scripts/create-qa-users.mjs you@example.com` (needs Node 24 and the Admin credentials in `.env`). QA recipes are named `qa-*` and the suite cleans them up. Every page sets `data-hydrated` on `<html>`; tests wait for it before typing, because typing into a server-rendered form before hydration is overwritten.

## Migrations

Schema changes: edit `schema.ts`, run `npm run db:generate`, commit the new files under `drizzle/`. Never edit an applied migration.

- Merging to `develop` runs `.github/workflows/migrate.yml` against the Neon `dev` branch. Merging to `production` runs it against production. Each GitHub environment (`develop`, `production`) holds its own `DATABASE_URL_UNPOOLED` secret (the direct connection).
- Migrations must be additive. App Hosting starts rolling out new code on the same push, so for a few minutes old code runs on the new schema. `npm run check:migrations` (also in CI) rejects drops, renames, type changes, `SET NOT NULL`, and `NOT NULL` columns without a default. To remove something, stop using it in one change and drop it in a later one, with `-- allow-destructive: <reason>` as the first line of that migration file.
- Because changes flow develop then production, every migration has already run on `dev` before it reaches production.
- Run one locally against dev: `DATABASE_URL_UNPOOLED=$(neon connection-string dev --project-id plain-wind-36684347) npx drizzle-kit migrate`.

## Process

OpenSpec and the `dev-lifecycle` skill are set up as in the property app: `openspec/` holds specs and changes, `.claude/skills` the workflows, `.claude/commands/opsx` the slash commands. `dev-lifecycle` needs a Playwright `qa` project and dev QA accounts (`.env.qa`, gitignored) before its QA stage can run.
