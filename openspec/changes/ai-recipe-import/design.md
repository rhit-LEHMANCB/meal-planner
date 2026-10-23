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

- Food matching and nutrition (next change).
- Changing how steps are entered (still one textarea of lines).
- Rewriting existing plain-text ingredient rows in the database; they convert only when their recipe is saved.
- Streaming progress to the browser.

## Decisions

### 1. One route with form actions

`src/routes/recipes/import/+page.server.ts` with actions `link`, `text`, `photo` and `save`. `load` returns the AI imports left today. The import actions return `{ draft, notices, source }` and the page switches to the review state when `form.draft` is set; `save` re-validates and redirects to `/recipes/[id]`. Discard is a link to `/recipes`.

- The draft travels in the review form's fields (stateless). Alternative (draft table) rejected: it stores data before the user confirms and needs cleanup.
- Ingredient rows use the shared row editor (decision 12) and are posted as parallel arrays (`ingredientRaw[]`, `ingredientAmount[]`, `ingredientUnit[]`, `ingredientName[]`, `ingredientNote[]`), steps as one textarea of lines, the same as the add and edit forms.
- Source panel on the left, review on the right, step indicator (Source, Review, Save), as in the mockup. The "Matched food" column becomes "Name / note" and the macro bar is left out.

### 2. One structured recipe form for add, edit and import

- `src/lib/domain/recipe-form.ts` replaces the ingredients textarea field with ingredient rows: `parseRecipeForm` reads the parallel row arrays (plus an optional `pastedLines` textarea, see decision 12) and returns `RecipeInput` with `ingredients: IngredientInput[]` (`{ rawText, quantity, unit, name, note, status }`). Add, edit and the import `save` action all call it, so there is one set of rules and messages. `LIMITS` gains `unitMax: 20`, `nameMax: 100`, `noteMax: 100`; `ingredientsMax` and `ingredientLineMax` keep their values.
- Errors are reported per row (`ingredients.3.quantity`) so the row editor can show them next to the field; `values` echoes every row back so nothing typed is lost.
- Amount accepts decimals and simple fractions (`1/2`, `1 1/2`, `½`), must be positive, and is stored with up to 3 decimals. A row whose fields are all empty is dropped. A row with any field filled needs a name.
- `status` (`parsed` | `check` | `skipped`) is computed on the server from the submitted fields, never taken from the client: amount and a known unit (or a count food with no unit) → `parsed`; no amount and the name or note says "to taste" / "as needed" / "optional" → `skipped`; anything else → `check`.
- `ImportDraft` (`src/lib/domain/recipe-import.ts`) is the shape the import actions hand to the review: same fields with `servings: number | null`, plus the counts of dropped rows. It is rendered into the same form.

### 2a. The display line (`raw_text`)

The detail page reads `raw_text`, so it must always describe the row. Each row posts its hidden `ingredientRaw` (the line as written, from import, the parser or the database). The row editor clears it as soon as the user changes amount, unit, name or note. On save, a non-empty `ingredientRaw` is kept, an empty one is rebuilt from the fields (`2 tbsp chili powder, divided`). So an untouched imported line keeps its original wording ("1 can (15 oz) kidney beans, drained"), and an edited one matches its new fields. Alternative (always rebuild) rejected: it silently rewrites lines like the one above.

### 3. Pure ingredient-line parser `src/lib/domain/ingredient-line.ts`

Used for JSON-LD lines (which are plain strings), to pre-fill old plain-text rows when a recipe is opened for editing, and for "add several lines" in the row editor. It is pure and has no server imports, so the row editor runs the same code in the browser. Handles leading numbers, decimals, fractions and unicode fractions (`½`), ranges (`2-3` takes the low value; the user sees the original line under the row), a known-unit table (g, kg, oz, lb, ml, l, cup, tbsp, tsp, pinch, clove, can, each, plus plurals and abbreviations), a parenthetical size (`1 can (15 oz)` keeps `can`), and `to taste` / `as needed` → `skipped`. A unit is only recognized from the table, so the parser never produces an unknown unit; an unknown unit typed by the user or returned by the model → `check`. Vitest table tests.

