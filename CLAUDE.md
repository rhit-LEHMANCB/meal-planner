# Project notes

Meal planning app: AI recipe import, a weekly plan with leftovers, grocery lists and calorie tracking. Hobby project.

## Stack

- SvelteKit 2 (Svelte 5 runes). Stay on 2.x until the Firebase Hosting SSR wrapper supports SvelteKit 3 (the property app does the same). Tailwind 4. Path alias is `$lib`. Env vars come from `$env/static/private` and `$env/static/public` (set at build time).
- Firebase Hosting + Cloud Functions (web frameworks) for SSR, and Firebase Auth for sign-in only.
- Neon Postgres through Drizzle. Schema in `src/lib/server/db/schema.ts`. Every user-data row has a `user_id` (the Firebase uid) and every query must filter by it. There are no database security rules.
- Anthropic API for recipe parsing (`src/lib/server/ai`). The model parses and matches only. Calorie and macro numbers always come from the `foods` table, never from the model.

## Rules

- Packages the server imports belong in `dependencies`, not `devDependencies`. Firebase builds the function from `dependencies` only. `npm run check:server` (run after `npm run build`) catches misses.
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

Fill these in once the environments exist; the `dev-lifecycle` skill reads them.

- Dev Firebase project id: TODO
- Dev URL: TODO
- Dev Neon branch: TODO (never point QA or tests at the production database)
- GitHub environments: `develop` and `production`, each with the secrets and vars used in `.github/workflows/firebase-hosting-merge.yml`.

## Process

OpenSpec and the `dev-lifecycle` skill are set up as in the property app: `openspec/` holds specs and changes, `.claude/skills` the workflows, `.claude/commands/opsx` the slash commands. `dev-lifecycle` needs a Playwright `qa` project and dev QA accounts (`.env.qa`, gitignored) before its QA stage can run.
