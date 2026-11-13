## Why

The app plans meals but says nothing about what they add up to: recipes have no calories, the plan has no day totals and `/nutrition` is a placeholder. The `foods`, `food_log` and `nutrition_goals` tables already exist, but the shared foods table is empty and ingredients are not linked to foods, so there is no source for the numbers yet.

## What Changes

- Seed the shared foods with the USDA FoodData Central **SR Legacy** dataset (about 7,800 foods, public domain): kcal, protein, carbs and fat per 100 g, plus household portions (cup, tbsp, medium…) as food units. A committed generator script turns the USDA CSV into an additive data migration, so the foods reach dev and production through the normal migrate workflow.
- Recipe ingredient rows can be linked to a food on the add and edit forms. Unlinked rows get a suggested food from a name search that the user confirms, changes or clears; nothing is linked until the recipe is saved. When the row's unit does not convert to grams through weight units or the food's units, the row asks for its weight in grams.
- Recipes get nutrition per serving computed from linked rows, shown on the recipe page, with a "partial" note when some rows have no nutrition.
- The plan shows a calorie total for each day (cooks, leftovers and food entries), with the same partial marker.
- A real `/nutrition?week=<Monday>` page: today's calories and macros against goals, calories by day for the week split into planned, leftovers and logged with the goal line, weekly average, a quick log for off-plan foods or recipes, the week's log entries, and editable daily goals.
- Log entries snapshot their calories and macros when logged; planned totals are computed live.
- Food search ranks results for the larger shared set (the user's own foods still first).

## Capabilities

### New Capabilities

- `nutrition`: how calories and macros are computed for ingredients, recipe servings, planned meals and days; the Nutrition page; the food log; daily goals.

### Modified Capabilities

- `foods`: shared foods now come from USDA SR Legacy with their portions as units, and search keeps working (and ranks sensibly) over thousands of shared foods.
- `recipes`: ingredient rows can be linked to a food and carry an optional weight in grams; the recipe page shows nutrition per serving.
- `meal-plan`: each day shows its calorie total.

## Impact

- Schema (additive): `recipe_ingredients.grams` (nullable); unique index on `foods (source, source_id)`; a large data migration inserting USDA foods and `food_units` (a few MB of SQL).
- New: `scripts/usda/` generator (reads a downloaded CSV, writes the migration; not part of the build), `src/lib/domain/nutrition.ts` extensions and `food-match.ts` (pure, with specs), `src/lib/server/nutrition.ts` store (`getNutritionStore()`), `/nutrition` route with actions, a food-match control in `IngredientRows.svelte`, a day total on the plan grid.
- Changed: `src/lib/server/recipes.ts` (save and load food links and grams), `src/lib/server/foods.ts` (search ranking, nutrition lookup), plan load (per-day totals).
- No new dependencies, secrets or environment variables. Import review and the grocery list are unchanged.
