# Lifecycle: ai-recipe-import

- Branch: `ai-recipe-import`
- Stage: 5 Ship to develop
- Review round: 5 (3 of 3, plus two authorized by the user)
- QA cycle: 0 of 3
- Started: 2026-10-23

## Interview summary

(approved: yes, 2026-10-23)

**Revision at Gate A (2026-10-23, from the user).** Editing must not lose ingredient amount, unit or note. Decisions: the add and edit forms both switch to the same structured row editor as the import review (amount, unit, name, note, status chip, add, remove, reorder, paste several lines); a nullable `name` column is added to `recipe_ingredients` in the same additive migration; older plain-text (`unparsed`) rows are pre-filled by the built-in line parser when opened for editing and stored structured only when saved. This replaces the "manual form unchanged", "no column changes" and "Manual recipes keep `unparsed`" points below. `recipes` becomes a modified capability, and `tests/qa/smoke.spec.ts` is updated for rows.

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

Approved: yes, 2026-10-23 (user: "approve")
Accepted preflight gaps: Node 22.23.2 locally instead of 24 (CI runs 24)

## Preflight

Run 2026-10-23. GitHub backend: `gh`.

| Check                              | Result                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| git author, commit, push           | OK: commit made and `ai-recipe-import` pushed to origin                                                                                                                                   |
| GitHub backend                     | OK: `gh` logged in as rhit-LEHMANCB with `repo` and `workflow` scopes                                                                                                                     |
| Playwright `qa` project + browsers | OK: Playwright 1.64.1, chromium installed, `qa` project lists 9 smoke tests                                                                                                               |
| QA credentials                     | OK: `.env.qa` copied from the main checkout (gitignored, untracked, mode 600), all four variables set                                                                                    |
| Dev site sign-up probe             | OK: `/signup` on the dev site answers "already exists" for both QA emails (not "invite-only")                                                                                            |
| Dev backend health                 | OK: `/api/health` returns `{"db":"ok"}`                                                                                                                                                   |
| Local checks                       | OK: lint, check (0 errors), test (107 passed, including integration tests), build, check:server, check:migrations                                                                          |
| Test database                      | OK: worktree `.env` holds only CI placeholders and `TEST_DATABASE_URL`, verified to be the Neon `dev` branch endpoint and not production                                                  |
| Node version                       | GAP: Node 22.23.2 installed, no version manager (`nvm` not found); `.nvmrc` and `engines` say 24. Checks pass on 22 and CI runs on 24. `npx node@24` works if a step needs 24 specifically |
| GitHub environment secrets         | OK: none needed; `develop` and `production` environments exist                                                                                                                            |
| Runtime config                     | Note: `BODY_SIZE_LIMIT=6M` is added to `apphosting.yaml` in this change (plain value, both backends); no secrets                                                                          |

## Review rounds

- Round 1 (2026-10-23): 0 blockers, 1 major, 6 minors, 2 nits. Fixed: the major (a stalled compressed body could get past the 10 s deadline, because `pipe` did not pass the abort on; now `pipeline`, with a test); amounts drifting when edited (`formatAmount` only shows a fraction that reads back as exactly the same amount, with round-trip tests); a redirect to another scheme or port was reported as a bad link (now "could not be read", with a test); unexpected errors after the model call became a 500 (now "unavailable", slot kept, only the message logged); `needsCheck` on a failed save; case-insensitive delimiter strip. Status rule for an amount with no unit: code and design say "parsed" (counts such as "2 eggs"); the spec wording said "check", so the wording in both spec deltas was clarified to match the approved design. `max_tokens` 8192 kept and the design updated (a 100-row recipe can need more than 4096 output tokens). Not fixed: midnight-UTC window between start and reserve (deferred).
- Round 2 (2026-10-23): 0 blockers, 1 major, 6 minors, 2 nits. Fixed: the major (a link whose page the model found no recipe in now falls back to pasted text with the link kept, as the blocked-link requirement says; test added); the midnight-UTC window (reserving a slot now moves the row to today in the same statement; integration test added, so the round 1 deferred item is closed); API failures are now logged with error class and status only; `<form>` is no longer dropped from page text; source link capped at 2048 characters; meaningless `source` removed from a failed save. Design corrected: `BODY_SIZE_LIMIT` applies before the hook (public routes too) and a photo over 6 MB without browser shrinking gets a plain 413 (accepted). Not changed: a blocked link starts the 10 s cooldown, as the spec says ("of any source").
- Round 3 (2026-10-23): 0 blockers, 1 major, 3 minors, 1 nit. Major: regex HTML stripping (`page-text.ts`, `schema-org.ts`) was quadratic on hostile pages (many unclosed `<nav>`, `<!--` or JSON-LD scripts), so one import of a crafted 2 MB page could block the single instance for minutes. Fixed after the round, on the branch: a one-pass tokenizer (`html-scan.ts`) now drives page text and the JSON-LD finder, tag stripping in JSON-LD values stops at the next `<` and long values are capped; tests time 2 MB hostile pages (each well under 1.5 s). Minors also fixed: an answer cut off at `max_tokens` is flagged and the review warns; a photo the API refuses (400/413) gets "That photo could not be read" instead of "unavailable"; the photo submit is disabled while the browser shrinks the photo. Nit not fixed: test-only options on `safeFetch` (deferred). These fixes have NOT been through a review round.
- Round 4 (2026-10-23, authorized by the user): 0 blockers, 1 major, 6 minors, 4 nits. Major: the scanner lower-cased the page with `toLowerCase()` and used those offsets on the original; characters such as "İ" grow when lower-cased, so JSON-LD after them was cut wrong and the import fell through to the AI. Fixed after the round: only ASCII letters are lower-cased (length kept), with a regression test. Minors fixed: a ">" inside a quoted attribute no longer ends a tag; a lone "<" is text without swallowing the next tag; only a real `type` attribute marks JSON-LD; a Recipe stub with no ingredients and no steps falls through to the page text, and `mainEntity` is followed; all instruction strings share one character budget; the delimiter strip repeats until stable; only image-related 400s (and 413) count as an unreadable photo, others stay "unavailable". Nits: a `<title>` inside a dropped element is ignored; comment on first-main/article. Not changed: wall-clock thresholds in the hostile-page tests (kept generous). These fixes have NOT been reviewed. 372 tests pass.
- Round 5 (2026-10-23, authorized by the user): 0 blockers, 0 majors, 4 minors, 1 nit. Review loop exits. All five deferred (not fixed, so the shipped code is what was reviewed).

