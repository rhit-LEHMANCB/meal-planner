# Design

## Context

See proposal.md for why. Current state that shapes the approach:

- `src/lib/server/ai` has `recipe-schema.ts` (strict Zod schema with `rawText`, `quantity`, `unit`, `name`, `note` per ingredient), `recipe-extract.ts` (forced `save_recipe` tool call on `claude-haiku-5-5`, text only, throws on invalid output) and `schema-org.ts` (finds a JSON-LD Recipe). Nothing calls them.
- Recipes are written only through `makeRecipeStore` (`src/lib/server/recipes.ts`), which stores ingredient lines with `match_status = 'unparsed'`. `recipe_ingredients` already has nullable `quantity`, `unit` and `note` columns; there is no `name` column.
- Form validation lives in `src/lib/domain/recipe-form.ts` (`LIMITS`, `parseRecipeForm`).
- `/api/*` is public in `hooks.server.ts`, so the import must not live there.
- The Neon HTTP driver has no interactive transactions; single statements and `db.batch` only.
- App Hosting runs one instance (`maxInstances: 1`) of `node build` on Cloud Run, Node 24, 512 MiB.

## Goals / Non-Goals

**Goals:**

- Server-side fetching that cannot be pointed at internal addresses, including through DNS rebinding and redirects.
- Limits enforced in Postgres so they survive restarts and stay correct if `maxInstances` is raised.
- Pure, unit-tested domain code for everything that is not I/O (ingredient-line parsing, JSON-LD mapping, draft validation, address classification).

**Non-Goals:**

- Food matching, nutrition, a `name` column on `recipe_ingredients` (next change).
- Changing how the manual form or the edit page stores ingredients.
- Streaming progress to the browser.

## Decisions

### 1. One route with form actions

`src/routes/recipes/import/+page.server.ts` with actions `link`, `text`, `photo` and `save`. `load` returns the AI imports left today. The import actions return `{ draft, notices, source }` and the page switches to the review state when `form.draft` is set; `save` re-validates and redirects to `/recipes/[id]`. Discard is a link to `/recipes`.

- The draft travels in the review form's fields (stateless). Alternative (draft table) rejected: it stores data before the user confirms and needs cleanup.
- Ingredient rows are posted as parallel arrays (`ingredientRaw[]`, `ingredientAmount[]`, `ingredientUnit[]`, `ingredientName[]`, `ingredientNote[]`), steps as one textarea of lines, matching the manual form. Rows can be removed and added on the review (client-side `$state` list; without JS the page still posts what is shown).
- Source panel on the left, review on the right, step indicator (Source, Review, Save), as in the mockup. The "Matched food" column becomes "Name / note" and the macro bar is left out.

### 2. Import draft and validation in `src/lib/domain/recipe-import.ts`

- `ImportDraft`: `{ title, servings: number | null, totalMinutes, sourceUrl, ingredients: DraftIngredient[], steps: string[] }`, `DraftIngredient`: `{ raw, quantity, unit, name, note, status: 'parsed' | 'check' | 'skipped' }`.
- `parseImportForm(formData)` reuses `LIMITS` and the same messages as `parseRecipeForm` and returns `{ ok, value }` or `{ errors, values }` so the review re-renders with the user's edits. Amount accepts decimals and simple fractions (`1/2`, `1 1/2`) and is stored as a number with up to 3 decimals; unit max 20 chars; name and note max 100 chars.
- `status` is recomputed on save from the submitted fields, never trusted from the client.
- The display line saved as `raw_text` is rebuilt from the edited fields (`2 tbsp chili powder, divided`) when the user changed them, else the original line, so the existing detail and edit pages keep working unchanged.

### 3. Pure ingredient-line parser `src/lib/domain/ingredient-line.ts`

Used for JSON-LD lines (which are plain strings) and as a fallback to fill status for AI rows. Handles leading numbers, decimals, fractions and unicode fractions (`½`), ranges (`2-3` takes the low value and keeps the line flagged `check`), a known-unit table (g, kg, oz, lb, ml, l, cup, tbsp, tsp, pinch, clove, can, each, plus plurals and abbreviations), a parenthetical size (`1 can (15 oz)` keeps `can`), and `to taste` / `as needed` → `skipped`. Unknown unit with an amount → `check`. Vitest table tests.

