# Lifecycle: grocery-list

- Branch: `grocery-list`
- Stage: 7 Production PR
- Review round: 2 of 3
- QA cycle: 1 of 3
- Started: 2026-11-09

## Interview summary

Approved: yes (2026-11-09, summary and mockups confirmed by the user)

**Goal.** Make `/grocery` a working shopping list for a plan week: everything the week's cooks and planned foods need, merged and grouped by aisle, tickable on a phone in the shop. It is the next step of the core loop (plan → groceries → nutrition).

**Design.** Claude Design pass on the mockup canvas (https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5, row "Grocery list (change: grocery-list)"): `GroceryPhone.dc.html` (phone list: week switcher, progress, add item, ticked and "more needed" items, mixed units, "as needed"), `GroceryAisle.dc.html` (item sheet: move to aisle, remembered), `GroceryDesktop.dc.html` (desktop: aisle cards in columns, add item, empty week).

**In scope**
- `/grocery?week=<Monday>` covers the whole Mon–Sun plan week, with previous, next and "This week" like `/plan` (same week parsing, same canonical redirect). Defaults to this week.
- Items come from:
  - **Cooks:** each recipe ingredient scaled to the batch's **servings cooked** (`quantity × servings_cooked / recipe.servings`).
  - **Food entries:** the food's name, in the amount and unit planned.
  - **Leftovers add nothing.**
- **Names, not foods** (ingredient-to-food linking comes with the nutrition change). Items merge by normalized name (case and spacing ignored). Amounts in the same unit add up; different units show side by side ("1 cup + 200 g"). Rows with no amount ("salt to taste") show "as needed". Rows saved before structured rows (`unparsed`, null name) are run through the line parser on the fly. A row already linked to a food (`food_id` set) merges by that food.
- Each item shows the meals it is for ("Turkey chili, Fish tacos"), or "Added by you".
- **Live list, saved ticks.** The list is rebuilt from the plan on every load, so plan edits show at once. Ticks are stored per user and week, keyed by the item's normalized name. If an item's amount goes up after it was ticked (or it gains a new unit), it comes back unticked with "More needed since you ticked it". Items that disappear from the plan take their tick with them.
- **Extra items per week:** an "Add item" field (free text, an optional leading amount parsed by the line parser, e.g. "2 paper towels"). They can be ticked and deleted, and merge with nothing.
- **Aisles:** a pure keyword map guesses the aisle (Produce, Meat and fish, Dairy and eggs, Bakery, Pantry, Spices and oils, Frozen, Other). A food entry uses `foods.aisle` when set. The item sheet ("⋯") moves an item to another aisle; the choice is remembered per user for that name and applies on every week.
- Progress ("5 of 14 in the cart") and "Covers N cooks and M foods". Empty week: "Nothing to buy yet" with a link to plan the week; extra items still work.
- Phone-first layout (big rows, 44 px targets) and a desktop layout. Ticking works without JavaScript (form posts), enhanced with `use:enhance`.

