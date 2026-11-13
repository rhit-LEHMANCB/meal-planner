# Lifecycle: nutrition

- Branch: `claude/dev-lifecycle-nutrition-3caa7b`
- Stage: 5 Ship to develop (Gate B fix)
- Review round: 2 of 3
- QA cycle: 1 of 3
- Started: 2026-11-12

## Interview summary

Approved: yes (user confirmed 2026-11-12)

**Goal.** Show calories and macros: per recipe serving, per day on the plan, and on a Nutrition page for a Mon–Sun week against the user's daily goals. All numbers come from the `foods` table (never the model).

**Scope.**
- *Shared foods seed:* USDA FoodData Central **SR Legacy** (~7,800 foods) as shared foods (`user_id` null, `source` 'usda', `source_id` = FDC id), kcal/protein/carbs/fat per 100 g, and its household portions as `food_units` (cup, tbsp, each…). Built by a committed generator script from the downloaded CSV; shipped as an additive **data migration**, so it runs on dev at merge to develop and on prod at merge to production.
- *Ingredient matching:* on the recipe add and edit forms each ingredient row can be linked to a food (own or shared). The form pre-suggests the best name-search hit for unlinked rows, shown as a suggestion the user confirms, changes or clears; nothing is linked until save. Grams come from g/kg/oz/lb, else the food's units, else a per-row "about how many grams?" field stored on the ingredient row. Import review stays unchanged (no nutrition shown); imported recipes get suggestions when edited.
- *Recipe nutrition:* per serving = sum of linked rows' macros / `recipes.servings`. Rows with no food or no grams count as missing; totals use what is linked and say "partial: N of M ingredients have no nutrition". Shown on the recipe page.
- *Plan:* each day column shows a kcal total (partial marker when any entry is partial). Cook = servings eaten × per serving; leftover = servings drawn × the batch recipe's per serving; food entry = grams × per 100 g. Computed live.
- *Quick log:* on the Nutrition page, log a food (amount + unit) or a recipe (servings) to any day of the shown week, optional slot; macros snapshotted onto `food_log` at log time; entries can be deleted.
- *Nutrition page (`/nutrition?week=<Monday>`):* today card (kcal vs goal, left today), macros today vs goals, calories-by-day chart split planned / leftovers / logged with the goal line, prev/next week, weekly average, logged entries list, editable daily goals (`nutrition_goals`, defaults 2000 kcal / 140 P / 230 C / 70 F).