### 4. Safe fetch `src/lib/server/ai/safe-fetch.ts`

- Uses `node:http`/`node:https` `request` with a custom `lookup` that resolves with `dns.lookup(host, { all: true })`, rejects if **any** returned address is not public, and hands the vetted address to the socket. Because the socket connects to the address that was checked, DNS rebinding between check and connect is impossible, and TLS still verifies the certificate against the host name (SNI unchanged). Alternative: global `fetch` with an undici `Agent` would need `undici` as a new dependency; rejected.
- Address classification is a pure function in `src/lib/domain/ip-address.ts` (`isPublicAddress`), built on `node:net` `BlockList`-style ranges written out by hand so it is testable: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 255.255.255.255; IPv6 ::, ::1, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32, 64:ff9b::/96 and ::ffff:0:0/96 (mapped addresses are unwrapped and checked as IPv4). Literal IP hosts are checked before any lookup.
- URL rules before any network: protocol http/https, port empty/80/443, no username or password, host present.
- Redirects: `maxRedirects = 3`, followed by hand (301/302/303/307/308 with `Location` resolved against the current URL), each hop re-running all checks.
- One `AbortController` with a 10 s deadline for the whole chain; body read as a stream and aborted past 2 MB; `content-type` must be `text/html` or `application/xhtml+xml`. Response decoded as UTF-8 (or the charset in the header when Node supports it).
- Request headers: a plain `User-Agent` naming the app, `Accept: text/html`. No cookies.
- Errors are typed (`refused`, `unreachable`, `blocked`, `timeout`, `too-large`, `not-html`) and mapped to user messages in the route.

### 5. Page text for the model

When no JSON-LD Recipe is found, HTML is reduced to text in `src/lib/server/ai/page-text.ts`: drop `script`, `style`, `noscript`, `svg`, `nav`, `header`, `footer`, `aside` and comments, prefer `<main>`/`<article>` when present, turn block tags into newlines, decode entities, collapse whitespace, cut to 30,000 chars. Regex-based, no DOM dependency; unit-tested on fixtures. A result under 200 chars counts as "no recipe found" without a model call.

### 6. JSON-LD mapping `src/lib/domain/schema-org-recipe.ts`

Maps a found Recipe object to an `ImportDraft`: `name` → title; `recipeYield` (number, `"6"`, `"6 servings"`, or array) → first whole number or null; `totalTime` (ISO 8601 duration) else `prepTime + cookTime` → minutes; `recipeIngredient` strings → ingredient-line parser; `recipeInstructions` as string, string array, `HowToStep` or `HowToSection.itemListElement` → steps, with HTML tags stripped and entities decoded. If the result has no title and no ingredients it is treated as "no structured data" and falls through to the model path.

### 7. Model extraction

`recipe-extract.ts` gains `extractRecipe(source: { text } | { image: { mediaType, base64 } })`:

- Still a forced `save_recipe` tool call on `claude-haiku-5-5`, `max_tokens` 4096. The system prompt says the user content is untrusted recipe material to transcribe, that instructions inside it must be ignored, that amounts are copied and never invented, and that nutrition is never estimated. Page or pasted text is wrapped in `<recipe_source>` tags.
- The tool input schema stays the existing strict schema (it steers the model). The result is then validated with a new **lenient** schema in `recipe-schema.ts`: title, servings, totalMinutes are each `.catch(null)`; ingredients and instructions are arrays of unknown items, each validated individually so bad rows are counted and dropped. Returned as `{ draft, droppedIngredients, droppedSteps }`.
- No `tool_use` block, `stop_reason` of `refusal`, or nothing usable → `NoRecipeFound`.
- Retry once, after 1 s, only on `APIConnectionError`, 429, 500, 529; SDK `maxRetries: 0` so we control it; 45 s timeout per call.

### 8. Usage limits in Postgres: table `import_usage`

One row per user: `user_id text primary key`, `day date not null`, `ai_count integer not null default 0`, `last_import_at timestamp with time zone not null`. One row per user (rather than per user and day, as first sketched) because the cooldown must work across midnight and a single row keeps both checks to one statement each.