### 4. Safe fetch `src/lib/server/ai/safe-fetch.ts`

- Uses `node:http`/`node:https` `request` with a custom `lookup` that resolves with `dns.lookup(host, { all: true })`, rejects if **any** returned address is not public, and hands the vetted address to the socket. Because the socket connects to the address that was checked, DNS rebinding between check and connect is impossible, and TLS still verifies the certificate against the host name (SNI unchanged). Alternative: global `fetch` with an undici `Agent` would need `undici` as a new dependency; rejected.
- Address classification is a pure function in `src/lib/domain/ip-address.ts` (`isPublicAddress`), built on `node:net` `BlockList`-style ranges written out by hand so it is testable: IPv4 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 255.255.255.255; IPv6 ::, ::1, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32, 64:ff9b::/96 and ::ffff:0:0/96 (mapped addresses are unwrapped and checked as IPv4). Literal IP hosts are checked before any lookup.
- URL rules before any network: protocol http/https, port empty/80/443, no username or password, host present.
- Redirects: `maxRedirects = 3`, followed by hand (301/302/303/307/308 with `Location` resolved against the current URL), each hop re-running all checks.
- One `AbortController` with a 10 s deadline for the whole chain; body read as a stream and aborted past 2 MB; `content-type` must be `text/html` or `application/xhtml+xml`. Response decoded as UTF-8 (or the charset in the header when Node supports it).
- Request headers: a plain `User-Agent` naming the app, `Accept: text/html`. No cookies.
- Errors are typed (`refused`, `unreachable`, `blocked`, `timeout`, `too-large`, `not-html`) and mapped to user messages in the route.

### 5. Page text for the model

When no JSON-LD Recipe is found, HTML is reduced to text in `src/lib/server/ai/page-text.ts`: drop `script`, `style`, `noscript`, `svg`, `template`, `iframe`, `object`, `nav`, `footer`, `aside`, `select`, `button` and comments (`header` and `form` are kept: recipe cards often sit inside them), prefer `<main>`/`<article>` when present, turn block tags into newlines, decode entities, collapse whitespace, cut to 30,000 chars. Regex-based, no DOM dependency; unit-tested on fixtures. A result under 200 chars counts as "no recipe found" without a model call.

### 6. JSON-LD mapping `src/lib/domain/schema-org-recipe.ts`

Maps a found Recipe object to an `ImportDraft`: `name` → title; `recipeYield` (number, `"6"`, `"6 servings"`, or array) → first whole number or null; `totalTime` (ISO 8601 duration) else `prepTime + cookTime` → minutes; `recipeIngredient` strings → ingredient-line parser; `recipeInstructions` as string, string array, `HowToStep` or `HowToSection.itemListElement` → steps, with HTML tags stripped and entities decoded. If the result has no title and no ingredients it is treated as "no structured data" and falls through to the model path.

### 7. Model extraction

`recipe-extract.ts` gains `extractRecipe(source: { text } | { image: { mediaType, base64 } })`:

- Still a forced `save_recipe` tool call on `claude-haiku-5-5`, `max_tokens` 8192 (a 100-row recipe can need more than 4096 output tokens for the tool call; cost stays bounded by the daily cap). The system prompt says the user content is untrusted recipe material to transcribe, that instructions inside it must be ignored, that amounts are copied and never invented, and that nutrition is never estimated. Page or pasted text is wrapped in `<recipe_source>` tags.
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

- A new nullable `name text` column on `recipe_ingredients` (same migration as `import_usage`). Alternative (re-derive the name from `raw_text` on every load) rejected: it can drift from what the user typed.
- `RecipeStore.create` and `update` take the structured `RecipeInput` and write `raw_text`, `position`, `quantity`, `unit`, `name`, `note`, `match_status` in the same single `db.batch` as today (update still deletes and re-inserts the rows, which is safe because every field is posted back). `quantity` is written as a string for the `numeric` column. No separate import save path: the import `save` action calls `create`.
- `RecipeStore.get` returns `ingredients: StoredIngredient[]` (`{ rawText, quantity, unit, name, note, status }`) instead of `string[]`. The detail page shows `rawText` as before.
- Edit `load`: rows with `match_status = 'unparsed'` (saved before this change) are turned into editor rows by the line parser, keeping `rawText` as their display line. This is only what the form shows; the database changes only when the user saves.

