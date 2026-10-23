# Tasks

## 1. Allowlist, schema and config

- [x] 1.1 Add `src/lib/domain/allowlist.ts` with `isAllowed(email, list)` and `parseAllowlist(raw)` and a spec covering case, spaces, empty list and non-members; verify `npm test` passes
- [x] 1.2 Add `position` to `recipe_ingredients` in `schema.ts`, run `npm run db:generate`, and verify the generated SQL only adds that column
- [x] 1.3 Add `ALLOWED_EMAILS` to `apphosting.yaml` as a runtime secret and to `.env.example`, and document it in `CLAUDE.md`; verify `npm run build` still passes

## 2. Session, hook and sign-out

- [x] 2.1 Rewrite `POST /api/session` to verify the ID token, require `email_verified` and an allowlisted email, set the `__session` cookie, and return `unverified`, `not-allowed` or `invalid` codes; add handler tests with a stubbed Admin SDK covering each scenario in `user-auth`
- [x] 2.2 Update `hooks.server.ts` to verify the cookie with revocation check, re-apply the allowlist, set `locals.userID` and `locals.email`, redirect signed-in users away from `/signin`, `/signup`, `/reset`, and send `Cache-Control: private, no-store`; add tests for protected, public, expired and removed-from-allowlist cases
- [x] 2.3 Add a sign-out action that clears the cookie and redirects to `/signin`; verify with a handler test

## 3. Auth screens

- [x] 3.1 Build the sign-in page from the mockup, with the client SDK sign-in, the `/api/session` call, and the three failure messages from the spec; verify against the sign-in scenarios by hand
- [x] 3.2 Build the sign-up page and server action (allowlist check, `createUser`, then client verification email); add action tests for allowlisted, not-allowlisted, case-insensitive and short-password scenarios
- [x] 3.3 Build the reset page using `sendPasswordResetEmail` with the same message for any address; verify by hand with a known and an unknown address
- [x] 3.4 Add a Sign out control to the layout and hide the sidebar on the auth pages; verify by hand at phone and desktop widths

## 4. Recipe data layer

- [ ] 4.1 Add the Zod recipe form schema with the limits from design.md and unit tests for every validation scenario in `recipes`
- [ ] 4.2 Add `makeRecipeStore(db)` with `list`, `get`, `create`, `update`, `remove`, each scoped by user and using `db.batch` for multi-step writes; export `createDb(url)` from `db/index.ts`
- [ ] 4.3 Add `TEST_DATABASE_URL` support (pointed at the Neon `dev` branch, never production) and write integration tests (skipped when unset) for ordering, blank-line dropping, search, owner isolation on get, update and remove, and cascade delete, each using a unique throwaway user id and cleaning up; verify they pass against the dev branch

## 5. Recipe screens

- [ ] 5.1 Build the recipe list with search, empty and no-results states from the mockup, using `list`; verify the list scenarios by hand
- [ ] 5.2 Build the new-recipe and edit pages with the shared form, server actions and inline errors; verify create and edit scenarios by hand
- [ ] 5.3 Build the detail page with the confirmed delete dialog and a 404 for missing or foreign recipes; verify the view, delete and privacy scenarios by hand with two accounts
- [ ] 5.4 Add a handler-level test that a recipe route called with another user's id returns 404 for load, edit action and delete action

## 6. Integration and rollout

- [ ] 6.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build` and `npm run check:server` and verify all pass
- [ ] 6.2 Update `README.md` and `CLAUDE.md` with the auth flow, the allowlist and the Firebase console steps
- [ ] 6.3 Write the human verification checklist (sign-up email arrives, verification link works, reset email works, two-account privacy check on the live site) into the change's `lifecycle.md`

## Workflow follow-up

- Before merging to `production`: create and grant the `ALLOWED_EMAILS` secret and complete the Firebase console steps. The migration needs no manual step; the migrate workflow runs it on merge.
- Archive the change after it ships.
