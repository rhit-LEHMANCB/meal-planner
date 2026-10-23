# Lifecycle: ai-recipe-import

- Branch: `ai-recipe-import`
- Stage: 1 Interview
- Review round: 0 of 3
- QA cycle: 0 of 3
- Started: 2026-10-23

## Interview summary

(approved: yes, 2026-10-23)

**Goal.** A signed-in user adds a recipe by importing it from a link, pasted text or a photo (in that priority order). Every import ends on an editable review screen; nothing is written to the recipe tables until the user confirms with "Save to recipe shelf".

**Scope**

- New page `/recipes/import` with Link / Paste text / Photo tabs, reached from an "Import recipe" button on the recipes list. Submitting shows the review state on the same page: source panel on the left, editable recipe on the right (mockup board "AI recipe import: review"). Save creates the recipe through `getRecipeStore()` and redirects to its detail page; Discard returns to the list. Works through SvelteKit form actions (progressive enhancement), not under `/api/*` (which is public).
- Wire up the existing `src/lib/server/ai` code: `schema-org.ts` (JSON-LD), `recipe-extract.ts` (Claude tool use, `claude-haiku-5-5`), `recipe-schema.ts` (Zod).
- Structured ingredients: each row has amount, unit, name, note, editable on review. Saved as `raw_text` (the cleaned display line) plus `quantity`, `unit`, `note` in the existing nullable columns. No foods matching.

**Out of scope (next change):** seeding `foods`, matching ingredients to foods, per-recipe calories/macros. The review screen leaves out the mockup's "Matched food" column and per-serving macro bar. Headless-browser fetching. Storing photos. Changing the manual recipe form (it still saves free-text lines as `unparsed`).

**Users and access.** Same as recipes: allowlisted, verified users only; user id from `requireUserId(locals)`; all writes through the owner-scoped store. The import action never returns another user's data. Usage counters are per user.

**Data**

- New additive table `import_usage` (`user_id`, `day` (UTC date), `count`, primary key on user and day) for the daily cap. One additive migration; passes `check:migrations`.
- `recipe_ingredients.match_status` for imported rows: `parsed` (amount and unit understood), `check` (amount missing where one was expected, or unit not recognized), `skipped` ("to taste", no amount). Manual recipes keep `unparsed`. No column changes.

**Link fetching (SSRF)**

- http/https only, ports 80/443 only, no credentials in the URL.
- Resolve DNS and refuse private, loopback, link-local, CGNAT, multicast, unspecified and cloud-metadata addresses (IPv4 and IPv6, including IPv4-mapped IPv6); connect to the vetted address so DNS rebinding cannot swap it.
- Redirects followed manually, at most 3, each hop re-checked.
- 10 s total timeout, 2 MB response cap (streamed, aborted past the cap), `text/html` (or `application/xhtml+xml`) only.
- JSON-LD Recipe found: mapped in code, no model call. Ingredient lines from JSON-LD are still split into amount/unit/name/note by a pure parser in `src/lib/domain` (no model), and rows it cannot split are marked `check`.
- No JSON-LD: page stripped to text (scripts, styles, nav removed) and sent to the model, capped at 30,000 characters.
- Blocked (403/429/5xx), timeout, too big, non-HTML, or empty: a clear message with a "Paste text instead" action; the link is kept and pre-fills the source link on review.

**Cost and abuse limits**

- Model-backed imports (paste, photo, link without JSON-LD): at most 20 per user per UTC day, counted in `import_usage`. A call counts once tokens were spent, even if the output is then unusable. JSON-LD imports are free and not counted.
- 10 s per-user cooldown between any two imports (also tracked in Postgres, so it holds across restarts).
- Pasted text at most 20,000 characters; page text to model at most 30,000; photo at most 5 MB after client resize.
- Over the cap: a plain message saying how many imports are left tomorrow; the paste/manual paths stay available.

**Photo**

- JPEG, PNG or WebP. In the browser the image is downscaled to about 1600 px on the long side and re-encoded as JPEG before upload; without JS the original is uploaded and must still be 5 MB or less.
- The server checks size and magic bytes (not the extension or MIME type), sends it to the model as an image block, and discards it. Never written to disk, Storage or the database, never logged.
- Same Haiku model.

**Invalid or partial model output**

- A lenient import schema keeps every valid field. Missing title or servings are left blank for the user to fill in (servings are never guessed). Unusable ingredient or step rows are dropped and the review says how many.
- No tool call, invalid JSON, refusal or empty result: a plain message, the source stays filled in so the user can retry or switch source or enter the recipe by hand.
- One automatic retry only for transient API errors (overloaded, 5xx, timeout); never for bad content.
- The model's output is untrusted input: the save action re-validates everything with the existing recipe limits.

**Review state.** Stateless: the import action returns the draft to the page; the review form posts the user's edits to a save action that re-validates server-side. A refresh loses the draft.

**Security notes.** No secrets or prompts in logs. Page text and pasted text go to Anthropic; nothing else about the user does. The system prompt tells the model to treat the source as data and to copy, never invent, amounts; output can only reach the database through the validated save action. Model numbers are never used for nutrition.

**Acceptance (by hand)**

- WHEN I import a link to a page with schema.org Recipe data, THEN the review shows its title, servings, time, ingredients split into amount/unit/name/note and steps, without spending a model call (usage count unchanged).
- WHEN I import a link without structured data, THEN the model parses the page and the review shows the result, and my daily count goes up by one.
- WHEN I import `http://169.254.169.254/` or a link that redirects to `127.0.0.1`, THEN the import is refused with a message and nothing is fetched from that address.
- WHEN a site blocks fetching, THEN I see a message and can paste the text instead with the link kept.
- WHEN I paste a recipe, THEN I see it on the review screen; WHEN I paste more than 20,000 characters, THEN I am told it is too long and no model call is made.
- WHEN I upload a recipe photo, THEN it is parsed into the review screen; WHEN I upload a PDF or a 10 MB file, THEN it is refused.
- WHEN I edit fields on the review screen and choose Save, THEN the recipe is saved with my edits and I see its detail page; WHEN I choose Discard, THEN nothing is saved.
- WHEN I import 21 times with the model in one day, THEN the 21st is refused with a cap message.
- WHEN I import twice within 10 seconds, THEN the second is refused with a "wait" message.
- WHEN the model leaves out servings, THEN the review shows an empty servings field and Save asks me to fill it in.

**Rollout notes.** No new secrets: both backends already get `ANTHROPIC_API_KEY` (dev inherits it from `apphosting.yaml`, so dev QA spends the same credits; QA uses a few short fixed recipes). One additive migration (`import_usage`), applied automatically on merge. Nothing to add to the GitHub `develop` or `production` environments. No Firebase console changes.

**Assumptions**

- Daily cap resets at 00:00 UTC.
- Imported recipes keep the source link when imported from a link.
- The step indicator (Source, Review, Save) from the mockup is kept.

## Gate A

Approved: no
Accepted preflight gaps: none

## Preflight

(table of checks and results, from stage 2)

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
