#!/usr/bin/env bash
# Archive OpenSpec changes that shipped in a production merge.
#
# Usage: archive-shipped-changes.sh <production-commit-sha> [summary-file]
#
# Run from a checkout of `develop`. A change counts as shipped when its folder
# exists in <production-commit-sha> and on the current checkout, and every task
# in its tasks.md is checked (at least one). Each change is archived with
# `openspec archive` in its own commit, and if the change has a `lifecycle.md` it is marked complete
# in that same commit. Writes a markdown summary for the PR body
# and sets `archived` (count) in $GITHUB_OUTPUT when it is available.
set -euo pipefail

sha="${1:?usage: $0 <production-commit-sha> [summary-file]}"
summary="${2:-archive-summary.md}"

author=(-c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com")
archived=()
skipped=()

# Mark an archived change's lifecycle.md complete: replace its "- Stage:" line and append an Archive note.
# Does nothing when the change has no lifecycle.md.
mark_lifecycle_complete() {
	local name="$1" dir file today release run=""
	dir=$(ls -d "openspec/changes/archive/"????-??-??-"$name" 2>/dev/null | tail -1)
	file="$dir/lifecycle.md"
	[ -n "$dir" ] && [ -f "$file" ] || return 0

	today=$(date -u +%F)
	release="${sha:0:7}"
	if [ -n "${GITHUB_RUN_ID:-}" ]; then
		run=" ([workflow run](${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID}))"
	fi

	awk -v line="- Stage: **complete (archived automatically on $today after the production release \`$release\`)**" \
		'!done && /^- Stage:/ { print line; done = 1; next } { print }' "$file" >"$file.tmp" && mv "$file.tmp" "$file"
	printf '\n## Archive\nArchived automatically on %s after the production release `%s`%s. That marks this lifecycle complete.\n' \
		"$today" "$release" "$run" >>"$file"
}

while IFS= read -r path; do
	name="${path##*/}"
	[ "$name" = "archive" ] && continue

	if [ ! -d "openspec/changes/$name" ]; then
		skipped+=("\`$name\`: not on develop (already archived or removed)")
		continue
	fi

	if ! tasks=$(git show "$sha:openspec/changes/$name/tasks.md" 2>/dev/null); then
		skipped+=("\`$name\`: no tasks.md in the release")
		continue
	fi
	if grep -qE '^\s*- \[ \]' <<<"$tasks"; then
		skipped+=("\`$name\`: has unchecked tasks, so it has not been fully built")
		continue
	fi
	if ! grep -qiE '^\s*- \[ ?x ?\]' <<<"$tasks"; then
		skipped+=("\`$name\`: no completed tasks")
		continue
	fi

	if openspec archive "$name" --yes; then
		mark_lifecycle_complete "$name"
		git add -A openspec
		git "${author[@]}" commit -q -m "Archive OpenSpec change $name"
		archived+=("\`$name\`")
	else
		echo "::warning::Could not archive $name"
		git checkout -q -- openspec
		git clean -fdq openspec
		skipped+=("\`$name\`: \`openspec archive\` failed (see the workflow log)")
	fi
done < <(git ls-tree -d --name-only "$sha" openspec/changes/ 2>/dev/null)

{
	echo "Automatic archive after the production release \`${sha:0:7}\`."
	echo
	echo "**Archived**"
	if [ "${#archived[@]}" -eq 0 ]; then echo "- none"; else printf -- '- %s\n' "${archived[@]}"; fi
	if [ "${#skipped[@]}" -gt 0 ]; then
		echo
		echo "**Skipped**"
		printf -- '- %s\n' "${skipped[@]}"
	fi
} >"$summary"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
	echo "archived=${#archived[@]}" >>"$GITHUB_OUTPUT"
fi
cat "$summary"
