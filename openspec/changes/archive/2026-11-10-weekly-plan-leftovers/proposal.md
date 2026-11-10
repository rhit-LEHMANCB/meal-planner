# Proposal

## Why

The app can store and import recipes, but `/plan` and `/leftovers` are still placeholders, so it cannot yet plan a week. Planning, with leftovers that come out of a cook, is the core of the app: the grocery list and nutrition tracking both build on it.

## What Changes

- `/plan` becomes a Mon–Sun week grid. Each day has breakfast, lunch, dinner and snack slots, and each slot can hold several entries. The week is in the address (`?week=<Monday>`), with previous, next and "This week" controls. Phones get a day-by-day list.
- A slot entry is one of three kinds:
  - **Cook:** a recipe, with servings cooked and servings eaten at that meal. A cook creates a leftover batch with the spare servings, eat by 4 days after cooking.
  - **Leftover:** servings drawn from a batch that has enough free servings, in a slot after the cook. Slots past eat-by are allowed and flagged.
  - **Food:** an amount and unit of a food.
- Adding goes through an "Add" dialog with Recipe, Leftover and Food tabs, opened from any slot. On desktop you can also drag a recipe from the recipe shelf onto a slot, which opens the dialog ready to add a cook.
- Entries can be edited, keeping counts consistent, and removed. Removing a cook whose leftovers are planned asks for confirmation and removes those leftovers and the batch too.
- The Food tab searches your own foods plus shared foods. When nothing matches, it creates a custom food (name and kcal, protein, carbs and fat per 100 g) in the same step.
- `/leftovers` lists batches still in the fridge (cooked date, eat-by, counts, free servings, planned draws), lets you throw a batch out after confirming, and lists batches finished or thrown out in the last two weeks.
- Deleting a recipe that is on the plan says how many planned meals use it, and on confirmation removes those meals and the recipe's batches.
- Out of scope: calories on the plan, grocery list generation, food logging, editing eat-by, batches cooked off the plan, copying a week, importing foods.

## Capabilities

### New Capabilities

- `meal-plan`: the weekly plan. Weeks, slots, cook, leftover and food entries, adding (dialog and drag-and-drop), editing, removing, and privacy of plans.
- `leftovers`: leftover batches made by cooks. Free servings, draw rules (after the cook, never more than free, eat-by warning), the leftovers page and throwing a batch out.
- `foods`: the user's own foods next to shared foods. Search, creating a custom food, the units a food can be measured in, and privacy of custom foods.

### Modified Capabilities

- `recipes`: deleting a recipe that is on the plan warns with the number of planned meals and also removes them and its leftover batches.

## Impact

- Database: one additive migration.
  - `planned_meals`: `recipe_id` becomes nullable; add `food_id`, `quantity` and `unit`.
  - `leftover_batches`: add `cook_meal_id` and `thrown_out_at`.
  - Add a unique index on `meal_plans (user_id, week_start)` and lookup indexes.
- New server modules:
  - `src/lib/server/plan.ts` (plan and leftover store, owner-filtered).
  - `src/lib/server/foods.ts`.
  - Pure domain code in `src/lib/domain/plan.ts` with Vitest specs.
- Routes:
  - `src/routes/plan` (load plus form actions, and a food search endpoint under `/plan`).
  - `src/routes/leftovers`.
  - Recipe detail delete confirm text and the recipe store's `remove`.
- No new secrets, environment variables or dependencies.
