---
name: dev-lifecycle
description: Run a feature or fix through the full development lifecycle for this repo - interview, OpenSpec proposal (human approval), then unattended implementation, independent code review (max 3 rounds), merge to develop, independent agent-run Playwright QA on the dev site, and a production PR with a QA report for a human to verify and merge. Use when the user says "dev lifecycle", "lifecycle", "ship this end to end", or asks to take a change from idea to production with review and QA.
allowed-tools: Bash(openspec:*), Bash(gh:*), Bash(git:*), Bash(npm:*), Bash(npx:*), mcp__github__get_me, mcp__github__create_pull_request, mcp__github__pull_request_read, mcp__github__merge_pull_request, mcp__github__actions_list, mcp__github__actions_run_trigger, mcp__github__issue_write, mcp__github__list_issues, mcp__github__search_pull_requests, mcp__claude-code-remote__subscribe_pr_activity, mcp__claude-code-remote__unsubscribe_pr_activity, mcp__claude-code-remote__send_later
metadata:
  version: '1.2'
---

Take one change from idea to production through fixed stages and gates. State lives in `openspec/changes/<name>/lifecycle.md` so the run can resume in a new session. If the change already exists, read it first and continue from its recorded stage.

## Shape of a run

```
1 Interview ──► 2 Propose + preflight ──► GATE A (human)
                                              │
        ┌─────────────── unattended ──────────┴───────────┐
        │ 3 Implement ► 4 Review (≤3) ► 5 Ship to develop ► 6 QA (independent) │
        └──────────────────────────────────────────────────┘
                                              │
                         7 Production PR + QA report ──► GATE B (human merges)
                                              │
                                           8 Wrap-up
```

Stages 1 and 2 are interactive. **Gate A is the last question the skill asks until stage 7.** Stages 3 to 6 run without stopping for input.

## Rules that hold in every stage

- **Never merge to `production` and never deploy to it.** A human does that (Gate B).
- **Gate A approval is the authorization** for stages 3 to 6: implementing, merging this change's PR(s) into `develop` (which deploys to the dev site), running QA against it, and opening the production PR. It authorizes nothing else. Do not merge anything unrelated, do not touch other branches, do not force-push.
- **QA touches the dev environment only** (the dev Firebase project, dev Neon branch and dev URL recorded in the Deployment section of `CLAUDE.md`). Never put production URLs, project ids, database URLs or credentials in a test, a prompt, a screenshot or a report.
- **Never print or commit secrets** (QA credentials, API keys, private keys, tokens). Crop or mask them out of screenshots.
- Update `lifecycle.md` at the end of every stage: stage, date, round counters, outcome.
- Use the repo's Node (`nvm use`, see `.nvmrc`). End commit messages with the attribution line the harness gives.
- **Do not ask questions between Gate A and stage 7.** When something blocks the run, use the Halt procedure instead of asking.
- **GitHub access goes through one backend, chosen at preflight** (see "GitHub access" below). Every rule above applies to both backends.

## GitHub access

Pick the backend once, in the stage 2 preflight, and record it in `lifecycle.md`:

1. **`gh`** if `gh auth status` succeeds with `repo` and `workflow` scopes. This is the default everywhere, including cloud sessions that have a valid token.
2. **GitHub MCP** if `gh` fails and `CLAUDE_CODE_REMOTE=true` (a cloud session). Load the tools first: `ToolSearch` with `select:mcp__github__get_me,mcp__github__create_pull_request,mcp__github__pull_request_read,mcp__github__merge_pull_request,mcp__github__actions_list,mcp__github__actions_run_trigger,mcp__github__issue_write,mcp__github__list_issues,mcp__github__search_pull_requests`. They act as the user's connected GitHub account and only reach the repositories the session was given.
3. Neither works: the preflight fails; show it at Gate A.

Git itself (commit, push, `git push origin --delete`) is the same under both backends and uses its own credentials, so the preflight must also confirm a push works, for example by pushing the change branch.

| Step                                 | `gh`                                                                 | GitHub MCP                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Preflight login                      | `gh auth status`                                                     | `get_me` returns a user                                                                                                    |
| Open PR (always pass base and head)  | `gh pr create --base ... --head ...`                                 | `create_pull_request` with `base` and `head`                                                                               |
| PR checks                            | `gh pr checks --watch`                                               | `pull_request_read` `get_check_runs`; see "Waiting"                                                                        |
| Merge into `develop`                 | `gh pr merge --merge`                                                | `merge_pull_request` with `merge_method: "merge"` and `expectedHeadSha`                                                    |
| Dev deploy run                       | `gh run list --workflow firebase-hosting-merge.yml --branch develop` | `actions_list` `list_workflow_runs`, `resource_id: "firebase-hosting-merge.yml"`, `workflow_runs_filter.branch: "develop"` |
| Re-run a failed run                  | `gh run rerun --failed`                                              | `actions_run_trigger` `rerun_failed_jobs`                                                                                  |
| Issues                               | `gh issue list` / `gh issue create`                                  | `list_issues` / `issue_write`                                                                                              |
| Find the archive PR                  | `gh pr list --state merged --search "Archive OpenSpec changes"`      | `search_pull_requests`                                                                                                     |
| Approve a PR's pending workflow runs | `gh api` or the web UI                                               | **Not available.** Hand this to the human in stage 8.                                                                      |
| Delete `qa-evidence/<name>`          | `git push origin --delete qa-evidence/<name>`                        | same                                                                                                                       |