## Deferred findings

- Round 5 minor: the HTML tokenizer treats "< a" (space before a letter) as a tag, and an unterminated quote inside a tag (`<a title=Joe's>`) ends the scan, dropping the rest of the page; require the name right after "<" and fall back to the next ">" on an unterminated quote.
- Round 5 minor: an unclosed dropped element (`<nav>` without `</nav>`) hides the rest of the page text; cap the skip (for example at `main`, `article` or `h1`).
- Round 5 minor: `findRecipeJsonLd` returns the first Recipe node only (a stub before the full recipe sends the page to the AI) and does not match `@type` values like "https://schema.org/Recipe".
- Round 5 minor: a structured-data draft is not clamped to the form limits (100 ingredients, 50 steps, name/note lengths), so such a page fails on save without an earlier notice.
- Round 5 nit: `BODY_SIZE_LIMIT=6M` applies to every route; documented in the design, a per-route check would be tighter.
- Known gap: without JavaScript, editing a row's fields does not clear its hidden display line, so the line can keep the old wording; reordering rows also needs JavaScript.
- Round 3 nit: `safeFetch` and `checkUrl` accept test-only options (`isAllowedAddress`, `anyPort`, `resolve`) on their production signature; nothing passes them today, but a future caller could weaken the checks. Move them behind a test-only factory.
- Known gap: a photo over 6 MB without browser shrinking gets the server's plain 413 page.
- Known gap: a failed save on the import review no longer shows the "AI parsed" or "structured data" notice (the draft's origin is not posted back).

## QA report

(filled in stage 6; link to the QA evidence branch)

## Verification checklist for the human

(filled in stage 7)

## Halted

HALTED on 2026-10-23 at stage 4 (review), after round 3 of 3.

- Reason: the skill allows at most 3 review rounds and requires a halt when round 3 still has a blocker or major. Round 3 reported one major (quadratic HTML scanning on hostile pages, a denial of service on the single App Hosting instance).
- What was done after the round: the major and the three minors were fixed on the branch (commit after 9982bc2, see the round 3 line above), with tests. All local checks pass: lint, check, 362 tests (unit, browser and integration against the Neon dev branch), build, check:server, check:migrations. These fixes have not been reviewed.
- Not done: nothing is merged; there is no PR into develop yet except the draft opened by the halt; stage 5 (merge to develop), stage 6 (QA on the dev site) and stage 7 (production PR) did not run. The Neon dev branch already has migration 0002 (applied locally during stage 3 for the integration tests; it is additive and the dev site's current code ignores it).
- Evidence: round findings in Review rounds above; draft PR https://github.com/rhit-LEHMANCB/meal-planner/pull/9.
- Next step for a human: review the round 3 fixes (`git diff 9982bc2 c6b8b7c`, mainly `src/lib/server/ai/html-scan.ts` and `src/lib/server/ai/page-text.ts`), or ask for one more independent review round. If satisfied, say so and the run can resume at stage 5 (mark the draft PR ready, wait for `verify`, merge to develop with a merge commit, then QA on the dev site and the production PR).


Resumed on 2026-10-23. User: "Run one more independent review round on the round 3 fixes. If it has no blockers or majors, resume the lifecycle at stage 5 (merge to develop, QA, production PR)."

HALTED again on 2026-10-23 at stage 4, after round 4. The user had asked to resume at stage 5 only if round 4 had no blockers or majors; it had one major. It and the minors are fixed on the branch (see the round 4 line) but unreviewed. Nothing merged; QA not run. Next step for a human: decide whether to run a fifth round, review the round 4 fixes, or resume.

Resumed again on 2026-10-23. User: "Run a fifth independent review round on the round 4 fixes. If it has no blockers or majors, resume at stage 5 (merge to develop, QA, production PR)."
