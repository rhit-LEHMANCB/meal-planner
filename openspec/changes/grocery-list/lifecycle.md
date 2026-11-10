# Lifecycle: grocery-list

- Branch: `grocery-list`
- Stage: 5 Ship to develop
- Review round: 2 of 3
- QA cycle: 0 of 3
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

- Review round 1, minor: `grocery_aisle_choices` has no per-user cap; a user can store any number of name keys (affects only their own rows and page load).
- Review round 2, nit: `page.server.spec.ts` asserts the exact `setTick` arguments, including `liveKeys`.
- Review round 1, nit: the cook and food queries re-check `meal_plans.user_id` after the plan was looked up by user (harmless defence in depth).

## QA report

(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human

(filled in stage 7)

## Halted

(only if the run halted: stage, reason, evidence, next step for a human)
