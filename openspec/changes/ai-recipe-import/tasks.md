# Tasks

## 1. Data: usage table and ingredient name

- [x] 1.1 Add `import_usage` (`user_id` primary key, `day`, `ai_count`, `last_import_at`) and a nullable `name` column on `recipe_ingredients` to `src/lib/server/db/schema.ts`, run `npm run db:generate`, commit `drizzle/0002_*.sql`; verify `npm run check:migrations` passes and the SQL is only a `CREATE TABLE` and an `ADD COLUMN name text`
- [x] 1.2 Implement `makeImportUsage(db)` in `src/lib/server/import-usage.ts` (cooldown upsert, AI slot reserve, refund, remaining today, all keyed by user id, UTC day in SQL); verify with `import-usage.integration.spec.ts` covering cooldown, the 20 cap under parallel reserves, day rollover and per-user isolation (runs with `TEST_DATABASE_URL`, cleans up its rows)

## 2. Domain: pure parsing and validation

- [x] 2.1 Implement `isPublicAddress` in `src/lib/domain/ip-address.ts`; verify Vitest cases for every blocked IPv4/IPv6 range, IPv4-mapped IPv6, and public addresses
- [x] 2.2 Implement the ingredient-line parser and the row status function in `src/lib/domain/ingredient-line.ts` (numbers, fractions, unicode fractions, ranges, unit table, parenthetical sizes, to taste → skipped, unknown unit → check; no server imports); verify table-driven Vitest specs including "1 lb ground turkey", "1 can (15 oz) kidney beans, drained", "Salt to taste", "½ cup milk", "2-3 cloves garlic", "1 cup rice"
- [x] 2.3 Implement the JSON-LD to draft mapper in `src/lib/domain/schema-org-recipe.ts` (yield, ISO 8601 durations, instruction shapes incl. HowToSection, HTML stripping); verify Vitest specs with representative fixtures
- [x] 2.4 Change `parseRecipeForm` in `src/lib/domain/recipe-form.ts` to structured ingredient rows (parallel arrays, `pastedLines` appended, per-row errors, amount fractions, empty rows dropped, name required on a non-empty row, server-computed status, display-line keep-or-rebuild rule, new `LIMITS`), and add `ImportDraft` in `src/lib/domain/recipe-import.ts`; verify `recipe-form.spec.ts` is updated and covers order, blank rows, invalid amount, row without name, too many rows, kept vs rebuilt display line, status never taken from the client, and every row echoed back on error

## 3. Server: store, fetching and extraction

- [x] 3.1 Change the recipe store: `create` and `update` write `quantity`, `unit`, `name`, `note` and computed `match_status` in the same single batch, `get` returns structured ingredients; verify `recipes.integration.spec.ts` covers structured fields and order surviving create, an update that changes only the title, a reorder, and that another user still gets not-found
- [x] 3.2 Implement `safeFetch` in `src/lib/server/ai/safe-fetch.ts` (URL rules, vetted `lookup`, manual redirects ≤3, 10 s deadline, 2 MB cap, HTML only, typed errors); verify Vitest specs with an injected resolver and a local test server: literal private IPs refused with no connection, host resolving to private refused, redirect to 127.0.0.1 refused, 4 redirects refused, oversize and non-HTML refused, a public page read
- [x] 3.3 Implement `pageText` in `src/lib/server/ai/page-text.ts`; verify Vitest specs on HTML fixtures (scripts/nav removed, main preferred, entities decoded, 30,000 cap)
- [x] 3.4 Extend `recipe-extract.ts` for text and image sources, add the lenient schema to `recipe-schema.ts`, the injection-resistant system prompt, the one-retry policy and `NoRecipeFound`; verify Vitest specs with a mocked Anthropic client for valid, partial (dropped rows counted), no tool call, refusal, and retry-then-fail cases
- [x] 3.5 Implement the import orchestration in `src/lib/server/ai/import.ts` (cooldown → JSON-LD path or AI slot → model → refund rules → draft), with photo magic-byte sniffing and the 20,000 / 5 MB limits checked before any slot is reserved; verify Vitest specs with fakes that JSON-LD imports never reserve a slot, cap and cooldown block the model, refused input never reserves a slot, and refunds happen only on pre-acceptance failures

## 4. UI: row editor, add/edit forms, import page

- [x] 4.1 Build `src/lib/components/IngredientRows.svelte` (labelled amount/unit/name/note inputs per row, status chip, move up/down, remove, add ingredient, "Paste ingredient lines" + "Add lines" using the domain parser, hidden display line cleared on edit, 3 empty rows without JS, per-row errors); verify a component spec for add, remove, reorder, paste lines and chip updates
- [x] 4.2 Replace the ingredients textarea in `RecipeForm.svelte` with `IngredientRows`; update `recipes/new` and `recipes/[id]/edit` (edit `load` pre-fills `unparsed` rows with the line parser without writing to the database); verify the route specs in `src/routes/recipes/` cover create with rows, edit that keeps amount/unit/name/note, edit of an older plain-text recipe, and validation errors keeping every row
- [x] 4.3 Update `tests/qa/smoke.spec.ts` for ingredient rows (create, reopen, edit) keeping its existing checks; verify `npx playwright test --project=qa --list` lists it and it type-checks (it runs against the dev site in QA)
- [x] 4.4 Add `src/routes/recipes/import/+page.server.ts` with `load` (AI imports left) and `link`, `text`, `photo`, `save` actions using `requireUserId` and `getRecipeStore()`; verify route specs for redirect when signed out, error mapping, save success redirect, and save validation errors keeping edits
- [x] 4.5 Build `src/routes/recipes/import/+page.svelte`: source tabs (Link, Paste text, Photo), counter, step indicator, review using `RecipeForm`/`IngredientRows`, notices (structured data found, N lines could not be read, blocked → Paste text instead keeping the link), Discard and Save to recipe shelf, styled with the existing tokens; verify `npm run check` and a page spec rendering the review from a draft
- [x] 4.6 Add client-side photo downscaling (≤1600 px JPEG via canvas, `DataTransfer`) with the server limits unchanged; verify by unit test of the size decision function and a manual check in the browser preview
- [x] 4.7 Add "Import recipe" to the recipe list header and empty state; verify `src/routes/recipes/pages.spec.ts` covers the link
- [x] 4.8 Set `BODY_SIZE_LIMIT=6M` in `apphosting.yaml` (runtime, plain value) and document the import limits, `import_usage`, the `name` column and the row editor in `CLAUDE.md` (replacing the "free text, one per line" note); verify `npm run build` and a local `node build` accepts a 5 MB upload

## 5. Integration checks

- [x] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run check:server` and `npm run check:migrations`; verify all pass
- [x] 5.2 Run `npx playwright test --project=qa --list` and confirm the baseline suite and any new QA specs compile (the full QA run against the dev site happens after merge, never against production)