**Out of scope**
- Pantry and staples (the `pantry_items` table stays unused; `buildGroceryList`'s staple skip is not wired up).
- Linking ingredients to foods, grams-based merging, unit conversion between units (cup ↔ g), calorie numbers.
- Editing derived items' amounts, sharing a list, multi-week or date-range lists, printing.

**Roles and access.** Signed-in, allowlisted users only (existing hooks gate). Everything is per user: the plan through `meal_plans.user_id`, ticks, extra items and aisle choices each carry or join to the owner. Another user's week looks empty, never someone else's list. Routes use a new `getGroceryStore()` whose methods all take the owner id.

**Data.** Additive migration only:
- Reuse `grocery_lists` (one per `meal_plans` row; add a unique index on `plan_id`) and `grocery_items` for ticks and extra items (add an item key, an "added by you" flag and the amount seen when ticked).
- New per-user table for remembered aisle choices (user id, normalized name, aisle; unique per user and name).
- Adding an extra item to a week with no plan row creates the `meal_plans` row (same upsert the plan store uses).
- No existing rows need migrating (the grocery tables are unused today).

**Behavior and edge cases**
- Recipe with servings 0 or missing amounts: never divides by zero; amounts that cannot scale show "as needed".
- Count-like units (no unit, each, can, clove, bunch…) round up to a whole number for display; weights and volumes show as `formatAmount` gives them.
- A cook whose batch was thrown out still counts (it was cooked). A deleted recipe's cooks are gone, so its items go too.
- Extra item text max 200 chars, at most 100 extra items per week; blank input is refused with a message.
- Double-submit and two tabs: ticking is idempotent (set checked = true/false, not toggle).

**Security and privacy.** No AI call, no new secrets. Every store query filters by user id (directly or via `meal_plans.user_id`). Item keys and names come from the user's own recipes; render as text only.

**Acceptance (checked by hand)**
- WHEN I cook Turkey chili (recipe serves 4, 2 onions) for 6 servings THEN the list shows Onion 3, for Turkey chili.
- WHEN Pancakes needs "1 cup Flour" and Veggie pizza needs "1 cup flour" and "200 g flour" THEN the list shows one Flour item, 2 cup + 200 g, for both meals.
- WHEN a slot holds a leftover of the chili THEN nothing changes on the list.
- WHEN I plan "Apple 1 each" on five days THEN the list shows Apple 5 each.
- WHEN I tick Onion, then raise the chili to 8 servings THEN Onion is unticked and says more is needed.
- WHEN I add "2 paper towels" THEN it shows under Other, "Added by you", and I can tick and delete it.
- WHEN I move Gochujang to Pantry THEN it is in Pantry on this and every other week.
- WHEN I open next week with nothing planned THEN I see "Nothing to buy yet".
- WHEN the QA second account opens the same week THEN it sees none of the first account's items, ticks or aisle choices.

**Rollout.** One additive Drizzle migration (runs on `dev` via `migrate.yml` when merged to `develop`, then production). No new environment variables or secrets, no Firebase or Neon console changes.

**Assumptions**
- No plural/singular matching ("onion" and "onions" stay separate); revisit with food linking.
- Server "today" for the default week follows `/plan` (issue #31, UTC, is not fixed here).
- Local Node 22 vs required 24: ask again at Gate A.

## Gate A

Approved: yes (2026-11-09, by the user in chat)
Accepted preflight gaps: local Node 22 instead of 24 (CI `verify` on Node 24 stays the gate)

## Preflight

Run 2026-11-09.

| Check | Result |
| --- | --- |
| git identity and push to `origin` | ok (Caleb Lehman; branch `grocery-list` pushed) |
| GitHub backend | `gh`, logged in as rhit-LEHMANCB with `repo` and `workflow` scopes |
| Playwright `qa` project and browsers | ok (Playwright 1.64.1, chromium installed) |
| QA credentials (`.env.qa`, untracked, 600) | ok: all four variables set for the dev accounts |
| Dev site `/api/health` | `{"db":"ok"}` |
| `npm run lint` / `check` / `test` / `build` / `check:server` | all pass (444 tests, integration specs run on the Neon `dev` branch) |
| Test database | `TEST_DATABASE_URL` is the Neon `dev` branch, not production |
| Neon CLI for the dev migration | ok |
| New GitHub environment secrets | none needed |
| Node version | **gap:** local Node 22.23.2, repo requires 24 (`.nvmrc`); CI and App Hosting use 24 |

## Review rounds

- Round 1 (2026-11-09): 0 blockers, 1 major, 4 minors, 1 nit. Fixed: the major (route-level spec `page.server.spec.ts` for the redirect, sign-in, tick 404, untick of a gone key, bad week, add 409 and field error, extra-item 404s, aisle 400); minor 2 (`tick` and `add` refuse a missing or non-Monday `week`; the other actions are owner-scoped by item and need no week); minor 3 (forms post to `?week=…&/action`, so a no-JS submit reloads the same week); minor 4 (count units ticked and compared as shown, rounded up).
- Round 2 (2026-11-09): 0 blockers, 0 majors, 4 minors, 2 nits. Review loop exits. Fixed anyway: docs said every action checks the week (now say `tick` and `add`); popover ids could collide for keys like "half and half" / "half-and-half" (now encoded per code point); a `;` in a free-text unit broke tick snapshots (separators stripped); added the extras check to the privacy integration test. Deferred: aisle-choice cap (repeat of round 1), `setTick` argument-shape assertions (nit).

## Deferred findings

- QA observation: invalid `?week=` values are not redirected on `/grocery` or `/plan` (spec wording says redirect).
- QA observation: a tick outlives a deleted recipe or cook until the next tick on that week.
- QA gap: food entries in a count unit and foods with an aisle are untested on the dev site.
- Review round 1, minor: `grocery_aisle_choices` has no per-user cap; a user can store any number of name keys (affects only their own rows and page load).
- Review round 2, nit: `page.server.spec.ts` asserts the exact `setTick` arguments, including `liveKeys`.
- Review round 1, nit: the cook and food queries re-check `meal_plans.user_id` after the plan was looked up by user (harmless defence in depth).

## QA report

- Deployed commit: `0079dcc` on `develop` (dev site: https://meal-planner-dev--lehman-meals.us-east5.hosted.app)
- QA cycle: 1 of 3, by a fresh independent agent (Sonnet 5.5), 2026-11-09
- Result: **PASS**, 0 failing scenarios (19 scenario tests + 5 regression tests). Test bugs in its own scripts were fixed inside the cycle (strict-mode locators, capitalized names, SvelteKit failure payloads arriving as HTTP 200, shared leftover picker data).
- Evidence: unmerged branch `qa-evidence/grocery-list`; screenshots show the signed-in email masked. Specs: `tests/qa/grocery-list/` (weeks in 2031, `qa-` data, cleaned up).

| Scenario | Result | Evidence |
| --- | --- | --- |
| Week from the address | pass | [week-from-the-address.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-week-from-the-address.png?raw=true) |
| Not a Monday | pass | [not-a-monday.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-not-a-monday.png?raw=true) |
| Signed out | pass | [signed-out.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-signed-out.png?raw=true) |
| Scaled to servings cooked | pass | [scaled-to-servings-cooked.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-scaled-to-servings-cooked.png?raw=true) |
| No amount | pass | [no-amount.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-no-amount.png?raw=true) |
| Leftover in the week | pass | [leftover-in-the-week.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-leftover-in-the-week.png?raw=true) |
| Leftover from last week's cook | pass | [leftover-from-last-weeks-cook.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-leftover-from-last-weeks-cook.png?raw=true) |
| Snack foods (grams; see gaps) | pass | [snack-foods.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-snack-foods.png?raw=true) |
| Same and different units | pass | [same-and-different-units.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-same-and-different-units.png?raw=true) |
| Unit spellings match | pass | [unit-spellings-match.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-unit-spellings-match.png?raw=true) |
| Different names stay apart | pass | [different-names-stay-apart.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-different-names-stay-apart.png?raw=true) |
| Count rounds up | pass | [count-rounds-up.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-count-rounds-up.png?raw=true) |
| Weight keeps decimals | pass | [weight-keeps-decimals.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-weight-keeps-decimals.png?raw=true) |
| Guessed aisle | pass | [guessed-aisle.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-guessed-aisle.png?raw=true) |
| Unknown name | pass | [unknown-name.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-unknown-name.png?raw=true) |
| Remembered on other weeks | pass | [remembered-on-other-weeks.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-remembered-on-other-weeks.png?raw=true) |
| Aisle choice applies to extra items | pass | [aisle-choice-applies-to-extra-items.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-aisle-choice-applies-to-extra-items.png?raw=true) |
| Unknown aisle refused | pass | [unknown-aisle-refused.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-unknown-aisle-refused.png?raw=true) |
| Tick and reload | pass | [tick-and-reload.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-tick-and-reload.png?raw=true) |
| Repeated tick | pass | [repeated-tick.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-repeated-tick.png?raw=true) |
| Ticking works without JavaScript | pass | [ticking-works-without-javascript.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-ticking-works-without-javascript.png?raw=true) |
| Servings raised | pass | [servings-raised.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-servings-raised.png?raw=true) |
| Servings lowered | pass | [servings-lowered.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-servings-lowered.png?raw=true) |
| Add an extra item | pass | [add-an-extra-item.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-add-an-extra-item.png?raw=true) |
| Blank text | pass | [blank-text.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-blank-text.png?raw=true) |
| Delete an extra item | pass | [delete-an-extra-item.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-delete-an-extra-item.png?raw=true) |
| Extra item limit (100) | pass | [extra-item-limit.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-extra-item-limit.png?raw=true) |
| Empty week | pass | [empty-week.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-empty-week.png?raw=true) |
| The list explains what it covers | pass | [the-list-explains-what-it-covers.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-the-list-explains-what-it-covers.png?raw=true) |
| Other user's week | pass | [other-users-week.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-other-users-week.png?raw=true) |
| Other user's extra item | pass | [other-users-extra-item.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-other-users-extra-item.png?raw=true) |
| Phone layout and item menu (not in spec) | pass | [phone-layout.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/grocery-list-phone-layout.png?raw=true) |
| Regression: /recipes, /plan, /leftovers, /grocery, /nutrition load with no console errors | pass | [regression-grocery.png](https://github.com/rhit-LEHMANCB/meal-planner/blob/qa-evidence/grocery-list/openspec/changes/grocery-list/qa/screenshots/regression-grocery.png?raw=true) |

**Observations outside the specs**
1. Low: invalid `?week=` values (`garbage`, `2026-02-30`, empty) are not redirected; they show this week, exactly like `/plan`. The spec says "redirect … the same way `/plan` does"; behaviour matches `/plan`, the wording does not. Follow-up: fix the wording or add the redirect to both pages.
2. Low: names are shown with a capital first letter ("Qa paper towels"); the spec example writes "paper towels".
3. Info: a tick outlives a deleted recipe or cook until the next tick on that week; if the same ingredient comes back that week and needs no more, it shows already ticked.
4. Info: custom foods and aisle choices cannot be deleted from the UI, so QA leaves `qa-gl-apple`, empty 2031 plan rows and a "gochujang" aisle choice on the dev QA account.
5. No console errors; no horizontal scroll at 390 px; the item menu is a bottom sheet on phones.

**Not covered by automation**: a food in a count unit ("Apple, 1 each": custom foods only have grams), foods with an aisle (not settable in the UI), legacy unparsed ingredient rows, recipes with no servings, concurrent devices, real phones offline, screen readers.


## Verification checklist for the human

Ranked by risk. Test on production after merging unless noted.

1. **Migration applied in production** (high). After the deploy, check the `migrate` run on the `production` push succeeded, then open `/grocery` and tick an item. A missing migration shows a 500 on tick.
2. **Tick items in a shop on a phone** (high). On a real phone, open this week's list, tick about five items while moving, toggle airplane mode, tick another, restore signal and reload. Expect ticks saved and a failed tick showing an error, not a silent reset.
3. **"More needed" after a real re-plan** (high). Tick several items, then raise a cook's servings, edit a recipe's ingredient amounts, add a second cook using an existing ingredient in another unit, and lower a cook. Expect only items needing more (or a new unit) to come back unticked with "More needed since you ticked it".
4. **Real recipes with messy ingredient lines** (medium). Cook two or three real recipes (including older recipes saved before structured rows) and read the list: merged names, "as needed" for odd lines, counts rounded up.
5. **Aisle guesses** (medium). With 30+ real items, check the guessed aisles, move a few and confirm other weeks and extra items follow.
6. **Keyboard and screen reader** (medium). Tab to "⋯", open the menu, pick an aisle, close with Escape, tick with Space; check VoiceOver/NVDA announce the pressed state.
7. **Two devices** (low). Same week on phone and laptop: tick on one, add an extra on the other, delete it on one and tick it on the other; expect "no longer on your list", not a crash.

Production-only risks: no new secrets or environment variables; the migration only adds (unique indexes on empty-in-production tables `grocery_lists` and `grocery_items`, a new table).

## Halted

(only if the run halted: stage, reason, evidence, next step for a human)
