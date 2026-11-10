# Design

## Context

The schema already has `meal_plans`, `planned_meals`, `leftover_batches`, `foods` and `food_units` (migration 0000). No code reads or writes them yet, and every table is empty on dev and production.
- `planned_meals.recipe_id` is `NOT NULL`, so a food entry cannot be stored.
- Nothing links a batch to the cook that made it.

The app talks to Neon through `drizzle-orm/neon-http`, which has no interactive transactions. `db.batch([...])` runs several statements in one transaction, but a later statement cannot depend on what an earlier one returned. Recipe access goes only through `makeRecipeStore(db)` (owner id on every method). Integration specs run against the Neon `dev` branch through `TEST_DATABASE_URL`.

Mockups: canvas https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5, row "Weekly plan and leftovers": `Plan`, `Picker`, `PlanPhone`, `Leftovers`. The app keeps its existing layout and nav. On phones that nav stacks above the page; the mockup's bottom tab bar is not built.

## Goals / Non-Goals

**Goals:**
- One store per area, each owner-filtered: `makePlanStore(db)` for plans, entries and batches, and `makeFoodStore(db)` for foods. Routes never query these tables directly.
- Free servings stay correct under concurrent requests without switching database drivers.
- Week math, slot ordering, eat-by and batch state live in pure functions with Vitest specs.

**Non-Goals:**
- Optimistic UI or live updates between tabs. Each action reloads the page data.
- Calories, grocery lists and food logging, even though the data now allows them.

## Decisions

### Data model (one additive migration)

| Table | Change | Why |
| --- | --- | --- |
| `planned_meals` | `recipe_id` drops `NOT NULL`; add `food_id uuid → foods`, `quantity numeric(9,3)`, `unit text` | Food entries. `DROP NOT NULL` is additive (old code never writes the table). |
| `planned_meals` | add `position integer not null default 0`, index on `leftover_batch_id` | Keeps entries in the order added; finds a batch's draws quickly. |
| `leftover_batches` | add `cook_meal_id uuid → planned_meals` (unique, nullable), `thrown_out_at timestamptz`; index on `user_id` | Links batch and cook; records throw-out. Circular FK uses `AnyPgColumn`. |
| `meal_plans` | unique index `(user_id, week_start)` | Lets the week row be upserted. |
| `foods` | index on `user_id` | Custom food lookups. |

Entry kinds are derived from the columns, with no new enum:
- **cook**: `recipe_id` set, `is_leftover = false`, and a batch whose `cook_meal_id` is this row. `servings` holds the servings eaten at the meal; the batch's `servings_cooked` holds the servings cooked.
- **leftover**: `is_leftover = true`, `leftover_batch_id` set, `recipe_id` = the batch's recipe (so recipe delete and display need no extra join), `servings` = servings drawn.
- **food**: `food_id`, `quantity` and `unit` set; `recipe_id` null.

`leftover_batches.servings_remaining` holds the **free** servings: spare minus drawn. Spare = `servings_cooked − cook.servings`.

Alternatives:
- A `kind` enum column: rejected. It duplicates what the columns say and needs `CREATE TYPE`.
- Computing free servings with a `SUM` on every read: rejected, because a check-then-insert races.

### Concurrency: single-statement conditional writes

Each operation that changes free servings is one SQL statement:
- **Draw:** a CTE that decrements the batch and inserts the leftover only if the decrement matched. Its shape is `WITH b AS (UPDATE leftover_batches SET servings_remaining = servings_remaining - $n WHERE id = $batch AND user_id = $uid AND thrown_out_at IS NULL AND servings_remaining >= $n RETURNING id, recipe_id) INSERT INTO planned_meals (...) SELECT ... FROM b RETURNING id`.
- **Edit a leftover:** the same pattern, with the delta.
- **Edit a cook:** `UPDATE ... SET servings_remaining = servings_remaining + $delta WHERE ... AND servings_remaining + $delta >= 0`, in a batch with the meal update.

The UPDATE takes the row lock. A concurrent second UPDATE re-checks its `WHERE` after the first commits (READ COMMITTED), so it matches no row and inserts nothing. No rows back means "not enough free servings, or not found", which the store tells apart with one follow-up read only to choose the error message.
- **Remove a leftover:** delete and give the servings back in one CTE.
- **Add a cook:** upsert the week, insert the meal, insert the batch. One `db.batch`, with ids generated in code (`crypto.randomUUID()`) so the statements don't depend on each other's results.

Alternative: the WebSocket `Pool` driver with real transactions. Rejected for this change because CTEs cover every case. The CLAUDE.md note stays as the way out if a later flow needs one.

### Ownership checks

