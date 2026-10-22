# Project notes

Meal planning app: AI recipe import, a weekly plan with leftovers, grocery lists and calorie tracking. Hobby project.

## Stack

- SvelteKit 3 (Svelte 5 runes), Tailwind 4. Path alias is `#lib/*` (include the file extension for server files, e.g. `#lib/server/admin.ts`). Env vars are declared in `src/env.ts` and imported from `$app/env/private` or `$app/env/public`.
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
