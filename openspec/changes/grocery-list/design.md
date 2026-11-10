# Design

## Context

- The schema already has `grocery_lists` (one per `meal_plans` row, intended), `grocery_items` (name, quantity, unit, aisle, checked, for_meals), `pantry_items`, `foods.aisle` and `food_units` (migration 0000). Nothing reads or writes the grocery tables; they are empty on dev and production.
- `src/lib/domain/grocery.ts` has a pure `buildGroceryList(meals, stapleFoodIds)` that merges grams by `foodId`. Nothing calls it, and it cannot work yet: `recipe_ingredients.food_id` is always null and there are no shared foods.
- Recipe ingredients are structured rows (`quantity`, `unit`, `name`, `note`); older rows are `unparsed` with a null `name`. `parseIngredientLine`, `normalizeUnit` and `formatAmount` live in `src/lib/domain/ingredient-line.ts`.
- The plan store (`src/lib/server/plan.ts`) owns `meal_plans`, `planned_meals` and `leftover_batches`. A cook is a non-leftover row with `recipe_id` whose batch has `cook_meal_id` = the row; the batch's `servings_cooked` is what was cooked. Week parsing is `parseWeekParam` in `src/lib/domain/plan.ts`.
- The Neon HTTP driver has no interactive transactions; `db.batch` runs statements in one transaction but later statements cannot use earlier results.