**Waiting under MCP.** The MCP tools only read current state, and sleeping in a loop is not allowed. Instead:

- After opening a PR, call `subscribe_pr_activity`, write what the run is waiting on into `lifecycle.md`, and end the turn. The check-suite wake event resumes the run; re-read `lifecycle.md` and continue from the recorded stage. Call `unsubscribe_pr_activity` once the PR merges.
- For the dev deploy run, which sends no events, call `send_later` with `delay_minutes` 3 to 5 and end the turn. On wake, list the runs again. Re-arm up to 6 times, then halt as a deploy problem.
- Ending a turn to wait is not asking a question and does not break the no-questions rule.

## Stages

### 0. Intake

Derive a kebab-case change name from the request. Create a branch from the latest `origin/develop`. Run `openspec new change "<name>"` and write `lifecycle.md` from `references/lifecycle-template.md`.

### 1. Interview

Read `references/interview.md` and follow it. Ask in rounds of at most 4 questions with `AskUserQuestion`, grounded in the code and `openspec/specs/`, until nothing material is open. Write a one-page **interview summary** into `lifecycle.md`, show it, and continue only when the user confirms.

### 2. Propose, preflight, then Gate A

1. Run the OpenSpec propose workflow (`openspec-propose`) using the interview summary as input. Run `openspec validate "<name>" --strict`.
2. **Preflight.** Because stages 3 to 6 cannot ask for help, check now that they can finish, and show the results next to the proposal:
   - git can commit (author identity set or usable) and push to `origin`, and a GitHub backend is chosen (see "GitHub access"): `gh auth status` logged in with `repo` and `workflow` scopes, or in a cloud session the GitHub MCP tools with `get_me` working.
   - Merging a PR (`gh pr merge` or `merge_pull_request`) is expected to be permitted in this session. It cannot be tested without merging and is not a blocker: do not ask the user to confirm it or list it as a preflight gap.
   - Playwright is set up (`playwright.config.ts` with a `qa` project) and the browsers are installed. If it is not, QA cannot run; say so, and make adding it the first task of the first change.
   - QA credentials are available: `QA_USER_EMAIL`, `QA_USER_PASSWORD`, and a second account `QA_OTHER_USER_EMAIL`, `QA_OTHER_USER_PASSWORD` for checking that one user cannot see another user's data, for accounts that exist in the **dev** Firebase project. They come from the environment or from the gitignored `.env.qa` file in the repo root. Gitignored files are not present in a fresh worktree, so if the current checkout has no `.env.qa`, look for one in the main checkout (the first entry of `git worktree list`) and copy it over; it stays gitignored. Only ask the user to create it when neither place has it. Check that they are set (and that `.env.qa`, if used, is mode 600 and untracked), never print them. Never use credentials from `.env`, which may point at production.
   - The dev deploy workflow (`firebase-hosting-merge.yml`) is passing on `develop` right now.
   - Local checks work: `nvm use`, `npm run lint`, `npm run check`, test scripts that exist, and a test database if integration tests need one (a Neon branch, never the dev or production database).
   - Any secrets or variables this change needs are already added to the GitHub `develop` environment (from the interview's rollout notes).
3. Present the artifacts and the preflight table.

**Gate A (human):** stop. The user approves the proposal, or asks for changes (revise with `openspec-update-change`, re-run preflight, re-present). A failing preflight item must be fixed or explicitly accepted by the user. Record the approval, its time, and any accepted preflight gaps in `lifecycle.md`. **Everything below runs unattended.**

### 3. Implement (unattended)

Run the OpenSpec apply workflow (`openspec-apply-change`). Tests are written with each task. Before leaving this stage, `npm run lint`, `npm run check`, the test scripts that exist, and `npm run build` must pass locally. Commit in small logical commits.

### 4. Review loop, max 3 rounds (unattended)

Round counter starts at 0. For each round:

1. Start a **new** reviewer: Agent tool, `subagent_type: "Explore"` (read-only), `model: "sonnet"` (Sonnet 5.5). Never resume an earlier reviewer.
2. Send only what `references/reviewer-prompt.md` lists: the diff against `origin/develop`, the change's proposal, specs and design, and the rubric. Not your reasoning, earlier findings or build notes.
3. Parse its findings (blocker, major, minor, nit).
4. Fix every blocker and major. If you disagree with one, record the reason in `lifecycle.md` and do not fix it; the next reviewer sees only the code, so a real defect will come back. Minors and nits go on the deferred list unless trivial.
5. Re-run the local checks, commit, increment the counter.

Exit when a round has no blockers or majors. If round 3 still does, **halt**.

### 5. Ship to develop (unattended)

Push the branch and open a PR into `develop` (use a PR template if present; end the body with the generated-by line). Wait for the PR check; on failure, fix and retry up to 2 times, and give any behavior-changing fix one more review round (counts against the max of 3 total). `develop` is protected: the `verify` check is required, so wait until both are green and merge with a plain merge commit (`gh pr merge --merge`, or `merge_pull_request` with `merge_method: "merge"`), as the Gate A authorization allows. Never use `--admin` to get around a required check. If the merge is refused or blocked, **halt**.

### 6. QA on the dev site, independent (unattended)

Wait for the push-to-`develop` deploy (`gh run list --workflow firebase-hosting-merge.yml --branch develop`, or the MCP equivalent in the table) to succeed. If it fails, retry once; if it still fails, **halt** as a deploy problem, not a QA failure.

Read `references/qa-guide.md`. Start a **new, independent QA agent** (Agent tool, `subagent_type: "general-purpose"`, `model: "sonnet"`). Give it only what the guide lists: the dev URL, the change's proposal and delta specs, and the guide. Do **not** give it the diff, design, tasks, review findings or `lifecycle.md`. It may read the repo's UI code only to find routes and selectors. It writes and runs Playwright specs, captures screenshots, and returns the report described in `references/qa-report-template.md`, including recommended human tests.

Triage the report:

- `app bug`: fix on a new branch, then stages 3 to 5 for the fix with one review round, then a fresh QA agent (cycle +1).
- `test bug`: a fresh QA agent corrects its scripts (cycle +1).
- `environment` (deploy, data, credentials): **halt**.

At most 3 QA cycles in total. If the third still fails, **halt**.

### 7. Production PR and Gate B

1. Save screenshots and traces to `openspec/changes/<name>/qa/` on a throwaway branch `qa-evidence/<name>` and push it; do **not** merge it. Use it to link images in the report. Compress screenshots (PNG or JPEG, about 200 KB each at most).
2. Write the final QA report into `lifecycle.md`.
3. Open a PR from `develop` into `production` (pass base `production` and head `develop` explicitly, `--base production --head develop` under `gh`; `develop` is the repo default, so omitting `--base` would target the wrong branch) containing the change summary, issue links, review history, the QA report with embedded screenshots, and the **human verification checklist** built from the QA agent's recommended human tests, ranked by risk, plus production-only risks (environment variables, domains, runtime).
4. Notify the user that the PR is ready if a notification tool is available (`PushNotification`; load it with ToolSearch). End the run.

**Gate B (human):** the human reviews the report, performs the recommended tests, and merges. Do not merge, re-run the deploy, or delete the evidence branch.

### 8. Wrap-up (when the user returns after merging)

Confirm the production deploy succeeded. Archiving is automatic: the `openspec-archive.yml` workflow runs on every push to `production`, archives each shipped change whose tasks are all checked, and opens and merges a PR into `develop` titled "Archive OpenSpec changes". Verify that PR was opened and merged (`gh pr list --state merged --search "Archive OpenSpec changes"`) and that the change is under `openspec/changes/archive/`. The workflow also marks the archived `lifecycle.md` complete (it replaces the `- Stage:` line and appends an `## Archive` note with the release and workflow run), so do not edit it by hand; check that the Stage line now says complete. Add any outcome notes that the workflow cannot know (issues filed, human-test results) in a docs PR into `develop` if they matter. The workflow approves the archive PR's pending checks run itself and turns on auto-merge, so the PR normally merges on its own a few minutes later; wait for it. If it is still open after that, open it: click "Approve and run workflows" if its checks never started (under the MCP backend this is a human step: say so in the wrap-up summary), or read the workflow log if they failed. If the workflow failed or skipped the change, find out why from its log and run `openspec-archive-change` with spec sync on a branch off `develop` as a fallback. Then file issues for deferred findings and QA observations, delete the `qa-evidence/<name>` branch, and mark the lifecycle complete.

The workflow archives only changes with every task checked, so this skill must tick every task in `tasks.md` as it implements (stage 3). An unticked task means the change is skipped, not archived.

## Halt procedure

Use this whenever the run cannot continue. Never ask a question, never work around a denied action, never merge in the halted state.

1. Stop stage work. Commit and push any work in progress to the change branch (no force-push).
2. In `lifecycle.md`, record: `HALTED`, the stage, the reason, evidence (command output, finding list, run URL) and the exact next step for a human.
3. Open a draft PR for the branch if none exists, or an issue titled `Lifecycle halted: <name> at stage <n>`, with the same information.
4. Notify the user if a notification tool is available. End the run with a short summary of where it stopped and why.

Halt triggers: review round 3 with open blockers or majors; PR check still failing after 2 fixes; merge refused or blocked; dev deploy failing after one retry; QA credentials, Playwright or the dev site unavailable; third failed QA cycle; any step that would need an action outside these rules.
