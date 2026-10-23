# Tasks

## 1. Schema and migration

- [x] 1.1 Edit `src/lib/server/db/schema.ts`:
  - `planned_meals`: `recipe_id` nullable; add `food_id`, `quantity`, `unit` and `position`; index on `leftover_batch_id`.
  - `leftover_batches`: add `cook_meal_id` (unique, `ON DELETE SET NULL`, via `AnyPgColumn`) and `thrown_out_at`; index on `user_id`.
  - Unique index on `meal_plans (user_id, week_start)`; index on `foods.user_id`.

  Verify `npm run check` passes.
- [x] 1.2 Run `npm run db:generate` and commit the new `drizzle/` files. Verify `npm run check:migrations` passes, and the SQL has no `DROP TABLE/COLUMN`, `SET NOT NULL` or `NOT NULL` column without a default.
- [x] 1.3 Apply the migration to the Neon `dev` branch locally (`DATABASE_URL_UNPOOLED=$(neon connection-string dev …) npx drizzle-kit migrate`) so integration specs can run. Verify `drizzle-kit migrate` reports success.

## 2. Plan domain logic (pure)

- [x] 2.1 Add `src/lib/domain/plan.ts` with:
  - week math: `mondayOf`, `weekDays`, `addDays`, `parseWeekParam`
  - `SLOTS` and `slotIndex`, `isAfterCook`, `eatByFor` (+4 days), `isPastEatBy`, `batchState`

  Verify `src/lib/domain/plan.spec.ts` covers:
  - non-Monday and invalid week params
  - year and DST boundaries
  - same-day slot order
  - eat-by edges
  - finished vs fridge vs thrown out
- [x] 2.2 Add zod form parsers for cook (1 ≤ eaten ≤ cooked ≤ 99), leftover (servings ≥ 1), food entry (amount > 0, unit) and custom food (name 1–120; kcal 0–900; macros 0–100) with field errors. Verify the cases in `plan-form.spec.ts` pass with `npm test`.

## 3. Food store and search endpoint

- [x] 3.1 Add `src/lib/server/foods.ts` `makeFoodStore(db)`:
  - `search(userId, q)`: own and shared foods, max 20, own first, case-insensitive with escaped LIKE
  - `get(userId, id)` with units (`g` plus `food_units`)
  - `create(userId, input)`

  Verify `foods.integration.spec.ts` on the dev branch covers own vs shared vs another user's food, and the 20-result cap.
- [x] 3.2 Add `src/routes/plan/foods/+server.ts` (GET `?q=`, `requireUserId`, JSON). Verify a signed-out request redirects to sign-in and a signed-in request returns only visible foods (covered by the integration spec through the store plus a manual `curl` in dev).

## 4. Plan store

- [ ] 4.1 Add `src/lib/server/plan.ts` `makePlanStore(db)` with `getWeek(userId, monday)`: entries joined to recipes, foods and batches, grouped by date and slot, ordered by position; plus the fridge batches with their draws. Verify an integration spec that another user's week reads empty.
- [ ] 4.2 Implement `addCook` (week upsert, recipe ownership check, meal and batch in one `db.batch` with code-generated ids) and `addFood` (optionally creating the custom food first). Verify integration specs: batch spare and free equal cooked − eaten; another user's recipe or food is refused as not found.
- [ ] 4.3 Implement `addLeftover` as one conditional CTE statement (free servings, owner, not thrown out), plus the after-cook check. Verify integration specs:
  - over-draw refused
  - a slot before the cook is refused
  - another user's batch is not found
  - two parallel draws of the last serving: exactly one succeeds
