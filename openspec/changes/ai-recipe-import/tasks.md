# Tasks

## 1. Data: usage table

- [ ] 1.1 Add `import_usage` (`user_id` primary key, `day`, `ai_count`, `last_import_at`) to `src/lib/server/db/schema.ts`, run `npm run db:generate`, commit `drizzle/0002_*.sql`; verify `npm run check:migrations` passes and the SQL is a single `CREATE TABLE`
- [ ] 1.2 Implement `makeImportUsage(db)` in `src/lib/server/import-usage.ts` (cooldown upsert, AI slot reserve, refund, remaining today, all keyed by user id, UTC day in SQL); verify with `import-usage.integration.spec.ts` covering cooldown, the 20 cap under parallel reserves, day rollover and per-user isolation (runs with `TEST_DATABASE_URL`, cleans up its rows)

## 2. Domain: pure parsing and validation

- [ ] 2.1 Implement `isPublicAddress` in `src/lib/domain/ip-address.ts`; verify Vitest cases for every blocked IPv4/IPv6 range, IPv4-mapped IPv6, and public addresses
- [ ] 2.2 Implement the ingredient-line parser in `src/lib/domain/ingredient-line.ts` (numbers, fractions, unicode fractions, ranges, unit table, parenthetical sizes, to taste → skipped, unknown unit → check); verify table-driven Vitest specs including "1 lb ground turkey", "1 can (15 oz) kidney beans, drained", "Salt to taste", "½ cup milk", "2-3 cloves garlic"
- [ ] 2.3 Implement the JSON-LD to draft mapper in `src/lib/domain/schema-org-recipe.ts` (yield, ISO 8601 durations, instruction shapes incl. HowToSection, HTML stripping); verify Vitest specs with representative fixtures
- [ ] 2.4 Implement `ImportDraft` types, status computation, display-line rebuild and `parseImportForm` in `src/lib/domain/recipe-import.ts`, reusing `LIMITS` and messages from `recipe-form.ts`; verify Vitest specs for missing servings, too many rows, bad amounts, fractions, status recomputed server-side, and user edits echoed back on error

## 3. Server: fetching and extraction

- [ ] 3.1 Implement `safeFetch` in `src/lib/server/ai/safe-fetch.ts` (URL rules, vetted `lookup`, manual redirects ≤3, 10 s deadline, 2 MB cap, HTML only, typed errors); verify Vitest specs with an injected resolver and a local test server: literal private IPs refused with no connection, host resolving to private refused, redirect to 127.0.0.1 refused, 4 redirects refused, oversize and non-HTML refused, a public page read
- [ ] 3.2 Implement `pageText` in `src/lib/server/ai/page-text.ts`; verify Vitest specs on HTML fixtures (scripts/nav removed, main preferred, entities decoded, 30,000 cap)
- [ ] 3.3 Extend `recipe-extract.ts` for text and image sources, add the lenient schema to `recipe-schema.ts`, the injection-resistant system prompt, the one-retry policy and `NoRecipeFound`; verify Vitest specs with a mocked Anthropic client for valid, partial (dropped rows counted), no tool call, refusal, and retry-then-fail cases
- [ ] 3.4 Implement the import orchestration in `src/lib/server/ai/import.ts` (cooldown → JSON-LD path or AI slot → model → refund rules → draft), with photo magic-byte sniffing and the 20,000 / 5 MB limits checked before any slot is reserved; verify Vitest specs with fakes that JSON-LD imports never reserve a slot, cap and cooldown block the model, refused input never reserves a slot, and refunds happen only on pre-acceptance failures
- [ ] 3.5 Add `createImported` to the recipe store writing `quantity`, `unit`, `note`, `match_status` in one batch; verify in `recipes.integration.spec.ts` that structured fields and order are stored and another user cannot read the recipe

## 4. UI: import page and review

- [ ] 4.1 Add `src/routes/recipes/import/+page.server.ts` with `load` (AI imports left) and `link`, `text`, `photo`, `save` actions using `requireUserId` and `getRecipeStore()`; verify route specs (pattern of `src/routes/recipes/recipes.spec.ts`) for redirect when signed out, error mapping, save success redirect, and save validation errors keeping edits
- [ ] 4.2 Build `+page.svelte`: source tabs (Link, Paste text, Photo), counter, step indicator, review with editable ingredient rows (add/remove), chips Parsed / Check / No amount, steps, notices (structured data found, N lines could not be read, blocked → Paste text instead keeping the link), Discard and Save to recipe shelf, styled with the existing tokens; verify `npm run check` and a component/page spec rendering the review from a draft
- [ ] 4.3 Add client-side photo downscaling (≤1600 px JPEG via canvas, `DataTransfer`) with the server limits unchanged; verify by unit test of the size decision function and a manual check in the browser preview
- [ ] 4.4 Add "Import recipe" to the recipe list header and empty state; verify `src/routes/recipes/pages.spec.ts` covers the link
- [ ] 4.5 Set `BODY_SIZE_LIMIT=6M` in `apphosting.yaml` (runtime, plain value) and document the import limits and `import_usage` in `CLAUDE.md`; verify `npm run build` and a local `node build` accepts a 5 MB upload

## 5. QA and integration checks

- [ ] 5.1 Run `npm run lint`, `npm run check`, `npm test`, `npm run build`, `npm run check:server` and `npm run check:migrations`; verify all pass
- [ ] 5.2 Run `npm run test:qa -- tests/qa/smoke.spec.ts --list` and confirm the baseline suite still compiles with the new routes (the full QA run against the dev site happens after merge, never against production)