**Out of scope.** Month view; AI matching; editing/deleting custom foods (#32); marking planned meals eaten; nutrition on the grocery list or import review; Open Food Facts.

**Roles and access.** Each user sees only their own recipes, plans, logs and goals; shared USDA foods are read-only for everyone. Another user's recipe, food or log entry behaves like a missing one. Logging routes live under `/nutrition`, not public `/api/*`.

**Data changes (additive).** Migration with the USDA foods and units; unique index on `foods (source, source_id)`; `recipe_ingredients.grams` (nullable numeric, per-row weight override). Existing `food_log`, `nutrition_goals` tables are used as they are.

**Edge cases.** Recipe with no linked ingredients shows "no nutrition yet" and counts 0 with the partial marker; servings missing/0 cannot happen (required); unit not convertible and no grams entered → missing; leftover from a deleted recipe is already removed with it; numbers rounded for display only (kcal to whole, macros to whole g); a log entry for a recipe snapshots its current per-serving numbers (numbers only).

**Security.** Every new query filters by `user_id` (food_log, nutrition_goals) or through `meal_plans.user_id`; food links only accept foods the user can see; no prompt content changes.

**Acceptance (examples).**
- WHEN a user links "200 g chicken breast" to USDA "Chicken, broilers or fryers, breast, meat only, raw" in a 2-serving recipe THEN the recipe page shows its per-serving kcal from the USDA row.
- WHEN a row is "1 cup rice" and the rice food has a cup unit THEN it converts without asking for grams; WHEN the food has no cup unit THEN the row asks for grams.
- WHEN Monday has a cook of that recipe (1 serving) and a 170 g yogurt entry THEN Monday's plan column and the Nutrition chart show the sum.
- WHEN the user logs 1 apple on Tuesday THEN Tuesday's total rises, and editing the apple food later does not change the log.
- WHEN a second user opens the first user's log entry id in a delete request THEN nothing happens and it looks like a missing entry.
- WHEN the user saves goals 1800/150/180/60 THEN the today card and goal line use them.

**Rollout.** No new secrets or env vars. The seed migration is large (a few MB of SQL) and runs through `migrate.yml` on both branches. Production deploy: the migration must finish before users open search (it is additive, so old code is unaffected).

**Assumptions.** "Today" uses the same date logic as the plan (server UTC, known gap #31). Planned totals are live, so editing a recipe changes past planned days; only log entries are snapshotted. USDA data is public domain; attribution line on the Nutrition page.

## Gate A

Approved: yes, 2026-11-12 (user: "Approve, accept gap")
Accepted preflight gaps: local Node 22 instead of 24 (CI and App Hosting use 24)

## Preflight

Run 2026-11-12. GitHub backend: **gh**.

| Check | Result |
| --- | --- |
| git identity and push to `origin` | OK (branch pushed) |
| `gh auth status` with `repo` and `workflow` | OK |
| Playwright `qa` project and browsers | OK (Playwright 1.64.1, chromium installed) |
| QA credentials (`.env.qa`, both accounts) | OK (copied from main checkout, mode 600, gitignored) |
| Dev site `/api/health` | OK (`{"db":"ok"}`) |
| `npm run lint` / `check` / `test` / `build` / `check:server` | OK (523 tests; integration specs ran against Neon `dev` via `TEST_DATABASE_URL`, as CLAUDE.md prescribes) |
| Node version | GAP: only Node 22.23 is installed locally; `.nvmrc` and `engines` say 24 and nvm is not installed. CI and App Hosting use 24. |
| Neon CLI for local migrations to `dev` | OK |
| GitHub `develop` environment secrets | OK (`DATABASE_URL_UNPOOLED`); this change needs no new secrets |
| USDA SR Legacy CSV (2018-04) | Downloaded to the scratchpad (6.1 MB zip) with approval |

## Implementation

Stage 3 done 2026-11-12: all 22 tasks ticked. lint, check, 652 tests (integration specs on Neon `dev`), build, check:server and check:migrations pass. One timing test (`html-scan.spec.ts` "reads unclosed main in linear time") failed once under full-suite load and passed alone; unrelated to this change. Migrations 0005 to 0007 were applied to the Neon `dev` branch locally for the integration specs.

## Review rounds

- Round 2 (2026-11-13, Gate B fix, fresh Sonnet reviewer): 0 blockers, 0 majors, 2 minors, 2 nits. Fixed: the same glued "· partial" on the Today card, a less markup-bound caption test, and the non-breaking space written as an escape.
- Round 1 (2026-11-12, fresh Sonnet reviewer): 0 blockers, 0 majors, 4 minors, 2 nits. Exit condition met. Fixed anyway (trivial): inherited object keys as units (`Object.hasOwn` in `toGrams` and `log`, non-finite grams refused), oversized log entries refused before the insert (`too_large`), plan load test that logs never reach day totals, `logged_at` documented in design/proposal, script name in design/tasks.

## Deferred findings

- Food suggestions run up to 50 concurrent searches per page load; de-duplicate names if latency shows (review nit).
- Food matching and the quick log's food search need JavaScript; without it rows can only be saved unlinked (recipe logging works without JS).
- "Today" on the plan uses server UTC on the server side (existing issue #31); the Nutrition page corrects today in the browser.
- `html-scan.spec.ts` linear-time test is load-sensitive and failed once in a full local run.

## Ship

PR https://github.com/rhit-LEHMANCB/meal-planner/pull/45 into `develop`: `verify` passed first try, merged 2026-11-12 with a merge commit (3e54ecc).

## QA report

QA cycle 1 of 3, 2026-11-13T01:57Z, independent Sonnet QA agent, deployed commit `3e54ecc` on `develop` (dev site). **Result: PASS**, 0 failing scenarios.

- Evidence: branch `qa-evidence/nutrition` (commit 351350b, not for merging): 53 screenshots in [`openspec/changes/nutrition/qa/screenshots/`](https://github.com/rhit-LEHMANCB/meal-planner/tree/qa-evidence/nutrition/openspec/changes/nutrition/qa/screenshots) and the Playwright specs in `tests/qa/nutrition/` (run with `--workers=1`).
- Covered: every changed scenario in the foods, recipes, nutrition and meal-plan delta specs, plus a regression pass over /recipes, /plan, /grocery, /leftovers and /nutrition with no console errors, and phone layouts at 390 px.
- Not run: "Import review unchanged" (needs a paid AI import). The import review form passes no `nutrition` flag, so it renders no food controls; a person should confirm it once.
- Observations (all low, deferred to issues):
  1. At 390 px a week with data scrolls sideways by about 15 px, caused by the screen-reader-only table in the chart section.
  2. Plan day header shows "330 kcal· partial" with no space before the dot.
  3. The log amount error says "greater than 0"; the spec says "more than 0" (behavior right).
  4. The chart has no y-axis values (the bars are labelled, and there is a screen-reader table).
  5. Nothing says the default goals are defaults until they are saved.
- QA data: all `qa-` recipes, plan and log entries were removed. Custom foods `qa-nut-*` (5) and a goals row for the QA user remain, because custom foods cannot be deleted in the UI (#32). The setup also removed older `qa-*` recipes of the QA user left by other suites.

## Gate B defect (2026-11-13)

The human found at Gate B that the chart's screen-reader table caption ("Calories by day, week of …") renders on top of the "Calories by day" heading. Cause: `sr-only` was on the `<table>`, but a table caption is laid out outside the table box, so it was not clipped. This was also the ~15 px sideways scroll QA noted at 390 px. Fix on branch `fix/nutrition-chart-caption`: wrap the table in an `sr-only` div. Also fixed the "kcal· partial" spacing on plan day totals (QA observation 2). Classified `app bug`: stages 3 to 5 with one review round, then QA cycle 2.



Ranked by risk. Production-only risks are listed first.

1. **Production migration (high).** After merging to `production`, check that the `Run database migrations` workflow on `production` succeeds. It applies 0005 to 0007, including the ~2 MB USDA insert. Then check that `/api/health` is ok and that food search on prod finds "Broccoli, raw". No new secrets or env vars are needed.
2. **Real recipe import, then link foods (high).** Import a real recipe on dev. Check that the review form shows no nutrition or food links. Save it, open Edit, accept the suggestions, and check that the per-serving kcal is plausible and the partial note appears for unlinked rows.
3. **Suggestion quality on messy lines (high).** On /recipes/new, paste about 10 real ingredient lines (garlic cloves, a can of tomatoes, salt to taste, a bunch of parsley). Judge the suggestions, and check that grams are asked for where needed.
4. **Accuracy against labels (medium-high).** Plan and log egg, rice, chicken breast, banana and olive oil in grams and in cup, tbsp or each. Compare with package labels.
5. **Phone use (medium).** On a real phone, use /nutrition and /plan: log, delete, scroll the chart. Note the known ~15 px sideways scroll on /nutrition.
6. **Time zone near midnight (medium).** In the evening, on a device set to a non-UTC zone, check that /nutrition shows the local today and that logging lands on the intended day.
7. **Screen reader and keyboard (medium).** Check the calories table, the progress bars, the goal errors and a keyboard-only food log on /nutrition.
8. **Search over the full seed (low-medium).** Search chicken, milk, cheddar, oats and brand-like names. Check the ranking and look for odd units.

## Halted

(only if the run halted: stage, reason, evidence, next step for a human)
