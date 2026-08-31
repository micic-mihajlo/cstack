#!/usr/bin/env bash
# Real integration smoke for the production runtime helpers.
# Usage: smoke-runtime.sh <owner> <repo> <open-pr-number>
set -euo pipefail
umask 077

if [ "$#" -ne 3 ]; then
	printf 'usage: smoke-runtime.sh <owner> <repo> <open-pr-number>\n' >&2
	exit 64
fi

owner="$1"
repo="$2"
pr="$3"

case "$owner" in
	""|*[!A-Za-z0-9_.-]*) printf 'invalid GitHub owner: %s\n' "$owner" >&2; exit 64 ;;
esac
case "$repo" in
	""|*[!A-Za-z0-9_.-]*) printf 'invalid GitHub repository: %s\n' "$repo" >&2; exit 64 ;;
esac
case "$pr" in
	""|*[!0-9]*) printf 'invalid pull request number: %s\n' "$pr" >&2; exit 64 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
store="$(mktemp -d "${TMPDIR:-/tmp}/spudex-orch-smoke.XXXXXX")"
store="$(cd "$store" && pwd -P)"
git_binary=$(type -P git) || {
	printf 'git is required for the runtime smoke\n' >&2
	exit 69
}

safe_git() (
	while IFS='=' read -r name _; do
		case "$name" in
			GIT_*) unset "$name" ;;
		esac
	done < <(env)
	GIT_CONFIG_NOSYSTEM=1 \
	GIT_CONFIG_GLOBAL=/dev/null \
	GIT_TERMINAL_PROMPT=0 \
	"$git_binary" -c core.fsmonitor=false -c core.hooksPath=/dev/null "$@"
)

cleanup() {
	rm -rf -- "$store"
}
trap cleanup EXIT

orch_store="$store/orch"
bun "$script_dir/orch/orch.ts" --store "$orch_store" init
evidence_dir="$orch_store/evidence"
mkdir -p "$evidence_dir"
test_evidence="$evidence_dir/real-tests.txt"

if ! (cd "$script_dir" && bun run test) 2>&1 | tee "$test_evidence"; then
	printf 'real Spudex test suite failed; evidence: %s\n' "$test_evidence" >&2
	exit 1
fi
(cd "$script_dir" && bun run typecheck)

fixture="$store/runtime-fixture"
mkdir -p "$fixture"
safe_git -C "$fixture" init -q -b main
safe_git -C "$fixture" config user.name "Spudex Runtime Smoke"
safe_git -C "$fixture" config user.email "spudex-runtime-smoke@example.invalid"
printf '%s\n' \
	'Spudex orchestration receipt fixture.' \
	'This commit exists only to exercise exact receipt tuple binding.' \
	> "$fixture/scope.txt"
printf '%s\n' \
	'export function verificationLabel(repository, pr, headSha) {' \
	'  if (!/^github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repository)) throw new Error("invalid repository");' \
	'  if (!Number.isSafeInteger(pr) || pr < 1) throw new Error("invalid PR");' \
	'  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(headSha)) throw new Error("invalid head");' \
	'  return `${repository}#${pr}@${headSha}`;' \
	'}' \
	> "$fixture/runtime-check.mjs"
printf '%s\n' \
	'import assert from "node:assert/strict";' \
	'import test from "node:test";' \
	'import { verificationLabel } from "./runtime-check.mjs";' \
	'' \
	'test("binds a canonical repository, PR, and full head", () => {' \
	'  const head = "a".repeat(40);' \
	'  assert.equal(verificationLabel("github.com/spudex/runtime-smoke", 101, head), `github.com/spudex/runtime-smoke#101@${head}`);' \
	'});' \
	'' \
	'test("rejects a shortened head", () => {' \
	'  assert.throws(() => verificationLabel("github.com/spudex/runtime-smoke", 101, "abc"), /invalid head/);' \
	'});' \
	> "$fixture/runtime-check.test.mjs"
safe_git -C "$fixture" add scope.txt runtime-check.mjs runtime-check.test.mjs
safe_git -C "$fixture" commit -q -m "runtime receipt fixture"
fixture_sha=$(safe_git -C "$fixture" rev-parse HEAD)
fixture_repo=github.com/spudex/runtime-smoke
fixture_pr=101
fixture_command="node --test runtime-check.test.mjs"
fixture_evidence="$evidence_dir/runtime-fixture-test.txt"
fixture_status=0
{
	printf 'command=%s\n' "$fixture_command"
	printf 'cwd=%s\n' "$fixture"
	printf 'repository=%s\n' "$fixture_repo"
	printf 'head=%s\n' "$fixture_sha"
	(cd "$fixture" && node --test runtime-check.test.mjs) || fixture_status=$?
	printf 'exit_status=%s\n' "$fixture_status"
} > "$fixture_evidence" 2>&1
if [ "$fixture_status" -ne 0 ]; then
	printf 'committed runtime fixture test failed; evidence: %s\n' \
		"$fixture_evidence" >&2
	exit "$fixture_status"