- `planned_meals` has no `user_id`. Every entry query joins `meal_plans` and filters `meal_plans.user_id = $uid`. Writes that name an entry use a `WHERE id = $id AND plan_id IN (SELECT id FROM meal_plans WHERE user_id = $uid)` subquery. Per the CLAUDE.md Drizzle note, the outer table name is written out by hand in correlated subqueries.
- Adding a cook checks the recipe is the user's in the same statement (`INSERT ... SELECT ... FROM recipes WHERE id = $rid AND user_id = $uid`).
- Food reads use `user_id = $uid OR user_id IS NULL`, and writes only `user_id = $uid`.
- An id that is not a UUID is treated as not found before any query (same `UUID` regex as the recipe store).

### Domain module `src/lib/domain/plan.ts` (pure, Vitest)

- `mondayOf(date)`, `weekDays(monday)`, `addDays`, `parseWeekParam(value, today)`. ISO dates as `YYYY-MM-DD` strings, computed in UTC so there is no time-zone drift.
- `SLOTS` and `slotIndex`.
- `isAfterCook(cook, slot)`: compares dates, then slot order.
- `eatByFor(cookedOn)` = +4 days. `isPastEatBy(batch, date)`.
- `batchState(batch, draws, today)` returns `fridge | finished | thrown_out`.
- Form parsers with zod for cook, leftover, food and custom food inputs, with field errors like `parseRecipeForm`.

### Routes and UI

- `/plan/+page.server.ts`:
  - `load` returns:
    - the week's entries, grouped by date and slot
    - the user's recipes (`id`, `title`, `servings`) for the shelf and Recipe tab
    - the batches in the fridge with their draws, and each batch's cook date and slot for the Leftover tab's after-cook filter
  - Actions: `addCook`, `addLeftover`, `addFood` (optionally creates the food first), `updateEntry`, `removeEntry` (with `confirm=1` for a cook with draws; without it, it fails with the list of draws so the UI can show the confirmation).
- `/plan/foods/+server.ts`: `GET ?q=` returns up to 20 foods with their units as JSON. It's under `/plan` so the hook's auth applies; `/api/*` is public.
- Components in `src/lib/components/plan/`:
  - `WeekGrid.svelte` (md and up) and `DayList.svelte` (below md), both rendering `SlotEntry.svelte`.
  - `AddDialog.svelte`: native `<dialog>`, tabs as `role="tablist"` buttons, one `<form method="POST" action="?/…" use:enhance>` per tab.
  - `RecipeShelf.svelte`, `FridgePanel.svelte`.
- Drag-and-drop uses HTML5 `draggable` on shelf chips with `dragover`/`drop` on slot cells. A drop only opens `AddDialog` with the slot and recipe preset. The shelf and drop targets render at `md` and up only.
- "This week" and the today highlight: the server defaults to the UTC date. After hydration, the page computes the local date, and if it is in a different week with no `?week`, it navigates to it. A small effect does this; recorded as a risk.
- `/leftovers`: `load` lists fridge batches and those that left the fridge in the last 14 days. A `throwOut` action sets `thrown_out_at = now()` and `servings_remaining = 0`. The confirm is an inline `<dialog>` like recipe delete.
- Recipe delete:
  - `RecipeStore.get` also returns `plannedCount` so the confirm text can say "on N planned meals".
  - `remove` becomes one `db.batch`: delete `planned_meals` with that `recipe_id` (cooks and leftovers; leftovers carry the batch's recipe id), then delete `leftover_batches` with that `recipe_id`, then the recipe. The `cook_meal_id` FK is `ON DELETE SET NULL` so statement order works.
  - This is the one place the recipe store touches plan tables; it's documented in the store.

## Risks / Trade-offs

- [A leftover drawn from a thrown-out batch keeps its servings on the plan] → Shown as "gone" (batch `thrown_out_at` set). No servings are given back.
- [Server's UTC "today" differs from the browser's near midnight] → The client corrects the default week after hydration. An explicit `?week` is never changed.
- [Drag-and-drop is hard to test reliably] → The drop only opens the dialog. Playwright `dragTo` covers it on desktop, and every path also works through Add.
- [CTE SQL written with drizzle's `sql` template loses some type safety] → Covered by integration specs on the Neon `dev` branch, including a parallel double-draw test.
- [Recipe store now deletes plan rows] → One documented exception, tested by an integration spec.
- [Eat-by fixed at 4 days] → One constant in the domain module; editing eat-by is a later change.

## Migration Plan

1. `npm run db:generate` after the schema edits. `npm run check:migrations` must pass: the migration only adds columns, indexes and an FK, and drops a `NOT NULL`.
2. Merging to `develop` runs the migration on the Neon `dev` branch; merging to `production` runs it there. The tables are empty, so the unique index cannot fail.
3. Rollback: revert the code. The extra nullable columns and indexes are harmless to the old code.