- **Cooldown** (every import, before any fetch or model call), one statement:
  `INSERT … VALUES (uid, today, 0, now()) ON CONFLICT (user_id) DO UPDATE SET last_import_at = now(), day = today, ai_count = CASE WHEN import_usage.day = today THEN import_usage.ai_count ELSE 0 END WHERE import_usage.last_import_at < now() - interval '10 seconds' RETURNING ai_count`. No row returned → cooldown message.
- **AI slot** (just before a model call): `UPDATE import_usage SET ai_count = ai_count + 1 WHERE user_id = uid AND day = today AND ai_count < 20 RETURNING ai_count`. No row → cap message, no call. Atomic, so parallel requests cannot exceed 20.
- **Refund**: if the call fails before the API accepted it (connection error, or 429/529 on the final attempt), `ai_count = greatest(ai_count - 1, 0)`. Any response that reached the model counts.
- `today` is computed in SQL as `(now() at time zone 'utc')::date` so the server clock and timezone do not matter.
- Lives in `src/lib/server/import-usage.ts` (`makeImportUsage(db)`), every method takes the user id. Integration tests run against the Neon `dev` branch under `TEST_DATABASE_URL`, like the recipe store.

Alternative: in-memory map. Rejected: lost on every scale-to-zero restart, wrong with more than one instance.

### 9. Photos

- Client: before submit, if the file is an image over 1600 px on its long side or over 1.5 MB, draw it to a canvas at most 1600 px and `toBlob('image/jpeg', 0.85)`, then replace the file input's file via `DataTransfer`. HEIC in browsers that cannot decode it is left as is and rejected by the server. `accept="image/jpeg,image/png,image/webp"`, `capture` not set.
- Server: `request.formData()` with the body already limited (`BODY_SIZE_LIMIT` is set to 6 MB for adapter-node, and the action checks `file.size <= 5 MB`). Magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`. The bytes go to the model as a base64 image block with the sniffed media type and are not kept after the request; nothing logs them.

### 10. Saving

`RecipeStore` gets `createImported(userId, input: ImportedRecipeInput)` that writes the recipe and ingredient rows (`raw_text`, `position`, `quantity`, `unit`, `note`, `match_status`) in one `db.batch`, sharing the existing private helpers. Existing `create`/`update` are untouched. `quantity` is written as a string for the `numeric` column.

### 11. Recipe list entry

"Import recipe" (secondary button) next to "Add recipe", and in the empty state next to "Add your first recipe".

## Risks / Trade-offs

- [Many recipe sites block server fetches (Cloudflare, 403)] → clear fallback to pasted text, link kept; no headless browser.
- [Editing an imported recipe on the existing edit page rewrites its ingredients as free text with `unparsed` status, dropping amount/unit/note] → accepted for now: the next (nutrition) change re-parses ingredient lines; noted in the deferred list.
- [`BODY_SIZE_LIMIT` raises the request size cap for every route] → 6 MB is still small, and only signed-in users reach non-public routes; the hook runs before body parsing.
- [Regex HTML stripping misses content on unusual pages] → the model is tolerant of noise; "no recipe found" falls back to paste.
- [Prompt injection through page text] → model output only reaches the database through the validated save after the user reviews it; there are no tools with side effects.
- [Dev QA spends the production Anthropic key's credits] → the same 20/day cap applies to the QA accounts; QA uses a few short fixed recipes.
- [IPv6 egress from Cloud Run] → the classifier handles IPv6, and connections only go to vetted addresses whichever family is used.
- [Fractional servings in JSON-LD ("4-6")] → first whole number is taken and the user can change it on review.

## Migration Plan

1. Edit `schema.ts`, run `npm run db:generate`, commit the new `drizzle/0002_*.sql` (one `CREATE TABLE`, additive; passes `npm run check:migrations`).
2. Merge to `develop` runs it on the Neon `dev` branch; merge to `production` runs it on production before the new code is live for long. Old code ignores the new table.
3. Rollback: revert the code; the table can stay (unused) and be dropped later with an `allow-destructive` migration.
4. Set `BODY_SIZE_LIMIT` in `apphosting.yaml` (plain value, runtime) so both backends get it.
