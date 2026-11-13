# Tasks

Ships in the same production release as `nutrition` (PR #47). The change name sorts after `nutrition`, so the archive workflow archives `nutrition` first.

## 1. Schema

- [x] 1.1 `schema.ts`: `recipe_ingredients.grams_source` (nullable text), `import_usage.match_count` (integer, not null, default 0) and `match_day` (nullable date). Run `npm run db:generate` and commit. Verify `npm run check` and `npm run check:migrations`.
- [x] 1.2 Apply the migration to the Neon `dev` branch locally for integration specs. Verify `drizzle-kit migrate` succeeds.

## 2. Pure logic

- [x] 2.1 `src/lib/domain/food-match.ts`: `applyMatches(rows, matches, mode)` (import and edit modes; food only on unlinked and not cleared rows; estimate only when the amount does not convert with the chosen food, finite, 0 < g ≤ 5000; `gramsSource: 'ai'`, `foodMatch: 'ai'`). Verify a spec covering every scenario of "AI estimates weights that do not convert" and the edit-mode rules (linked kept, cleared kept, typed weight kept).
- [x] 2.2 `nutrition.ts`: `recipeNutrition` also returns `estimated` (counted rows with `gramsSource` `ai`). Verify specs.
- [x] 2.3 `recipe-form.ts`: parse `ingredientGramsSource` (`ai` kept only with grams, else `user`) into rows and `IngredientInput`; refill values carry it. Verify `recipe-form.spec.ts`.

## 3. Server

- [x] 3.1 `import-usage.ts`: `reserveMatch`, `refundMatch`, `DAILY_AI_MATCHES = 50`. Verify `import-usage.integration.spec.ts` on dev: 50 allowed then refused, new UTC day resets, per user, AI import counts untouched.
- [x] 3.2 `FoodStore.search` optional `limit`; `/plan/foods` results add `per100g` and `unitGrams`. Verify the foods integration spec and that the plan Add dialog specs still pass.
- [x] 3.3 `src/lib/server/ai/food-match.ts`: candidate search (8 per row, 100 rows, 8 concurrent), `save_matches` tool call to `claude-haiku-5-5` with per-request keys, lenient salvage, 30 s timeout, error classification (reached model or not). Verify a unit spec with a fake client: keys map to the right foods, unknown keys and rows are dropped, out-of-range grams are dropped by `applyMatches`, a thrown error gives `unavailable`, the prompt puts rows and candidate names inside the data block.
- [x] 3.4 `RecipeStore`: save and load `grams_source`. Verify `recipes.integration.spec.ts` (an `ai` estimate survives save and reload; a `user` weight stays `user`).

## 4. Import flow

- [ ] 4.1 `makeImporter`: after a successful parse from any source, `reserveMatch` then `matchRows`; carry `matches` and `matching` status (`matched` / `limit` / `unavailable` / `none`); refund when the call never reached the model. Verify `import.spec.ts`: structured link matched without `reserveAi`, cap reached gives `limit` with the draft intact, matching failure gives `unavailable` with the draft intact.
- [ ] 4.2 Import route `respond`: apply matches to form values, add `matching` to `ReviewInfo`, send `foodNutrition`. Verify `import.spec.ts` route cases.

## 5. UI

- [ ] 5.1 `IngredientRows.svelte`: "AI match" marker on linked rows, "AI estimate: N g" on grams with `gramsSource` posted and switched to `user` on edit, a `preview` mode keeping per-row food nutrition and exposing rows; cleared rows remembered so suggestions and AI never refill them. Verify component specs.
- [ ] 5.2 `RecipeForm.svelte`: `preview` panel (per serving, partial count, needs-servings), "Match with AI" button on the edit page calling `POST /recipes/food-match` and applying the result in memory, status messages. Verify component specs with a stubbed fetch.
- [ ] 5.3 Import review page: `nutrition` and `preview` on, matching notices. Verify a page spec for `matched`, `limit` and `unavailable`.
- [ ] 5.4 `POST /recipes/food-match`: signed-in, own data only, 100 rows max, `startImport` spacing, `reserveMatch`, `applyMatches` in edit mode. Verify a route spec (signed out, cap, cooldown, shape).
- [ ] 5.5 Recipe page: "Includes N estimated weights" note. Verify `pages.spec.ts`.

## 6. Docs and checks

- [ ] 6.1 `CLAUDE.md`: the model parses, chooses among candidate foods and estimates marked weights; per-100 g numbers never from the model; the matching cap; the endpoint. Verify it matches the code.
- [ ] 6.2 Run `npm run lint`, `npm run check`, `npm test` (with `TEST_DATABASE_URL` on dev), `npm run build`, `npm run check:server`. Verify all pass.
