# Lifecycle: nutrition

- Branch: `claude/dev-lifecycle-nutrition-3caa7b`
- Stage: 2 Propose + preflight
- Review round: 0 of 3
- QA cycle: 0 of 3
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

Approved: no
Accepted preflight gaps: none

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

## Review rounds

(none yet; one line per round: blockers, majors, fixed, rejected with reason)

## Deferred findings

(minors, nits and known gaps to turn into issues at wrap-up)

## QA report

(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human

(filled in stage 7)

## Halted

(only if the run halted: stage, reason, evidence, next step for a human)
