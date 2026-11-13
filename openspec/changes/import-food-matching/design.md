## Context

See proposal.md (Why) and the two delta specs. Current state after the `nutrition` change:

- `recipe_ingredients.food_id` and `grams` exist. `IngredientRows.svelte` has a `nutrition` mode on the add and edit forms, with linking, name-search suggestions (`GET /recipes/food-suggestions`) and a grams field shown when `needsGrams`. The import review uses `RecipeForm` without `nutrition`.
- Import runs through `makeImporter` (`src/lib/server/ai/import.ts`): `startImport` (10 s spacing), then `reserveAi` / `refundAi` for AI parsing only. Schema.org links skip both reserve and model. `respond` in the import route turns the `ImportDraft` into `RecipeFormValues` plus `ReviewInfo`.
- Nutrition math is pure in `src/lib/domain/nutrition.ts` (`amountGrams`, `ingredientGrams`, `recipeNutrition`), and the browser can import it.
- `FoodStore.search` ranks own foods first, then names starting with the first word, then shorter names. `suggestQuery` cleans ingredient names.

## Goals / Non-Goals

**Goals:** one bounded, cheap model call per matching run; the model can only pick ids the server offered; estimates are visible and never silently become the user's numbers; the import and edit flows never fail because matching failed.

**Non-Goals:** AI-estimated nutrition values, AI-created foods, background or batch matching of all saved recipes, matching on the plan or the log, streaming partial matches to the browser.

## Decisions

### 1. Candidates first, then one model call

`src/lib/server/ai/food-match.ts` exports `matchRows(userId, rows)`.

- **Candidate search.** For each row, up to 100 rows, it calls `FoodStore.search(userId, suggestQuery(name), 8)`. A new optional `limit` argument (default 20) caps the results. At most 8 searches run at once.
- **Request.** Rows go to `claude-haiku-5-5` in one tool call, `save_matches`. Each row carries its index, the line as written, quantity, unit and name, and its candidates.
  - Candidates are labelled with short per-request keys (`r3c1` … `r3c8`) instead of uuids. This keeps tokens down, and a key the model invents simply does not resolve.
  - Each candidate carries only its name and unit names: no ids, no numbers.
- **Answer.** The tool returns `matches: [{ row, candidate: string | null, grams: number | null }]`. A lenient Zod salvage keeps each entry on its own; unknown rows or keys are dropped.
- **Mapping back.** The server maps keys back to food ids from its own table. The table holds only foods the search returned, which are visible to the user by construction.
- **Prompt.** The system prompt follows the parser's rules:
  - the material is data;
  - choose the candidate that is the same food in the same state (raw versus cooked) or none;
  - estimate the weight in grams of the amount as written, including a typical amount when no amount is given;
  - never estimate nutrition.
- **Limits.** 30 s timeout, no retry: a failed match is not worth a second call.

*Alternatives:* the model names a food and the server searches it (rejected at interview: the hit may not be what the model meant); sending uuids (more tokens, and invented ids look plausible); a call per row (cost, latency).

### 2. Which estimates are kept: pure `applyMatches`

`src/lib/domain/food-match.ts` gains `applyMatches(rows, matches, mode)`. It is pure and has specs.

- **Food.** The food is set only when the row has no food and the user has not cleared it in this form. On import every row qualifies; in edit mode, only rows that are unlinked and not cleared.
- **Weight.** An estimate is kept only when `amountGrams(quantity, unit, food)` is null for the chosen (or existing) food, the estimate is finite, and it lies in (0, 5000]. A row the user already gave a weight keeps it.
- **Marker.** A kept estimate sets `grams` and `gramsSource: 'ai'`. A linked food sets `foodMatch: 'ai'`. This display-only marker is not stored, because an AI link is a link once saved.

### 3. Storing the estimate marker

- `recipe_ingredients.grams_source` is new: nullable text, `user` or `ai`.
- `recipe-form.ts` parses a posted `ingredientGramsSource` and keeps `ai` only when grams are present; anything else becomes `user`.
- `IngredientRows` sets the source to `user` as soon as the grams field is edited. The marker is the user's own data, so a client that posts `ai` for typed grams only mislabels their own row.
- `RecipeStore` saves and loads it. `recipeNutrition` reports `estimated`, the number of counted rows whose grams source is `ai`, and the recipe page says "Includes N estimated weights".

