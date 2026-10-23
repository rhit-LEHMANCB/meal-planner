# Lifecycle: weekly-plan-leftovers

- Branch: `weekly-plan-leftovers`
- Stage: 2 Propose + preflight
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-23

## Interview summary

Approved: yes (2026-10-23, summary and mockups confirmed by the user)

**Goal.** Make `/plan` a working weekly planner and `/leftovers` a working fridge view. You put recipes and foods on meal slots for a Mon–Sun week. Cooking a recipe makes a leftover batch, and later slots draw servings from it.

**Design.** Claude Design pass on the mockup canvas (https://claude.ai/artifact/LZ2eJMT726E4PtF5XzNMd5, row "Weekly plan and leftovers"): `Plan.dc.html` (desktop week), `Picker.dc.html` (add dialog: Recipe, Leftover and Food tabs, create food shown), `PlanPhone.dc.html` (phone day list), `Leftovers.dc.html`.

**In scope**
- Week view at `/plan`, Mon–Sun, with previous, next and "This week" buttons. The week is in the URL (`/plan?week=YYYY-MM-DD`, a Monday). Today is highlighted. Past weeks stay editable.
- Slots are breakfast, lunch, dinner and snack. A slot holds **several** entries, and each entry can be removed on its own.
- Three kinds of entry:
  - **Cook** a recipe: servings to cook N, eaten at this meal M (1 ≤ M ≤ N). This creates a leftover batch with N − M spare servings, cooked on that date, eat by cook date + 4 days.
  - **Leftover:** draws S servings from a batch with enough free servings.
  - **Food:** amount + unit, where the unit is `g` or a unit in that food's `food_units` (for example `each`, `cup`).
- Adding works two ways:
  - **Picker:** "+ Add" in any slot opens a dialog with Recipe, Leftover and Food tabs.
  - **Drag-and-drop on desktop:** drag a recipe from the shelf onto a slot to add a cook, then set servings.
  - The phone uses only the picker.
- Food tab: search your custom foods plus shared foods (`foods.user_id` null). When nothing matches, "Create '<query>'" makes a custom food (name; kcal, protein, carbs and fat per 100 g) and adds it to the slot.
- Leftover rules:
  - A leftover can only go in a slot **after** the cook: a later date, or the same date in a later slot (breakfast < lunch < dinner < snack).
  - A slot past the batch's eat-by date is allowed, with a "Past eat-by" warning in the grid and the picker.
  - Drawing more than the batch's free servings is refused by the server.
- Removing a cook that has leftover draws: a confirmation lists the drawn meals, and confirming removes them and the batch too.
- Editing an entry's servings or amount is done by reopening it in the picker. A cook can't drop below eaten + drawn servings.
- The "In the fridge" panel on `/plan` and the `/leftovers` page list batches with cooked date, eat-by, cooked and eaten counts, free servings, and the planned draws (chips; past-eat-by draws flagged). `/leftovers` also has a **Throw out** action (confirmed) and a "Finished or thrown out (last 2 weeks)" list.
- Phones (below tablet width) get a day-by-day list instead of the grid.
- Deleting a recipe that is on the plan: the confirm text says "on N planned meals", and confirming removes its planned meals (cooks and leftovers) and batches.

**Out of scope:** calories in the grid and day totals, the "Build grocery list" button, grocery and nutrition logging, editing eat-by, off-plan batches, copying last week, USDA/OFF food import, household sharing.

**Data.** One additive migration:
- `planned_meals`: `recipe_id` becomes nullable; add `food_id`, `quantity` and `unit`. A cook keeps eaten servings in `servings` and links to its batch.
- `leftover_batches`: add a link to the cook entry and a thrown-out marker.
- Possibly `user_id` on `planned_meals` for direct filtering (decided in the design).
- Custom foods are rows in `foods` with `user_id` = uid.
- Free servings = spare − sum of planned draws; that rule lives in pure domain code with Vitest specs.

**Security.** Every query filters by the owner: plans, entries and batches by `user_id`; foods by `user_id = uid OR user_id IS NULL` for reads, own rows only for writes. Another user's plan, entry, batch or custom food looks exactly like a missing one (404 or not found). Plan and leftover data go through a server store (like `getRecipeStore()`), never straight from a route.

**Concurrency.** The Neon HTTP driver has no interactive transactions. Over-drawing a batch must be impossible even when two requests race: a conditional update, or the WebSocket `Pool` driver. Decided in the design.

**Acceptance (by hand)**
- WHEN I cook Turkey chili Mon dinner (cook 6, eat 2) THEN the fridge shows Turkey chili with 4 free.
- WHEN I add a leftover of it to Tue lunch (1) THEN it shows as a dashed Leftover chip and the fridge shows 3 free.
- WHEN I try to draw it for Mon breakfast THEN it is not offered (before the cook).
- WHEN I draw it for Sat lunch THEN it is added with "Past eat-by (Fri)".
- WHEN I remove Mon dinner's cook THEN I'm asked to confirm, and its leftovers disappear too.
- WHEN I search foods for "greek yogurt" with none existing THEN I can create it and it appears as "Greek yogurt 170 g".
- WHEN I throw out a batch on `/leftovers` THEN it moves to "Finished or thrown out".
- WHEN a second user opens my week URL or batch THEN they see their own empty week and nothing of mine.
- WHEN I drag a recipe from the shelf onto a slot (desktop) THEN the servings dialog opens for a cook there.
- WHEN I'm on a phone THEN I see days as a list and can add through the picker.

**Rollout.** Migration only (runs on `develop`, then `production`); no new secrets or console changes.

**Assumptions**
- The week starts Monday. "Today" comes from the browser's local date.
- Eat-by is fixed at 4 days after cooking.
- A thrown-out batch keeps its planned draws on the plan, shown as "gone".
- Drag-and-drop needs a keyboard-accessible alternative, which is the picker.

Requested extra: a Claude Design pass for this feature during the interview (user request, 2026-10-23). Done the same day.

## Gate A

Approved: no
Accepted preflight gaps: none

## Preflight

Run 2026-10-23. GitHub backend: **gh**.

| Check | Result |
| --- | --- |
| git identity, commit and push | OK: committed the proposal and pushed `weekly-plan-leftovers` to origin |
| `gh auth status` | OK: rhit-LEHMANCB, scopes `repo`, `workflow` |
| `develop` rules | OK: PR required, required check `verify`, no force-push or delete |
| Playwright `qa` project, browsers | OK: `playwright.config.ts` project `qa`; Chromium installed |
| QA credentials | OK: `.env.qa` copied from the main checkout, gitignored and untracked; all four `QA_*` user keys set (`QA_BASE_URL` unset, so the dev site default is used). **Gap:** `chmod 600` has no effect on Windows NTFS |
| Dev site | OK: `/api/health` returns `{"db":"ok"}` |
| Node | **Gap:** local Node is v22.23.2; `.nvmrc` and engines say 24, and there is no version manager on this machine. CI runs Node 24 |
| `npm run lint` / `check` / `test` | OK: 28 files, 372 tests (integration specs included) |
| `npm run build` / `check:server` | OK |
| Test database | OK: `TEST_DATABASE_URL` resolves to the Neon `dev` branch endpoint, not production; `neon connection-string dev` works for running migrations |
| GitHub `develop` environment | OK: `DATABASE_URL_UNPOOLED` present; this change needs no new secrets |
| `openspec validate --strict` | OK |

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