Mockups: canvas https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5, row "Grocery list (change: grocery-list)": `GroceryPhone`, `GroceryAisle`, `GroceryDesktop`. The app keeps its existing layout and nav (the mockups' bottom tab bar is not built, as on `/plan`).

## Goals / Non-Goals

**Goals:**
- A useful list today, from names and units alone, that later food linking can improve without a schema change.
- All merging, scaling, rounding, aisle and tick logic in pure functions with Vitest specs.
- Owner-filtered store; routes never query grocery or plan tables directly.

**Non-Goals:**
- Pantry and staples, unit conversion, grams, calories, singular/plural matching.
- Live updates between tabs or devices.

## Decisions

### Live list, stored ticks

The list is derived on every load from the plan; only user state is stored:

| Stored | Where |
| --- | --- |
| Tick of a derived item | `grocery_items` row with `item_key` = the item's key, `checked = true`, `ticked_amount` = the amounts when ticked |
| Extra item | `grocery_items` row with `is_extra = true`, `item_key` null, name, quantity, unit, checked |
| Aisle choice | `grocery_aisle_choices (user_id, name_key, aisle)` |

Unticking a derived item deletes its row. Rows whose key no longer appears on the list are ignored (and cleaned up the next time the user ticks on that week, best effort, no correctness depends on it).

Alternative: snapshot the derived list into `grocery_items` on "Make list". Rejected: it goes stale after plan edits, which the user chose against.

### Data model (one additive migration)

| Table | Change | Why |
| --- | --- | --- |
| `grocery_lists` | unique index on `plan_id` | Upsert the week's list row. |
| `grocery_items` | add `item_key text`, `is_extra boolean not null default false`, `ticked_amount text`; unique index `(list_id, item_key)` | Tick upsert by key; nulls (extra items) do not collide. |
| `grocery_aisle_choices` | new: `id uuid pk`, `user_id text not null`, `name_key text not null`, `aisle text not null`; unique `(user_id, name_key)` | Remembered aisles. |

`grocery_items.food_id`, `aisle`, `for_meals` and `pantry_items` stay unused. Ownership of lists and items goes through `grocery_lists.plan_id → meal_plans.user_id`, like `planned_meals`.

### Keys and normalization

- `nameKey(name)`: trim, lowercase, collapse whitespace. Derived items use it as `item_key`. A line linked to a food uses the food's name, so lines linked to one food merge, and food entries merge with same-named ingredients.
- Unit: `normalizeUnit(unit) ?? unit.trim().toLowerCase()`; a missing unit is the count unit (shown with no unit). Planned food entries use their unit as stored (`g` or a food unit).
- Display name: the first spelling seen, with its first letter capitalized.

### Pure builder (`src/lib/domain/grocery.ts`)

```ts
interface GroceryLine { name: string; quantity: number | null; unit: string | null; aisle: string | null }
interface GrocerySource { meal: string; scale: number | null; lines: GroceryLine[] }
interface Amount { unit: string | null; quantity: number }
interface GroceryItem { key: string; name: string; amounts: Amount[]; asNeeded: boolean; aisle: string | null; forMeals: string[] }
buildGroceryList(sources: GrocerySource[]): GroceryItem[]
```

- Cook source: `meal` = recipe title, `scale` = `servings_cooked / recipe.servings`, or null when `recipe.servings < 1`. Food source: `meal` = slot label, `scale` = 1, one line with the food's name, planned amount, unit and `foods.aisle`.
- A line with a null quantity or a null scale counts as "as needed". An item is shown "as needed" only when it has no amounts.
- Leftovers are never turned into sources: the store does not load them, and its integration spec checks that a week of only leftovers yields no sources.
- `formatAmounts(amounts)`: count units (null, each, can, jar, clove, bunch, head, piece, slice, stick, sprig, package) round **up** to whole numbers; others use `formatAmount` (fractions like "1 1/2", else up to three decimals). Joined with " + " in first-seen order.
- `parseLegacyLine(rawText)`: rows with null `name` go through `parseIngredientLine`.

### Ticks and "more needed"

- `serializeAmounts(item)`: canonical text, e.g. `cup=2;g=200` (count unit as `-`, "as needed" as `?`). Stored in `ticked_amount` when ticking.
- Count units are serialized and compared as shown (rounded up), so an item never says "more needed" without a visible change.
- `isCovered(ticked, current)`: true when every current unit is in `ticked` with at least that quantity (epsilon 1e-6), and "as needed" is covered by "as needed".
- `applyTicks(items, ticks)` returns each item with `checked` (stored tick and covered) and `moreNeeded` (stored tick but not covered).
- The server computes the snapshot itself when ticking: the `tick` action rebuilds the week, finds the key and stores its current amounts. An unknown key fails with "This item is no longer on the list".

### Aisles (`src/lib/domain/aisles.ts`)

- `AISLES` in display order: Produce, Meat and fish, Dairy and eggs, Bakery, Pantry, Spices and oils, Frozen, Other.
- `guessAisle(name)`: whole-word keyword match on the normalized name, a short curated map (onion, garlic, lemon, cilantro, pepper as a vegetable only in "bell pepper"…). Multi-word keywords win over single words ("black pepper" → Spices and oils, "bell pepper" → Produce). No match → Other.
- `aisleFor(item, choices)`: remembered choice, else the line's food aisle when it is one of `AISLES`, else the guess.
- `groupByAisle(items)`: sections in `AISLES` order, empty ones dropped, items by name.

### Store (`src/lib/server/grocery.ts`, `makeGroceryStore(db)`)

- `getWeek(userId, monday)`: one plan lookup by `(user_id, week_start)`, then in parallel: cooks (planned meals of that plan, `is_leftover = false`, `recipe_id` not null, joined to `recipes` with `recipes.user_id = userId` and to the batch by `cook_meal_id`), their ingredients, food entries joined to visible foods, the list's items, and the user's aisle choices. Returns sources, ticks, extras, choices and counts. No plan row → empty sources, still loads choices.
- `setTick(userId, monday, key, snapshot | null)`: upserts `meal_plans` (same statement as the plan store) and `grocery_lists` (on conflict on `plan_id`), then upserts or deletes the item by `(list_id, item_key)` in one `db.batch`. Idempotent.
- `addExtra(userId, monday, input)`: single `INSERT … SELECT … WHERE (SELECT count(*) …) < 100` so concurrent adds cannot pass 100 by more than the race window of one statement.
- `setExtraChecked`, `removeExtra(userId, itemId)`: `WHERE id = $id AND is_extra AND list_id IN (SELECT gl.id FROM grocery_lists gl JOIN meal_plans mp ON mp.id = gl.plan_id WHERE mp.user_id = $uid)`. Zero rows → not found. Table names written out in the subquery (Drizzle prints bare columns in single-table queries).
- `setAisle(userId, nameKey, aisle)`: upsert on `(user_id, name_key)`; the route validates `aisle ∈ AISLES`.

### Route and UI

- `src/routes/grocery/+page.server.ts`: `requireUserId`, `parseWeekParam` with redirect, `getWeek`, then the pure builder, `applyTicks` and grouping. Actions: `tick` (key, checked), `add` (text), `extraTick` (id, checked), `remove` (id), `aisle` (key, aisle). zod parsing in `src/lib/domain/grocery-form.ts` with field errors.
- Components in `src/lib/components/grocery/`: `GroceryItemRow.svelte` and `ItemMenu.svelte`.
- The tick control is a submit `<button aria-pressed>` styled as a checkbox inside a small form, so it works without JavaScript; `use:enhance` keeps the scroll position and updates in place.
- The "⋯" item menu is a native `popover` opened by `popovertarget` (no JavaScript needed), styled as a bottom sheet under 640 px and as an anchored panel above. It holds the aisle radio group with "Move", and "Delete item" for extra items.
- Precompute display values (amount text, labels) in `$derived` values, not inside `{#each}` expressions.

## Risks / Trade-offs

- Name-only merging misses plurals and synonyms ("onion"/"onions"). Accepted; food linking later fixes it.
- Recomputing the whole week on each tick costs a few queries. Acceptable for one user's week.
- `popover` needs a 2024+ browser; older browsers see the menu button do nothing. Ticking still works.
- Keyword guesses will be wrong sometimes; the remembered choice is the fix.

## Migration Plan

1. Edit `schema.ts`, `npm run db:generate`, `npm run check:migrations`.
2. Apply to the Neon `dev` branch for integration specs; `migrate.yml` applies it on merge to `develop`, then to production.
3. Rollback: old code ignores the new columns and table.

## Open Questions

(none)
