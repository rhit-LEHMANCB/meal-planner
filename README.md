# Meal Planner

AI recipe import, a weekly meal plan with leftovers, grocery lists and calorie tracking.

## Getting started

```sh
nvm use            # Node 22
npm install
cp .env.example .env   # fill in values, see below
npm run db:migrate   # apply migrations to Neon
npm run dev
```

You need: a Neon project (pooled connection string), a Firebase project with Auth enabled and a service account, and an Anthropic API key.

## Scripts

| Command                                 | What it does                                                     |
| --------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                           | Dev server                                                       |
| `npm test`                              | Vitest unit tests                                                |
| `npm run check` / `npm run lint`        | Types and formatting                                             |
| `npm run db:generate` / `db:migrate`    | Create and apply Drizzle migrations                              |
| `npm run build && npm run check:server` | Build, then verify the deployed function would have every import |

## Layout

- `src/lib/domain`: pure logic (units, nutrition, grocery list). Heavily tested.
- `src/lib/server/ai`: recipe extraction (schema.org JSON-LD first, Claude fallback).
- `src/lib/server/db`: Drizzle schema and client.
- `src/routes`: plan, recipes, grocery, leftovers, nutrition (placeholders for now).

## Roadmap

1. Auth and recipe CRUD
2. AI import (link and text, then photo)
3. Weekly planner and grocery list
4. Leftovers and pantry
5. Nutrition tracking and goals
6. PWA, offline grocery list