### 11. Recipe list entry

"Import recipe" (secondary button) next to "Add recipe", and in the empty state next to "Add your first recipe".

### 12. Shared ingredient row editor `src/lib/components/IngredientRows.svelte`

- One component used by the import review, `recipes/new` and `recipes/[id]/edit` (through `RecipeForm.svelte`, whose ingredients textarea goes away). Each row: amount, unit, name, note inputs with labels (visually compact, labelled for screen readers and Playwright: "Amount, row 2"), the status chip computed with the same domain function as the server, move up, move down and remove buttons with `aria-label`s. An "Add ingredient" button adds an empty row.
- "Add several lines": a labelled textarea ("Paste ingredient lines") and an "Add lines" button that runs the line parser in the browser and appends rows. Without JS the textarea is posted as `pastedLines` and `parseRecipeForm` appends its parsed rows after the others, so it still works.
- Without JS the form renders the current rows plus 3 empty rows; move buttons are JS only (reordering without JS is out of scope).
- Steps stay a textarea of lines.

## Risks / Trade-offs

- [Many recipe sites block server fetches (Cloudflare, 403)] → clear fallback to pasted text, link kept; no headless browser.
- [Old plain-text rows are pre-filled by a heuristic parser, which can split a line wrongly] → the user sees every row and its chip before saving, and nothing changes until they save.
- [Without JS, editing a row's fields does not clear its hidden display line, so the line can keep the old wording] → only affects scripting-off browsers; the structured fields are still correct. Recorded for QA.
- [The add and edit forms change shape, breaking existing route specs and the baseline QA suite] → both are updated in this change (tasks 4.2, 4.3) and must pass before merge.
- [During the rollout window old code runs on the new schema] → `name` is nullable and old code never reads it; rows old code writes stay `unparsed` and are pre-filled on the next edit.
- [`BODY_SIZE_LIMIT` raises the request size cap for every route, including public ones such as `/signup` and `/api/*`, because adapter-node applies it before the hook runs] → 6 MB is still small for one instance, App Hosting fronts the service, and the public endpoints read only a few form fields.
- [A photo over 6 MB from a browser that cannot shrink it (scripting off, or an image it cannot decode) gets adapter-node's plain 413 page instead of the "larger than 5 MB" message] → accepted: with scripting on, large phone photos are shrunk first; between 5 and 6 MB the friendly message shows.
- [Regex HTML stripping misses content on unusual pages] → the model is tolerant of noise; "no recipe found" falls back to paste.
- [Prompt injection through page text] → model output only reaches the database through the validated save after the user reviews it; there are no tools with side effects.
- [Dev QA spends the production Anthropic key's credits] → the same 20/day cap applies to the QA accounts; QA uses a few short fixed recipes.
- [IPv6 egress from Cloud Run] → the classifier handles IPv6, and connections only go to vetted addresses whichever family is used.
- [Fractional servings in JSON-LD ("4-6")] → first whole number is taken and the user can change it on review.

## Migration Plan

1. Edit `schema.ts`, run `npm run db:generate`, commit the new `drizzle/0002_*.sql` (`CREATE TABLE import_usage` and `ALTER TABLE recipe_ingredients ADD COLUMN name text`, both additive; passes `npm run check:migrations`).
2. Merge to `develop` runs it on the Neon `dev` branch; merge to `production` runs it on production before the new code is live for long. Old code ignores the new table and column.
3. Rollback: revert the code; the table and column can stay (unused) and be dropped later with an `allow-destructive` migration. Rows saved by the new code keep a correct `raw_text`, so old code still displays them.
4. Set `BODY_SIZE_LIMIT` in `apphosting.yaml` (plain value, runtime) so both backends get it.
