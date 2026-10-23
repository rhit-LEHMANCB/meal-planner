# Meal Planner

AI recipe import, a weekly meal plan with leftovers, grocery lists and calorie tracking.

## Getting started

```sh
nvm use            # Node 24
npm install
cp .env.example .env   # fill in values, see below
npm run db:migrate   # apply migrations to Neon
npm run dev
```

You need: a Neon project (pooled connection string), a Firebase project with the Email/Password sign-in provider enabled and a service account, an Anthropic API key, and `ALLOWED_EMAILS` set to the addresses that may sign in.

## Access and sign-in

The site is public but invite-only.

- `ALLOWED_EMAILS` (comma-separated, case-insensitive) is the allowlist. Only those emails can create an account or hold a session. Removing an email cuts that person off on their next request.
- Sign-up is a server action that checks the allowlist before creating the Firebase user. The browser then sends the verification email. A session is only issued for a verified, allowlisted email.
- Sign-in is Firebase email and password in the browser, then `POST /api/session` swaps the ID token for an httpOnly `__session` cookie that lasts 5 days.
- Password reset uses Firebase's reset email and always shows the same message.

Firebase console steps (project `lehman-meals`): enable Email/Password under Authentication, turn off "Enable create (sign-up)" in Authentication settings so the server route is the only way to create accounts, and add the App Hosting domain under Authorized domains.

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
- `src/routes`: sign-in, sign-up, reset, and recipes (list, search, add, view, edit, delete). Plan, grocery, leftovers and nutrition are placeholders for now.

## Roadmap

1. ~~Auth and recipe CRUD~~ (done)
2. AI import (link and text, then photo)
3. Weekly planner and grocery list
4. Leftovers and pantry
5. Nutrition tracking and goals
6. PWA, offline grocery list
