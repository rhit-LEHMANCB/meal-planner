## Context

See proposal.md (Why) and the four delta specs for behavior. Relevant current state:

- `foods` (per-100 g numbers, `user_id` null = shared, `source`/`source_id` columns already exist) and `food_units` (unit → grams) exist; no shared foods are loaded. `recipe_ingredients.food_id` exists but is never written. `food_log` and `nutrition_goals` exist with no code using them.
- `src/lib/domain/units.ts#toGrams` already converts weight units and per-food units (no unit → `each`). `src/lib/domain/nutrition.ts` has `macrosForGrams`, `sumMacros`, `perServing`.
- Recipe saves replace all ingredient rows in one `db.batch` (`recipes.ts`). The forms post parallel arrays (`ingredientAmount`, `ingredientUnit`, …) from `IngredientRows.svelte`, which is shared by add, edit and import review.
- The Neon HTTP driver has no interactive transactions; reads in a load are separate queries.

## Goals / Non-Goals

**Goals:** one pure nutrition engine used by the recipe page, the plan and the Nutrition page; a reproducible USDA seed; no per-request N+1 queries for a week.

**Non-Goals:** storing computed recipe nutrition (it is always derived), trigram or full-text indexes, editing shared foods, matching on import review, a client-side nutrition store.

## Decisions

### 1. USDA seed as a generated data migration

`scripts/usda/build-seed.ts <path-to-unzipped-csv-dir>` reads `food.csv`, `food_nutrient.csv` (nutrient ids 1008 kcal, 1003 protein, 1005 carbs, 1004 fat; missing → 0) and `food_portion.csv`, and writes `drizzle/<next>_usda_sr_legacy.sql` through `drizzle-kit generate --custom --name usda_sr_legacy` (so the journal stays consistent), then fills the file.

- Food ids are deterministic (`uuid` built from a SHA-1 of `usda:<fdc_id>`, version bits set), so `food_units` rows reference them directly and a re-run produces the same file.
- Inserts are multi-row `INSERT … VALUES` in chunks of 500 with `ON CONFLICT DO NOTHING`, split by `--> statement-breakpoint`. Values are written as published, rounded to 2 decimals (columns are `numeric(7,2)`).
- Portions: unit name = the `modifier` before the first comma or parenthesis, lower-cased, mapped through the same unit normalizer the ingredient parser uses (`tablespoon` → `tbsp`, `teaspoon` → `tsp`, `cups` → `cup`). Weight-unit modifiers (`oz`, `lb`, `g`) and `serving`/`nlea serving` are skipped (weights already convert; servings are vague). grams per unit = `gram_weight / amount`. First portion per (food, unit) by `seq_num` wins. `each` is added from medium, then large, then small when the food has no `each`, `piece` or `unit` portion of its own (then those map to `each`).
- The raw CSV is not committed (6 MB zip, 36 MB nutrients); the script, a short README with the dataset URL and version (`FoodData_Central_sr_legacy_food_csv_2018-04`) and the generated SQL are.

*Alternatives:* a seed script run by hand (rejected at interview: two manual steps, dev and prod could drift); runtime import from the USDA API (needs a key, network at runtime).

A unique index `foods_source_source_id_unique` on `(source, source_id)` is added in its own schema migration before the seed (custom foods have null `source_id`, and nulls are distinct).

### 2. Schema

- `recipe_ingredients.grams numeric(9,2)` nullable: the per-row weight override.
- `food_log.logged_at timestamptz not null default now()`, so a day's log entries list in the order logged. No other change to `food_log` or `nutrition_goals`. `food_log.servings` holds recipe servings; for a food log entry the row stores `food_id`, `servings` = 1, and the amount and unit go in `label` ("Apple · 1 each"), since the table has no quantity column. Adding columns was considered; the label is display-only and the macros are already snapshotted, so it is not needed.

### 3. Pure engine in `src/lib/domain/nutrition.ts`

- `ingredientGrams(row, foodUnits)`: `toGrams` first, then `row.grams`; null when neither.
- `recipeNutrition(rows, foodsById, servings)` → `{ perServing: Macros, counted, total, partial }`. Rows without a name are ignored; a row counts when it has a visible food and grams.
- `entryNutrition(entry, recipeNutritionById, foodsById)` for cook / leftover / food entries → `{ macros, partial, kind: 'planned' | 'leftover' }`.
- `dayTotals(days, entries, logs)` → per day `{ planned, leftover, logged, total, partial }`; `weekAverage(dayTotals)` averages days with any entry; `goalProgress(total, goals)` → left/over and percentages.
- Rounding only at display (`format.ts`): kcal to whole numbers with thousands separators, grams to whole grams.

All with Vitest specs covering the spec scenarios.

### 4. Loading data for a week without N+1

