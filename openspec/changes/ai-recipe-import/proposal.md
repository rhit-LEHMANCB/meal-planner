# Proposal

## Why

Typing a recipe in by hand is the slowest part of using the app, and most recipes already exist as a web page, a block of text or a photo. The AI parsing code (`src/lib/server/ai`) exists but is not wired to anything. This change lets a user import a recipe and fix it on a review screen before anything is saved, while keeping the public site from becoming a way to spend the owner's Anthropic credits or to make the server fetch internal addresses.

## What Changes

- New page `/recipes/import`, reached from an "Import recipe" button on the recipe list, with three sources in priority order: a link, pasted text, and a photo.
- Links are fetched by the server under strict SSRF rules (public addresses only, re-checked on every redirect, time and size limits). Pages with schema.org Recipe data are imported without a model call; other pages, pasted text and photos are parsed by Claude (`claude-haiku-5-5`).
- Every import ends on an editable review screen (title, servings, total time, source link, ingredient rows with amount, unit, name and note, and steps). Nothing is written to the recipe tables until the user chooses "Save to recipe shelf"; "Discard" saves nothing.
- Ingredients are stored with their structured fields (`quantity`, `unit`, `name`, `note`) next to the display line, and a status of `parsed`, `check` or `skipped` that drives the chip on the review screen.
- The add-recipe and edit-recipe forms switch from a text box of ingredient lines to the same structured row editor as the import review (amount, unit, name, note, status chip, add, remove, move up and down, and a box to add several pasted lines at once). Editing a recipe keeps every row's amount, unit, name and note. Older recipes whose lines were saved as plain text are pre-filled by the built-in (non-AI) line parser when opened for editing, and stored as structured rows when saved.
- Cost and abuse limits: 20 model-backed imports per user per UTC day, a 10-second cooldown between imports, and size limits on pasted text (20,000 characters), page text sent to the model (30,000 characters) and photos (5 MB). Usage is kept in a new additive table.
- Photos are resized in the browser, checked on the server, sent to the model and never stored.
- Invalid or partial model output is salvaged where possible and flagged on the review screen; it never reaches the database without passing the save validation.
- Out of scope: seeding foods, matching ingredients to foods and showing calories (next change); headless-browser fetching; storing photos; changing how steps are entered (still one per line).

## Capabilities

### New Capabilities

- `recipe-import`: importing a recipe from a link, pasted text or a photo into an editable review that the user confirms before saving, including fetch safety, usage limits and handling of bad parses.

### Modified Capabilities

- `recipes`: creating and editing a recipe use structured ingredient rows instead of free-text lines, ingredient order and blank-row handling are restated for rows, and editing must keep each row's amount, unit, name and note. Viewing, listing, deleting and privacy are unchanged.

## Impact

- Routes: new `src/routes/recipes/import/` (page, form actions); recipe list page gets an "Import recipe" link; `recipes/new` and `recipes/[id]/edit` use the new ingredient row editor.
- Components: a shared ingredient-rows editor used by import review, add and edit; `RecipeForm.svelte` loses its ingredients textarea.
- Server: new safe fetcher and import orchestration in `src/lib/server/ai`; `recipe-extract.ts` extended for page text, pasted text and images and given a lenient schema; the `recipes.ts` store reads and writes structured ingredient fields on create and update.
- Domain: pure ingredient-line parser, JSON-LD to draft mapping and one structured recipe-form validation (shared by import, add and edit) in `src/lib/domain`, with Vitest specs.
- Database: one additive migration adding `import_usage` and a nullable `name` column on `recipe_ingredients`.
- Tests: route specs for add and edit, and the baseline QA suite `tests/qa/smoke.spec.ts`, are updated for ingredient rows.
- External: Anthropic API spend (capped); outbound HTTP from Cloud Run to recipe sites.
- No new secrets; `ANTHROPIC_API_KEY` already reaches both backends. One plain runtime setting, `BODY_SIZE_LIMIT`, is added to `apphosting.yaml` for photo uploads.
