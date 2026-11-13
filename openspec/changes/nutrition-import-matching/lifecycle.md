# Lifecycle: nutrition-import-matching

(Renamed from `import-food-matching` at Gate A so the archive workflow, which works alphabetically, archives `nutrition` first: this change modifies a `recipes` requirement that `nutrition` adds.)

- Branch: `feature/import-food-matching`
- Stage: 7 Production PR (Gate B), combined with `nutrition` in PR #47
- Review round: 1 of 3
- QA cycle: 1 of 3
- Started: 2026-11-13

Request (user, 2026-11-13): "make it so that the import feature uses AI to attempt to match ingredients and convert best guess conversions". Builds on the `nutrition` change (food links, grams on rows), which is at Gate B in PR #47 and already on `develop`.

## Interview summary

Approved: yes (user confirmed 2026-11-13)

**Goal.** When a recipe is imported, and on request for a saved recipe, use AI to link each ingredient row to a food and to estimate a weight in grams where the amount cannot be converted, so imported recipes have nutrition right away. Calorie and macro values per 100 g still come only from the foods table; the model only chooses among real foods and estimates weights, and every estimate is visibly marked.

**Scope.**
- *Matching:* after parsing, the server searches up to about 8 candidate foods per ingredient row (the user's own foods and the shared USDA foods, through the existing food search) and makes one model call (`claude-haiku-5-5`, tool output) with the rows and their candidates. For each row the model returns one candidate id or none, plus an optional weight estimate. The server accepts only ids that were among that row's candidates and that the user can see.
- *Weight estimates:* used only where the amount does not convert through weight units or the food's own units, including rows with no amount ("salt to taste", "oil for frying"), where the model estimates a typical amount. An estimate must be above 0 and at most 5,000 g, otherwise it is dropped. Estimates are stored in `recipe_ingredients.grams` with a new marker that they are AI estimates. The forms show "AI estimate: 400 g", editable; editing it makes it your own weight. The recipe page says that its nutrition includes N estimated weights.
- *Runs on every import:* link (including schema.org pages, which still parse without AI), pasted text and photo. Matching never counts toward the 20 AI imports a day.
- *Import review:* rows arrive pre-linked and marked "AI match", with the same food controls as the edit form (change, clear, grams). The review shows a per-serving calorie and macro preview that follows your edits. Nothing is saved until "Save to recipe shelf".
- *Saved recipes:* the edit form gets a "Match with AI" button. It fills only unlinked rows and rows without a weight, the same way, and leaves rows you linked, cleared or weighed alone.
- *Cost guard:* a separate cap of 50 AI matching runs per user per UTC day (import and edit combined), plus the existing 10 s spacing. Over the cap, or if the AI fails or times out, the import or edit still works without matches, says matching was unavailable, and falls back to the name-search suggestions.

**Out of scope.** AI-estimated calories or macros of any kind; creating foods from AI output; matching for plan food entries or the quick log; changing the 20 imports a day limit; a newer USDA release.

**Roles and access.** Candidates include only foods the user can see. Their own custom food names are sent to the model only for their own imports. The model never sees another user's data. "Match with AI" works only on the user's own recipes.

**Data (additive).** `recipe_ingredients.grams_source` (nullable text, `user` or `ai`). Matching usage per user and day: either new columns on `import_usage` or a new table, decided in the design.

**Edge cases.**
- The model returns an id that was not a candidate, or an invisible food: ignored, and the row stays unlinked.
- A candidate list is empty: no link, though a weight estimate may still be given.
- Over 100 rows: only the first 100 are matched.
- Timeout or parse failure: no matches, with a notice.
- The user clears an AI match on review: it stays cleared, and the name-search suggestion does not re-fill it.
- An existing link or a weight you typed is never overwritten.

**Security.**
- Recipe content and candidate names are data inside the prompt, as with parsing, and the same prompt-injection rules apply.
- AI ids are validated against the candidates; weights are bounded.
- Every query is filtered by the owner.

**Acceptance (examples).**
- WHEN a user imports a page with "1 lb ground turkey, 1 yellow onion, 1 bunch cilantro, salt to taste" THEN the review shows each row linked (marked AI match), cilantro and salt have AI weight estimates, and the preview shows per-serving kcal.
- WHEN the user changes the onion's food on review and saves THEN the saved recipe has their choice and the recipe page notes 2 estimated weights.
- WHEN a user presses "Match with AI" on a saved recipe with 3 unlinked rows and 2 linked THEN only the 3 are filled.
- WHEN a user has used 50 matching runs today THEN the next import still reaches the review with no matches and a notice.
- WHEN the model returns a food id that was not offered THEN that row is left unlinked.

**Rollout.**
- No new secrets: it uses the existing `ANTHROPIC_API_KEY`. One additive migration.
- The `nutrition` change must reach production and be archived first. This change modifies requirements that `nutrition` adds: "import review shows no nutrition", and the rule that AI values are not used for nutrition. Its delta specs are written against the archived specs.
- `CLAUDE.md` and the recipe-import spec change their rule to: the model parses, matches among candidates, and estimates weights (marked); per-100 g numbers never come from the model.

**Assumptions.**
- Matching is one model call per import or button press, after parsing.
- The review preview is computed in the browser with the same pure nutrition functions, using per-100 g numbers that the server sends for the candidate and linked foods.
- AI estimates count as weights for nutrition (they are not partial), and the recipe page labels them.

## Gate A

Approved: yes, 2026-11-13 (user: "approve, we will just make it one prod release")
Accepted preflight gaps: local Node 22 instead of 24. The `nutrition` dependency is resolved by the user's decision to ship both changes in one production release: this change merges to `develop` and joins PR #47; the rename keeps the archive order right.

## Preflight

Run 2026-11-13. GitHub backend: **gh**.

| Check | Result |
| --- | --- |
| git commit and push to `origin` | OK (branch `feature/import-food-matching` pushed) |
| `gh auth status` with `repo` and `workflow` | OK |
| Playwright `qa` project and browsers | OK (used by the nutrition QA cycles today) |
| QA credentials (`.env.qa`, both accounts) | OK (gitignored; Windows ignores chmod 600, so the file shows as rw-r--r--) |
| Dev site `/api/health` | OK |
| Local checks on current `develop` | OK (lint, check, 658 tests with integration specs on Neon `dev`, build) |
| Node version | GAP: local Node 22.23; `.nvmrc` says 24 (accepted for `nutrition`) |
| Secrets | None needed (existing `ANTHROPIC_API_KEY` on both backends) |
| **Dependency on `nutrition`** | BLOCKING for stage 3: production PR #47 is still open. `develop` is the head of #47, so merging this change to `develop` before #47 merges would add it to that release. The `recipes` delta also modifies a requirement that only exists once `nutrition` is archived. |
| Paid AI calls in QA | QA must spend real model calls (imports and Match with AI) to test this change. About 6 to 8 AI imports and 6 to 8 matching runs per cycle, on the QA account. |

## Implementation

Stage 3 done 2026-11-13: all tasks ticked. Migration 0008 applied to Neon `dev`. lint, check, 708 tests (integration specs on dev), build, check:server and check:migrations pass.

## Review rounds

- Round 1 (2026-11-13, fresh Sonnet reviewer): 0 blockers, 0 majors, 7 minors, 2 nits. Exit condition met. Fixed anyway: Match with AI no longer overwrites rows edited while it ran; picking another food drops an AI estimate made for the old one; nothing-to-match answers `none` before using the 10 s spacing; `max_tokens` 8192; the suggestions route reuses `withNutrition`.

## Deferred findings

- Candidate searches (up to 100) run before the cap check; reserve first or check read-only (review minor).
- `reserveMatch` reports a missing `import_usage` row as the cap; make it an upsert (review minor; both callers call `startImport` first).
- Parse (45 s) plus match (30 s) run one after the other; lower the match timeout if the hosting request timeout is under ~80 s.
- The 10 s spacing is shared by imports and Match with AI, so pressing Match with AI right after an import waits.
- `gramsSource` is client-posted, so a user can mislabel their own rows (accepted in design).

## Ship

PR https://github.com/rhit-LEHMANCB/meal-planner/pull/50 into `develop`: `verify` passed first try, merged 2026-11-13 (5b86080). Dev rollout and the migrate workflow succeeded; `/api/health` ok.

## QA report

QA cycle 1 of 3, 2026-11-13T04:43Z, independent Sonnet QA agent, deployed commit `5b86080`. **Result: PASS**, 0 failing scenarios (3 test bugs in its own spec fixed).

- AI spent: 4 of 8 AI imports, 7 of 12 matching runs.
- Evidence: branch `qa-evidence/nutrition-import-matching` (commit 926471b, not for merging): [14 screenshots](https://github.com/rhit-LEHMANCB/meal-planner/tree/qa-evidence/nutrition-import-matching/openspec/changes/nutrition-import-matching/qa/screenshots) and the specs in `tests/qa/nutrition-import-matching/`.
- Covered:
  - matched rows and "AI match" markers;
  - a structured-data link matched without using an AI import;
  - no candidates;
  - estimates for an unconvertible amount and for a row with no amount;
  - a convertible amount keeping its conversion;
  - editing an estimate makes it the user's;
  - the preview follows edits and asks for servings;
  - hidden instructions and stated calories are ignored;
  - a photo import is matched;
  - the recipe page notes estimated weights;
  - the estimate is kept through a save;
  - Match with AI fills only open rows, leaves cleared rows cleared, and saves nothing until Save;
  - a regression pass over the top-level pages.
- Not driven, by design: the 50-run daily cap, AI failure and timeout notices, an out-of-range estimate, a food outside the candidates, the 100-row limit, the 10 s refusal. All are covered by unit specs.
- Observations:
  - Candidate search misses plain foods for some names. "whole milk" returns yogurts and cheeses; "kosher salt", "ground coriander", "medium ripe avocados" and long descriptive names go unmatched.
  - "200 g spaghetti" matched "Spaghetti, spinach, dry".
  - The estimates were plausible; a bunch of cilantro at 60 g is a little high.
  - The "AI match" marker is not persisted after save, only the weight marker. This is per the spec.

## Verification checklist for the human

Ships together with `nutrition` in PR #47 (see that change's checklist too).

1. **Production migration 0008 (high, production only).** After the merge, the production `Run database migrations` workflow must succeed (0005 to 0008). No new secrets: matching uses the existing `ANTHROPIC_API_KEY`.
2. **Real recipe import (high).** Import a real recipe with 10 or more ingredients from a live site (a bunch, a clove, "to taste", a brand name). Check each AI match and estimate, and compare the preview kcal with the site's figure.
3. **Plain-food candidate gaps (medium-high).** Import "1 cup whole milk", "kosher salt", "ground coriander" and "2 avocados". Note which rows stay unlinked, and try "Other food".
4. **Daily cap (medium).** On dev with a throwaway account, or by temporarily lowering the cap, check the "unavailable until tomorrow" notice on both the review and the edit form, and that another account is unaffected.
5. **AI outage (medium).** With matching broken on dev, for example a blocked outbound call, an import must still reach the review unlinked with "Foods could not be matched right now".
6. **Phone layout (medium).** Check the review and edit form at 375 px: the AI match chip, grams row, preview, and the Match with AI button.
7. **Older saved recipe (low).** Press Match with AI on a recipe saved before this change, save, and reopen it.

## Halted

(only if the run halted: stage, reason, evidence, next step for a human)