### 4. Matching cap, sharing `import_usage`

- **Columns.** `import_usage` gets `match_count integer not null default 0` and `match_day date` (nullable). It is a separate day column, so the AI import day logic (`reserveAi`, `remainingToday`) stays untouched.
- **`reserveMatch(userId)`.** One conditional upsert, like `reserveAi`: it resets the count when `match_day` is not today (UTC) and increments only while under 50. It returns false at the cap.
- **No refund.** A run counts once the model is asked. If the call fails before reaching the model (connection error), the run is refunded, mirroring `refundAi`.
- **Import.** The importer calls `reserveMatch` after a successful parse. `startImport` already covers the 10 s spacing.
- **Edit button.** The button calls `startImport` (shared spacing) and then `reserveMatch`.

### 5. Import flow and review

- After the draft is built, `makeImporter` calls `matchRows` unless the draft has no ingredients.
- The result travels with the draft as `matches` and a `matching` status: `matched`, `limit`, `unavailable` or `none`.
- `respond` applies the matches with `applyMatches` to the form values (food id and name, grams, grams source), adds `matching` to `ReviewInfo`, and sends `foodNutrition` for the linked foods.
- The review renders `RecipeForm` with `nutrition` and a new `preview` flag.
- Status notices:
  - `limit`: "AI matching is unavailable until tomorrow".
  - `unavailable`: "Foods could not be matched right now. You can link them yourself".

### 6. Preview in the browser

- `IngredientRows` (with `preview`) keeps per-row food nutrition: per 100 g plus unit grams.
- Foods linked by the server arrive in `foodNutrition`. Foods the user links through search carry it too, because `GET /plan/foods` results gain `per100g` and `unitGrams`. The added fields are additive, so the plan's Add dialog ignores them.
- The component exposes the current rows to `RecipeForm`, which reads the servings field and shows a small panel: per-serving kcal and macros, "N of M ingredients have no nutrition", or "Add servings to see nutrition".
- The numbers are computed with `recipeNutrition`, the same function the recipe page uses.

### 7. "Match with AI" on the edit form

- `POST /recipes/food-match` is a JSON endpoint under `/recipes`, not the public `/api/*`, and needs a signed-in user.
- **Request:** the form's current rows (name, amount, unit, food id, grams, and whether the user cleared the food), at most 100.
- **Response:** per row, `{ food: FoodOption & nutrition | null, grams: number | null }` after `applyMatches` in edit mode, plus `status`.
- The endpoint never sees or changes the saved recipe, so the edit form only changes in memory.
- The button is disabled while a run is in progress, and shows the status message on failure or at the cap.

## Risks / Trade-offs

- **The model picks a plausible but wrong food (cooked versus raw).** Every match is marked "AI match", the preview makes the effect visible, and candidates are ranked so the plain food is usually among them.
- **Weight estimates can be off by a lot ("1 bunch").** They are marked on the forms and the recipe page, editable, and bounded to 5,000 g.
- **Extra latency on import, about 2 to 5 s with Haiku.** Candidate search runs in parallel, with 8 at a time. The match timeout is 30 s, and on timeout the review is shown without matches.
- **Cost.** One extra Haiku call per import, capped at 50 runs a day per user.
- **Prompt injection through ingredient lines or custom food names.** Both go in a data block, as with parsing. The output can only choose offered keys and numbers that are then bounded.
- **Specs depend on `nutrition` being archived first.** This change's `recipes` delta modifies a requirement that `nutrition` adds. Implementation and merge to `develop` wait until `nutrition` is in production and archived.

## Migration Plan

1. One additive migration: `recipe_ingredients.grams_source`, plus `import_usage.match_count` (default 0) and `match_day`.
2. Merging to `develop` runs it on the Neon `dev` branch, and merging to `production` runs it on production. Old code ignores the new columns.
3. Rollback: revert the code. The columns are harmless.
