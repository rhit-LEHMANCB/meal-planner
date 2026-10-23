# Proposal

## Why

The app is deployed but has no way to sign in, and the sign-in page is a placeholder. Every other feature (plans, grocery lists, nutrition) needs to know who the user is and needs recipes to exist. The site is public and recipe import will spend Anthropic credits, so access has to be limited to invited people from the start.

## What Changes

- Email and password sign-in, sign-up, sign-out and password reset using Firebase Auth, with a server-held session cookie.
- An allowlist of email addresses (`ALLOWED_EMAILS`). Only listed emails can create an account or hold a session. Accounts are created by the server, not directly from the browser.
- Verified email is required before a session is issued, so nobody can claim an allowlisted address they do not own.
- Every page except sign-in requires a session. The existing redirect to `/signin` stays.
- Recipe create, list (with title search), view, edit and delete. A recipe has a title, servings, optional total time, optional source link, ingredient lines (free text) and ordered instruction steps.
- Every recipe belongs to one user. A user can never see or change another user's recipes.
- Ingredient lines keep their order, so `recipe_ingredients` gains a `position` column (migration).
- Sign-in, recipe list, and recipe form/detail screens, designed in the Meal Planner Mockups canvas.

Out of scope: AI import, parsing ingredients into amounts and foods, nutrition, photos, tags, sharing recipes between users, Google sign-in, admin screens for the allowlist, Playwright QA setup (there is no dev environment yet).

## Capabilities

### New Capabilities

- `user-auth`: who can sign in (allowlist, verified email), how sessions start and end, password reset, and route protection.
- `recipes`: creating, listing, searching, viewing, editing and deleting a user's own recipes with free-text ingredients and ordered steps.

### Modified Capabilities

None. There are no existing specs.

## Impact

- New routes: `/signin`, `/signup`, `/reset`, `/recipes`, `/recipes/new`, `/recipes/[id]`, `/recipes/[id]/edit`, plus `/api/session` and a sign-out action.
- `src/hooks.server.ts` (allowlist and verified-email checks), `src/lib/server/session.ts`, `src/lib/firebase.ts`, new `src/lib/server/recipes.ts` data layer, Zod schemas for forms.
- Database: migration adding `recipe_ingredients.position`.
- Config and secrets: new `ALLOWED_EMAILS` secret in Secret Manager and `apphosting.yaml`.
- Firebase console: enable the Email/Password provider, turn off client-side sign-up ("Enable create (sign-up)"), add the App Hosting domain to authorized domains.
- No new runtime dependencies expected.
