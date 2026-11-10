# Proposal

## Why

The weekly plan now holds cooks, leftovers and foods, but `/grocery` is still a placeholder, so planning a week does not yet tell you what to buy. The grocery list is the next step of the core loop (plan, then groceries, then nutrition). It has to work before recipe ingredients are linked to foods, because none are linked yet.

## What Changes

- `/grocery?week=<Monday>` becomes a shopping list for one plan week, with previous, next and "This week" controls like `/plan`.
- Items come from the week's plan:
  - **Cooks:** each recipe ingredient, scaled to the batch's servings cooked.
  - **Food entries:** the food in the amount and unit planned.
  - **Leftovers add nothing.**
- Items are merged by normalized ingredient name. Amounts in the same unit add up; different units are listed side by side ("2 cup + 200 g"). Ingredients without an amount show "as needed". Each item names the meals it is for.
- The list is rebuilt from the plan on every load. Ticks are saved per user and week. If more of an item is needed after it was ticked, it shows unticked again with "More needed since you ticked it".
- You can add your own items to a week ("2 paper towels"), tick them and delete them.
- Items are grouped by aisle. The aisle is guessed from keywords (or taken from the food's aisle). You can move an item to another aisle, and that choice is remembered for the name on every week.
- Progress ("5 of 14 in the cart"), a summary of what the list covers, and an empty state that links to the plan.
- Replaces the unused grams-and-food-based `buildGroceryList` in `src/lib/domain/grocery.ts` with a name-based builder.
- Out of scope: pantry and staples, linking ingredients to foods, converting between units, calories, editing derived amounts, sharing lists, multi-week lists.

## Capabilities

### New Capabilities

- `grocery-list`: the weekly grocery list. What goes on it (cooks scaled to servings cooked, food entries, never leftovers), merging and amounts, ticks and "more needed", extra items, aisles and remembered aisle choices, the week view, and privacy of each user's list.

### Modified Capabilities

(none)

## Impact

- Database: one additive migration.
  - `grocery_lists`: unique index on `plan_id`.
  - `grocery_items`: add `item_key`, `is_extra` and `ticked_amount`; unique index on `(list_id, item_key)`.
  - New table `grocery_aisle_choices (user_id, name_key, aisle)`, unique per user and name.
- New server module `src/lib/server/grocery.ts` (`getGroceryStore()`, owner id on every method).
- Pure domain code in `src/lib/domain/grocery.ts` (building, merging, amounts, ticks) and `src/lib/domain/aisles.ts` (aisle list and keyword guess), with Vitest specs.
- `src/routes/grocery/+page.server.ts` and `+page.svelte`, plus components under `src/lib/components/grocery/` with vitest-browser-svelte specs.
- `CLAUDE.md` gains a "Grocery list" section.
- No new environment variables, secrets, AI calls or console changes.
