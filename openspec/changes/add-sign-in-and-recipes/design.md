# Design

## Context

Firebase Auth already exists for sign-in only; `src/hooks.server.ts` verifies a `__session` cookie and redirects to `/signin`, and `src/lib/server/session.ts` can turn an ID token into that cookie. App data lives in Neon through Drizzle (`recipes` and `recipe_ingredients` tables already exist). The Neon HTTP driver has no interactive transactions, secrets are read at runtime through `getDb()` and `getAdminAuth()`, and the app runs on Firebase App Hosting (Cloud Run behind a CDN, which only forwards a cookie named `__session`). See proposal.md for motivation and scope. Screen mockups (sign in, create account, recipe list, recipe form, recipe detail with delete confirm) are in the Meal Planner Mockups canvas: https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5

## Goals / Non-Goals

**Goals:**

- Only invited people can get an account or a session, and an unverified email never gets one.
- Every recipe query is scoped to the owner in one place, so a missing filter cannot happen by accident.
- Multi-step recipe writes are atomic without interactive transactions.

**Non-Goals:**

- A UI for managing the allowlist (it is a secret edited in the console or CLI).
- Parsing ingredient lines into amounts and foods, nutrition, or AI import.
- Handling recipes that are referenced by plans or logs (those tables are empty until a later change).

## Decisions

**Sign-up goes through the server.** The sign-up form posts to a SvelteKit action that checks the allowlist and creates the user with the Admin SDK. The browser then signs in with the Firebase client SDK to send the verification email and signs out again. The alternative, `createUserWithEmailAndPassword` in the browser, lets anyone create Firebase accounts (and trigger emails) before any check runs. We also turn off "Enable create (sign-up)" in the Firebase console so the server route is the only way in.

**The session endpoint is the gate.** Sign-in is: client SDK `signInWithEmailAndPassword`, then `POST /api/session` with the ID token. The server verifies the token, requires `email_verified` and an allowlisted email, and only then sets the `__session` cookie. Failure returns a coded response (`unverified`, `not-allowed`, `invalid`) that the form turns into the messages in the spec. Wrong-password and unknown-email both show the same generic message because Firebase returns one error for both.

**The hook re-checks on every request.** `hooks.server.ts` verifies the cookie (with revocation check) and then applies the allowlist again, so removing an email from `ALLOWED_EMAILS` takes effect on the next request without touching Firebase. It sets `locals.userID` and `locals.email`. A signed-in user hitting `/signin`, `/signup` or `/reset` is redirected to `/recipes`. Public routes: `/signin`, `/signup`, `/reset`, `/api/*`.

**Allowlist as a runtime secret.** `ALLOWED_EMAILS` is a comma-separated list in Secret Manager, parsed by a small pure function (`isAllowed(email, list)`: trim, lower-case, exact match). A database table was considered and rejected for now: it needs an admin screen or manual SQL for a handful of people.

**Password reset uses Firebase's emails.** The client SDK `sendPasswordResetEmail` is used. Firebase's email-enumeration protection (on by default) returns success for unknown emails and sends nothing, which matches the spec without extra code. The page always shows the same message.

**Recipe data layer takes the owner as a required argument.** `makeRecipeStore(db)` returns `list(userId, search)`, `get(userId, id)`, `create(userId, input)`, `update(userId, id, input)` and `remove(userId, id)`. Each query includes `user_id = $1`. Routes call it with `locals.userID`; nothing else touches the recipe tables. Passing `db` in (rather than importing `getDb()`) lets tests run it against a Neon test branch.

**Atomic writes with `db.batch`.** Create generates the recipe id in code (`crypto.randomUUID()`) and sends the recipe insert and the ingredient inserts in one batch. Update sends update recipe, delete its ingredients, insert the new ones in one batch, with the update scoped by `user_id` and the ingredient statements guarded by a subquery on the owned recipe. Neon runs a batch as one transaction.

**Ingredients and steps as plain lines.** The form has two textareas, one ingredient per line and one step per line. Lines are trimmed and blanks dropped; reordering is editing text. Ingredient rows are saved with `raw_text`, a new `position`, and `match_status = 'unparsed'`. Steps stay in the existing `instructions text[]` column (array order is the order). A later import change will parse `unparsed` rows. Dynamic add/remove rows were rejected as more UI for no behavior the spec needs.

**Validation in one Zod schema** shared by the create and edit actions: title 1 to 200 characters; servings whole number 1 to 99; total minutes empty or whole number 1 to 1440; source link empty or an `http`/`https` URL; at most 100 ingredient lines of 300 characters; at most 50 steps of 2000 characters.

**Not-found, not forbidden.** `get`, `update` and `remove` return `null` or a zero count for a recipe owned by someone else, and routes turn that into the same 404 as a missing id.

**Deleting is a confirmed form post.** The detail page shows a confirmation step (a native `<dialog>`) before the delete action runs. Delete removes the recipe row and its ingredient rows (the `recipe_ingredients` foreign key already cascades).

**Search** is a case-insensitive `ILIKE '%term%'` on title, with `%`, `_` and `\` in the term escaped. List is ordered by `created_at` descending.

## Risks / Trade-offs

- Email verification links come from Firebase's default template and sender → acceptable for a hobby app; customise the template in the console later.
- An allowlisted person who has not signed up yet can be impersonated at sign-up by anyone who knows their address → the account exists but can never get a session without verifying the email, and the real owner can still sign up only if the address is free; if it is taken, the owner uses password reset, which only the address's owner can complete.
- Deleting a recipe later referenced by plans, leftovers or the food log will hit non-cascading foreign keys → no such rows exist yet; the planner change must decide between blocking delete and detaching.
- A new secret and a console setting must be in place before deploy or sign-up fails closed (nobody can sign up) → covered in the migration plan and a task.
- One `__session` cookie means the CDN must not cache authenticated HTML → pages send `Cache-Control: private, no-store` from the hook.

## Migration Plan

1. Add `position integer not null default 0` to `recipe_ingredients` (additive, so old code is unaffected) as a committed migration. Merging to `develop` runs it on the Neon `dev` branch through the migrate workflow; merging to `production` runs it on the real database, in parallel with the App Hosting rollout.
2. Create `ALLOWED_EMAILS` in Secret Manager, grant the `meal-planner` backend access, and reference it in `apphosting.yaml`.
3. In the Firebase console: enable Email/Password, disable "Enable create (sign-up)", add the App Hosting domain to authorized domains.
4. Merge to `production`; App Hosting rolls out. Rollback is the previous rollout; the new column is harmless to old code.