- [ ] 4.4 Implement `updateEntry` (cook servings delta guarded so free ≥ 0; leftover delta via CTE; food amount and unit) and `removeEntry` (leftover gives servings back; a cook with draws needs `confirm`, then removes draws, batch and cook in one `db.batch`). Verify integration specs for each path, including "cook below drawn" refused and an entry owned by someone else being not found.
- [ ] 4.5 Implement `listLeftovers(userId, today)` (fridge plus left-the-fridge in the last 14 days, using `batchState`) and `throwOut(userId, batchId)`. Verify integration specs: throw-out zeroes free servings, keeps draws, and isn't possible on another user's batch.

## 5. Recipe delete

- [ ] 5.1 In `src/lib/server/recipes.ts`:
  - `get` returns `plannedCount`.
  - `remove` deletes the recipe's planned meals, then its batches, then the recipe, in one `db.batch`.

  Verify `recipes.integration.spec.ts` gains a case where a recipe with a cook and a leftover deletes cleanly, and another user's plan is untouched.
- [ ] 5.2 Update the recipe detail delete dialog to say "It is on N planned meals, which will be removed too" when `plannedCount > 0`. Verify `npm run check` passes and the text appears for a planned recipe in `npm run dev`.

## 6. Plan page UI

- [ ] 6.1 Add `/plan/+page.server.ts` `load` (week param redirect to its Monday, recipes, week, fridge) and the actions `addCook`, `addLeftover`, `addFood`, `updateEntry`, `removeEntry`. Each returns `fail(400, { errors })` for invalid input and 404 for not found. Verify `npm run check` passes.
- [ ] 6.2 Build `WeekGrid.svelte`, `DayList.svelte` and `SlotEntry.svelte` per the `Plan` and `PlanPhone` mockups:
  - entry styles: cook, leftover (with "Past eat-by (Day)" and "gone"), food
  - Remove buttons with `aria-label`
  - previous, next and This week links
  - client-side local-week correction when there is no `?week`

  Verify in `npm run dev` at 1360 px and 390 px (no sideways scroll on the phone).
- [ ] 6.3 Build `AddDialog.svelte` per the `Picker` mockup:
  - Recipe, Leftover and Food tabs (keyboard tabs, Escape closes)
  - Recipe search plus cook and eat fields with the "N servings go to the fridge" hint
  - Leftover list filtered to after-cook batches with free servings, with past-eat-by warnings
  - Food search via `/plan/foods`, unit select, "Create '<query>'" form
  - Edit mode for an existing entry
  - Field errors shown from `fail` data

  Verify each tab end to end in `npm run dev`.
- [ ] 6.4 Add the remove-cook confirmation listing planned leftovers. Verify removing a cook with draws asks first and removes everything, and one without draws removes at once.
- [ ] 6.5 Add `RecipeShelf.svelte` (draggable chips, md and up) and slot drop targets that open `AddDialog` with recipe and slot preset, plus `FridgePanel.svelte`. Verify in `npm run dev` that dropping a recipe on a slot opens the dialog and saves nothing until confirmed.

## 7. Leftovers page UI

- [ ] 7.1 Add `/leftovers/+page.server.ts` (`load` via `listLeftovers`, `throwOut` action) and the page per the `Leftovers` mockup:
  - batch cards with draw chips and the Past eat-by badge
  - Throw out confirm dialog with Keep
  - "Finished or thrown out (last 2 weeks)" list
  - empty state linking to the plan

  Verify `npm run check` and a manual run in `npm run dev`.

## 8. Docs and final checks

- [ ] 8.1 Update `CLAUDE.md`:
  - plan and leftovers rules: entry kinds, `servings_remaining` = free servings, conditional-CTE writes, `/plan/foods` not under `/api`
  - the recipe store exception for deleting plan rows

  Verify the text matches the design.
- [ ] 8.2 Run `npm run lint`, `npm run check`, `npm test` (with `TEST_DATABASE_URL` set to the dev branch), `npm run build` and `npm run check:server`, and verify all pass.

## Workflow follow-up

- QA on the dev site is done by an independent agent in the dev-lifecycle QA stage (Playwright specs under `tests/qa`).
- Archive happens automatically on push to `production` once every task above is checked.