`getNutritionStore()` (`src/lib/server/nutrition.ts`, owner id on every method):

- `weekInputs(userId, monday)`: planned entries for the week (through `meal_plans.user_id`), the set of recipe ids they use (cooks and leftovers' batch recipes), those recipes' `servings` and ingredient rows (filtered by `recipes.user_id`), and every food referenced by those rows or by food entries with their units (filtered by the visible-foods rule). Four queries regardless of week size; the engine does the rest.
- `logsForWeek`, `logFood`, `logRecipe`, `removeLog`, `getGoals`, `saveGoals` (upsert on `user_id`). `logRecipe` computes the snapshot from the same engine using the user's own recipe, so a log is never taken from client numbers. Delete is `DELETE … WHERE id = ? AND user_id = ?`; zero rows → not found.

The plan page load calls `weekInputs` too (it already loads the week) to show day totals; the recipe detail load computes `recipeNutrition` from the recipe's rows plus a foods lookup.

### 5. Food links on the forms

- `IngredientRows.svelte` gets an opt-in `nutrition` prop (true on add and edit, false on import review, so the review stays unchanged). Each row posts two more parallel fields: `ingredientFoodId` (uuid or empty) and `ingredientGrams`. A row shows its linked food name, a "Suggested: X — Use / Dismiss" chip, or a "Match food" button opening a small search popover that calls the existing `GET /plan/foods?q=` endpoint.
- Suggestions: the edit/add load sends nothing extra; the client asks `GET /recipes/food-suggestions?names=…` (owner-scoped, under `/recipes` so it is not public) once after hydration for rows with a name and no link. The server builds a query per name with `suggestQuery(name)` (pure, in `src/lib/domain/food-match.ts`: drop amounts, prep words and adjectives in a small stop list such as "chopped", "diced", "fresh", "large", "yellow"; singularize) and returns the top search hit or nothing. Dismissed suggestions are remembered only for the form's lifetime.
- The grams field appears when the client can see that the amount does not convert: the food option returned by search carries its units, so the client runs the same `ingredientGrams` check. The server re-validates everything: `recipe-form.ts` parses `foodId` (uuid or empty) and `grams` (0 < g ≤ 100,000, optional); `RecipeStore.create/update` verifies every linked food is visible to the user in one query before the write batch and returns a row-level "food not found" error otherwise.

### 6. Search ranking

`FoodStore.search` keeps the "every word matches" filter but matches each word as `ILIKE '%stem%'` where `stem` is the word with a trailing `es`/`s` removed (so "eggs" → "egg", "tomatoes" → "tomato"), and orders by own first, then `lower(name) LIKE first_stem || '%'`, then `length(name)`, then name. About 7,800 rows: a sequential scan with ILIKE is a few milliseconds on Neon; no index is added.

### 7. Nutrition page

`/nutrition?week=<Monday>` reuses `parseWeekParam` and the plan's week controls (redirect to the canonical Monday as the plan does). Actions `log`, `remove`, `goals` post to `?week=<Monday>&/name` with a hidden `week` field, like the grocery page. The log form has a Food / Recipe switch; the food picker reuses the plan's food search and unit select. Chart: a plain stacked bar chart in HTML/CSS (no chart library), planned, leftovers and logged as three colors from `layout.css` tokens, dashed goal line, values labelled for screen readers through a visually hidden table. Layout follows the Nutrition mockup minus the Week/Month toggle.

## Risks / Trade-offs

- [Seed migration is ~3 MB of SQL and runs inside drizzle's migration transaction] → chunked statements; rehearsed on the Neon `dev` branch through the normal develop merge before production; `ON CONFLICT DO NOTHING` makes a retry safe.
- [USDA names are terse ("Onions, raw"), so suggestions are often imperfect] → suggestions are never saved without the user accepting; ranking prefers shorter names, which tend to be the plain raw food.
- [Planned totals are live, so editing a recipe rewrites history for past days] → accepted; only log entries are snapshotted (spec).
- [Weekly load does more work on the plan page] → fixed four extra queries, no per-entry queries.
- ["Today" uses server UTC] → same as the plan (known issue #31); not fixed here.
- [Food log label carries amount text] → display only; macros are the stored truth.

## Migration Plan

1. Migration A (schema): `recipe_ingredients.grams`, unique index on `foods (source, source_id)`. Additive.
2. Migration B (data): USDA foods and units. Additive inserts only, so `check:migrations` passes.
3. Merging to `develop` runs both on the Neon `dev` branch; merging to `production` runs them on production before or while the new code rolls out. Old code ignores the new column and simply sees more shared foods in search.
4. Rollback: revert the code; the column and rows are harmless. Removing the USDA rows later would be a separate `-- allow-destructive` migration.
