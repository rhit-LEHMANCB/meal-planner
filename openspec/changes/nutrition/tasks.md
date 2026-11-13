# Tasks

## 1. Schema and USDA seed

- [x] 1.1 Edit `src/lib/server/db/schema.ts`: `recipe_ingredients.grams` (numeric 9,2, nullable) and a unique index `foods_source_source_id_unique` on `foods (source, source_id)`. Run `npm run db:generate`, commit the files. Verify `npm run check` and `npm run check:migrations` pass.
- [x] 1.2 Add `scripts/usda/build-seed.mjs` and `scripts/usda/README.md` (dataset URL and version, how to regenerate). It reads the unzipped SR Legacy CSV directory and writes the custom migration created by `drizzle-kit generate --custom --name usda_sr_legacy`: deterministic food ids, kcal/protein/carbs/fat per 100 g (missing → 0, clamped to the custom-food limits), portions mapped to units through the ingredient unit normalizer, weight and serving portions skipped, `each` from medium/large/small or piece/unit, chunks of 500 with `ON CONFLICT DO NOTHING`. Put the pure mapping (portion → unit, each choice, id) in a module with a Vitest spec. Verify the spec, that a second run produces an identical file, and that the file has 7,793 foods.
- [x] 1.3 Apply both migrations to the Neon `dev` branch locally (`DATABASE_URL_UNPOOLED=$(neon connection-string dev …) npx drizzle-kit migrate`). Verify it succeeds and `select count(*) from foods where source = 'usda'` is 7,793.

## 2. Nutrition engine (pure)

- [x] 2.1 Extend `src/lib/domain/nutrition.ts` with `ingredientGrams`, `recipeNutrition`, `entryNutrition`, `dayTotals`, `weekAverage` and `goalProgress`. Verify `nutrition.spec.ts` covers every scenario in the nutrition spec's computation requirements (weight unit, food unit, each, row grams, full, partial, nothing linked, cook/leftover/food day, average skipping empty days, left and over).
- [x] 2.2 Add `src/lib/domain/food-match.ts` (`searchStem`, `suggestQuery`) with a spec: "eggs" → "egg", "tomatoes" → "tomato", "1 yellow onion, diced" → "onion", prep words dropped.
- [x] 2.3 Add `src/lib/domain/nutrition-form.ts` (zod): goals ranges, log food (food uuid, amount > 0, unit, date in the week, optional slot), log recipe (recipe uuid, servings > 0 up to 99, date, slot), log entry id. Verify `nutrition-form.spec.ts` for each limit and error message.
- [x] 2.4 Extend `format.ts` with kcal and gram formatting (whole numbers, thousands separators). Verify specs.

## 3. Foods and recipes on the server

- [x] 3.1 `FoodStore.search`: stem each word and rank own first, name-starts-with-first-word, shorter, name. Add `nutritionFor(userId, ids)` returning per-100 g values and unit grams for visible foods. Verify `foods.integration.spec.ts` on dev: plural "eggs" finds an egg food, "rice" ranking, another user's custom food never returned by `nutritionFor`.
- [x] 3.2 `recipe-form.ts`: parse `ingredientFoodId` and `ingredientGrams` per row (uuid or empty; 0 < grams ≤ 100,000, optional) with row errors. Verify `recipe-form.spec.ts`.
- [x] 3.3 `RecipeStore`: save `food_id` and `grams`; before the write batch, check all linked foods are visible to the user (one query) and return a row-level not-found otherwise; return them from `get`. Verify `recipes.integration.spec.ts`: link saved and reloaded, cleared link, another user's custom food refused and nothing written.
- [x] 3.4 `GET /recipes/food-suggestions?names=` (signed-in only, at most 50 names, each through `suggestQuery` and `search`, top hit or null). Verify a route spec for signed-out (redirect/401), the cap, and the response shape.

## 4. Recipe forms and detail page

- [x] 4.1 `IngredientRows.svelte`: `nutrition` prop; per row linked food name, suggestion chip (Use / Dismiss), Match food search popover (uses `/plan/foods?q=`), clear link, grams field shown when the amount does not convert, hidden `ingredientFoodId` and `ingredientGrams` fields. Enabled on add and edit, off on import review. Verify `IngredientRows.svelte.spec.ts`: suggestion not posted until accepted, grams field shown only when needed, review mode renders no food controls.
- [x] 4.2 Recipe detail page: per-serving kcal, protein, carbs, fat, partial note "N of M ingredients have no nutrition" or "No nutrition yet", and a counts / no nutrition marker per ingredient. Verify `pages.spec.ts` (or a component spec) for full, partial and none.

## 5. Nutrition store and plan totals

- [x] 5.1 `src/lib/server/nutrition.ts` `makeNutritionStore(db)` / `getNutritionStore()`: `weekInputs`, `logsForWeek`, `logFood`, `logRecipe` (snapshot from the engine), `removeLog`, `getGoals` (defaults when no row), `saveGoals` (upsert). Every method takes the owner id. Verify `nutrition.integration.spec.ts` on dev: week inputs only for the owner, fixed query count, snapshot unchanged after a recipe edit, another user's log entry and recipe behave as missing, goals default and upsert.
- [x] 5.2 Plan page: compute day totals in the load with `weekInputs` + `dayTotals` (planned and leftovers only) and show them in `WeekGrid.svelte` and `DayList.svelte` (kcal, partial marker, nothing for an empty day). Verify a component spec for total, partial and empty day.

## 6. Nutrition page

- [x] 6.1 `src/routes/nutrition/+page.server.ts`: load (week param and redirect, totals, average, today, goals, logs) and actions `log`, `remove`, `goals` posting to `?week=<Monday>&/name` with a hidden `week`, using `requireUserId` and the stores only. Verify `page.server.spec.ts` for the load assembly and action errors.
- [x] 6.2 `+page.svelte` following the Nutrition mockup without the Month toggle: week controls, today card, macros today, stacked calories-by-day chart with goal line and an accessible table, weekly average, logged entries by day with delete, quick log form (Food / Recipe), goals form, empty state, USDA credit. Verify a component spec for today/over, empty week and partial day, and `npm run lint`.

## 7. Docs and checks

- [ ] 7.1 Add a "Nutrition" section to `CLAUDE.md` (engine in `nutrition.ts`, store, USDA seed regeneration, live vs snapshotted numbers) and update the "Grocery list" note that ingredients are not linked to foods (they now can be; the grocery list still does not use grams). Verify it matches the code.
- [ ] 7.2 Run `npm run lint`, `npm run check`, `npm test` (with `TEST_DATABASE_URL` on dev), `npm run build` and `npm run check:server`. Verify all pass.