fi
receipt="$evidence_dir/runtime-receipt.json"
bun "$script_dir/orch/orch.ts" --store "$orch_store" ledger receipt \
	"$fixture_pr" "$fixture_sha" unit-test-verified \
	--repo "$fixture_repo" \
	--verifier runtime-smoke \
	--command "$fixture_command" \
	--surface "Committed runtime fixture behavior at the exact Git head" \
	--exit-status 0 \
	--evidence "$fixture_evidence" \
	--out "$receipt"
bun "$script_dir/orch/orch.ts" --store "$orch_store" unit add runtime-ledger \
	--track "$fixture_repo" --brief "$receipt"
bun "$script_dir/orch/orch.ts" --store "$orch_store" unit set runtime-ledger \
	--state verifying --branch main --pr "$fixture_pr" --sha "$fixture_sha"
bun "$script_dir/orch/orch.ts" --store "$orch_store" ledger record \
	"$fixture_pr" "$fixture_sha" unit-test-verified \
	--repo "$fixture_repo" --receipt "$receipt"
bun "$script_dir/orch/orch.ts" --store "$orch_store" ledger gate \
	"$fixture_pr" "$fixture_sha" --repo "$fixture_repo"
bun "$script_dir/orch/orch.ts" --store "$orch_store" inbox push \
	runtime-smoke runtime-ledger complete --report "$receipt"
drain_evidence="$evidence_dir/inbox-drain.txt"
bun "$script_dir/orch/orch.ts" --store "$orch_store" inbox drain | tee "$drain_evidence"
batch=$(awk -F '\t' '$1 == "batch" { print $2; exit }' "$drain_evidence")
if [ -z "$batch" ] || ! grep -Fq $'\truntime-ledger\tcomplete\t' "$drain_evidence"; then
	printf 'inbox drain did not return the expected classified pointer\n' >&2
	exit 1
fi
classification="$evidence_dir/inbox-classification.tsv"
"$script_dir/log.sh" "$classification" runtime-smoke classify-inbox \
	"verified pointer coordinates and completion state" "$drain_evidence" "ack $batch"
bun "$script_dir/orch/orch.ts" --store "$orch_store" inbox ack "$batch"
if [ "$(bun "$script_dir/orch/orch.ts" --store "$orch_store" inbox count)" != "0" ]; then
	printf 'inbox was not empty after explicit acknowledgement\n' >&2
	exit 1
fi
bun "$script_dir/orch/orch.ts" --store "$orch_store" status

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
	printf 'GitHub CLI authentication is required for the live watcher smoke\n' >&2
	exit 69
fi

watch_once() {
	local output="$1"
	bun "$script_dir/watch-pr/watch-pr" --owner "$owner" --repo "$repo" \
		--pr "$pr" --status-only > "$output"
	jq -e \
		--arg owner "$owner" \
		--arg repo "$repo" \
		--argjson pr "$pr" '
		.kind == "STATUS" and
		.terminal == true and
		.reason == "status-only" and
		(.rows | length) == 1 and
		((.rows[0].context.owner | ascii_downcase) == ($owner | ascii_downcase)) and
		((.rows[0].context.repo | ascii_downcase) == ($repo | ascii_downcase)) and
		.rows[0].context.number == $pr and
		.rows[0].kind == "open" and
		.rows[0].facts.state == "OPEN" and
		(.rows[0].facts.headRefOid | type) == "string" and
		(.rows[0].facts.headRefOid | test("^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$"))
	' "$output" >/dev/null
	jq -r '.rows[0].facts.headRefOid | ascii_downcase' "$output"
}

first_watch="$evidence_dir/live-watch-first.json"
second_watch="$evidence_dir/live-watch-second.json"
first_sha=$(watch_once "$first_watch") || {
	printf 'watch-pr did not return a bound OPEN status for %s/%s#%s\n' \
		"$owner" "$repo" "$pr" >&2
	exit 1
}
second_sha=$(watch_once "$second_watch") || {
	printf 'watch-pr live-head re-read was not bound to %s/%s#%s\n' \
		"$owner" "$repo" "$pr" >&2
	exit 1
}
if [ "$first_sha" != "$second_sha" ]; then
	printf 'PR head changed during observed-status smoke: %s -> %s\n' \
		"$first_sha" "$second_sha" >&2
	exit 1
fi

printf 'runtime observed-status smoke passed for %s/%s#%s at stable head %s\n' \
	"$owner" "$repo" "$pr" "$first_sha"
