# Tasks

## 1. Schema and migration

- [x] 1.1 Edit `src/lib/server/db/schema.ts`:
  - `grocery_lists`: unique index on `plan_id`.
  - `grocery_items`: add `item_key`, `is_extra` (not null, default false), `ticked_amount`; unique index on `(list_id, item_key)`.
  - New `grocery_aisle_choices` (`id`, `user_id`, `name_key`, `aisle`), unique on `(user_id, name_key)`.

  Verify `npm run check` passes.
- [x] 1.2 Run `npm run db:generate` and commit the new `drizzle/` files. Verify `npm run check:migrations` passes and the SQL has no drops, renames, type changes or `SET NOT NULL`.
- [x] 1.3 Apply the migration to the Neon `dev` branch locally so integration specs can run. Verify `drizzle-kit migrate` reports success.

## 2. Grocery domain logic (pure)

- [x] 2.1 Add `src/lib/domain/aisles.ts`: `AISLES`, `guessAisle`, `aisleFor`, `groupByAisle`. Verify `aisles.spec.ts` covers multi-word keywords winning ("black pepper" vs "bell pepper"), whole-word matching, unknown → Other, remembered choice over food aisle over guess, aisle order and empty aisles dropped.
- [x] 2.2 Replace `buildGroceryList` in `src/lib/domain/grocery.ts` with the name-based builder (`nameKey`, unit normalization, scaling, "as needed", meals once each, legacy lines through `parseIngredientLine`) and `formatAmounts` (count units round up). Rewrite `grocery.spec.ts` to cover the spec's merge, scale, count rounding, different-names, null-scale and food-source scenarios.
- [x] 2.3 Add `serializeAmounts`, `isCovered` and `applyTicks`. Verify specs for more in a unit, a new unit, less, equal, and "as needed".
- [x] 2.4 Add `src/lib/domain/grocery-form.ts` (zod: tick key and checked, extra text 1–200 chars, item id uuid, aisle in `AISLES`) with field errors. Verify `grocery-form.spec.ts`.

## 3. Grocery store

- [ ] 3.1 Add `src/lib/server/grocery.ts` `makeGroceryStore(db)` / `getGroceryStore()` with `getWeek`. Verify `grocery.integration.spec.ts` on the dev branch: cooks scaled by servings cooked, food entries, a week of only leftovers gives no sources, another user's week is empty, a recipe of another user is never read.
- [ ] 3.2 Add `setTick` (idempotent upserts of `meal_plans`, `grocery_lists` and the item; delete on untick). Verify the integration spec: tick twice gives one row, untick removes it, ticks are per user.
- [ ] 3.3 Add `addExtra` (100 per week cap in one statement), `setExtraChecked`, `removeExtra` and `setAisle`. Verify the integration spec: cap, another user's item id is not found and unchanged, aisle choice upsert per user.

## 4. Grocery page

- [ ] 4.1 `src/routes/grocery/+page.server.ts`: load (week redirect, store, builder, ticks, grouping, counts) and actions `tick`, `add`, `extraTick`, `remove`, `aisle`, using `requireUserId` and `getGroceryStore()` only. Verify with `npm run check` and a route-level unit spec of the load's pure assembly if it is split out.
- [ ] 4.2 `GroceryItemRow.svelte` (tick button with `aria-pressed`, name, meals, amount, "More needed since you ticked it", "Added by you") and `ItemMenu.svelte` (popover: aisle radios + Move, Delete for extras). Verify vitest-browser-svelte specs for ticked/unticked/more-needed rendering, labels, and the menu's Delete only on extra items.
- [ ] 4.3 `+page.svelte`: header with week controls, progress, covers summary, add form with error, aisle sections, empty state linking to `/plan?week=`. Matches the `GroceryPhone` and `GroceryDesktop` mockups; precompute display values with `$derived`. Verify a component spec for the empty state and progress text, and `npm run lint`.

## 5. Docs and checks

- [ ] 5.1 Add a "Grocery list" section to `CLAUDE.md` (live list, stored ticks, keys, store, leftovers never add). Verify it matches the code.
- [ ] 5.2 Run `npm run lint`, `npm run check`, `npm test` (with `TEST_DATABASE_URL` on dev), `npm run build` and `npm run check:server`. Verify all pass.
