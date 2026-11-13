## Why

After the `nutrition` change, an imported recipe has no nutrition until the user links every ingredient by hand on the edit form, and amounts such as "1 bunch cilantro" or "salt to taste" never count unless the user types a weight. Using the AI that already parses imports to choose foods and estimate those weights gives imported recipes useful numbers immediately, while the per-100 g values still come only from the foods table.

## What Changes

- After an import is parsed (any source: link with or without schema.org data, pasted text, photo), the server finds up to 8 candidate foods per ingredient row and asks the model, in one call, to pick one candidate or none per row and to estimate the row's weight in grams. Only ids that were among that row's candidates, and that the user can see, are accepted.
- An AI weight is kept only where the amount does not convert through weight units or the chosen food's units, including rows with no amount, and must be above 0 and at most 5,000 g. It is stored as the row's grams and marked as an AI estimate; editing it makes it the user's own.
- **BREAKING (spec):** the import review now shows food links and a per-serving nutrition preview. Rows arrive pre-linked and marked "AI match", with the same change, clear and grams controls as the edit form. This reverses "the review shows no calories, macros or matched foods".
- The edit form gets a "Match with AI" button that fills only unlinked rows and rows without a weight, never touching links, clears or weights the user set.
- A separate cap of 50 AI matching runs per user per UTC day (import and edit combined) plus the existing 10 s spacing. Matching never counts toward the 20 AI imports a day. Over the cap, or when the AI fails, the import or edit continues without matches and says so.
- The recipe page says how many of its weights are AI estimates. The forms show "AI estimate: N g".
- The project rule becomes: the model parses, chooses among candidate foods and estimates weights (marked); per-100 g calories and macros never come from the model.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `recipe-import`: the review shows AI food matches, weight estimates and a nutrition preview; matching runs on every import with its own daily cap; the "content is data" rule allows marked weight estimates and candidate-only food choices.
- `recipes`: saved recipes can be matched with AI from the edit form; AI weight estimates are marked on the forms and the recipe page; the import review is no longer excluded from food links and nutrition.

## Impact

- Schema (additive): `recipe_ingredients.grams_source` (nullable text, `user` | `ai`); `import_usage.match_count` and `match_day` (or the shared `day`) for the matching cap.
- New: `src/lib/server/ai/food-match.ts` (candidate search, one tool-use call to `claude-haiku-5-5`, lenient salvage of the answer), `src/lib/domain/food-match.ts` additions (applying matches to rows, pure, with specs), `POST /recipes/food-match` (signed-in JSON endpoint for the edit button).
- Changed: `src/lib/server/ai/import.ts` and `src/routes/recipes/import/+page.server.ts` (match after parse, review info), `src/lib/server/import-usage.ts` (matching cap), `IngredientRows.svelte` (AI match and estimate markers, preview, Match with AI), recipe form parsing and `RecipeStore` (grams source), `/plan/foods` results carry per-100 g numbers and unit weights for the preview, the recipe page note, `CLAUDE.md`.
- Depends on the `nutrition` change being in production and archived first: this change modifies requirements that `nutrition` adds to `recipes`.
- No new dependencies or secrets (uses the existing `ANTHROPIC_API_KEY`). More model calls per import: one extra cheap call.
