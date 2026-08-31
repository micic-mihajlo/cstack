#!/usr/bin/env bash
# Local-only worktree audit by default. Pass --fetch to refresh the selected
# origin ref and query GitHub PR state. The script never deletes a worktree.
set -u
export LC_ALL=C

git_binary=$(type -P git) || {
	printf 'git is required\n' >&2
	exit 1
}
ssh_binary=$(type -P ssh) || {
	printf 'ssh is required for validated SSH origins\n' >&2
	exit 1
}

run_isolated_git() (
	mode="$1"
	shift
	while IFS='=' read -r name _; do
		case "$name" in
			GIT_*) unset "$name" ;;
		esac
	done < <(env)
	if [ "$mode" = read ]; then
		export GIT_OPTIONAL_LOCKS=0
	fi
	GIT_CONFIG_NOSYSTEM=1 \
	GIT_CONFIG_GLOBAL=/dev/null \
	GIT_TERMINAL_PROMPT=0 \
	"$git_binary" \
		-c core.fsmonitor=false \
		-c core.hooksPath=/dev/null \
		-c core.sshCommand="$ssh_binary" \
		-c credential.helper= \
		-c remote.origin.uploadpack=git-upload-pack \
		"$@"
)

safe_git() {
	run_isolated_git read "$@"
}

safe_git_fetch() {
	run_isolated_git write "$@"
}

sanitize_terminal() {
	local value="$1"
	local prefix rest found index character code octal control
	while [[ "$value" == *$'\033['* ]]; do
		prefix=${value%%$'\033['*}
		rest=${value#*$'\033['}
		found=0
		index=0
		while [ "$index" -lt "${#rest}" ]; do
			character=${rest:index:1}
			case "$character" in
				[@-~]) rest=${rest:index+1}; found=1; break ;;
			esac
			index=$((index + 1))
		done
		if [ "$found" -eq 1 ]; then
			value="$prefix$rest"
		else
			value="$prefix${rest}"
			break
		fi
	done
	value=${value//$'\t'/\\t}
	value=${value//$'\n'/\\n}
	value=${value//$'\r'/\\r}
	code=1
	while [ "$code" -le 31 ]; do
		printf -v octal '%03o' "$code"
		printf -v control "\\$octal"
		value=${value//$control/}
		code=$((code + 1))
	done
	code=127
	while [ "$code" -le 127 ]; do
		printf -v octal '%03o' "$code"
		printf -v control "\\$octal"
		value=${value//$control/}
		code=$((code + 1))
	done
	code=128
	while [ "$code" -le 159 ]; do
		printf -v octal '%03o' "$code"
		printf -v control '%b' "\\302\\$octal"
		value=${value//$control/}
		code=$((code + 1))
	done
	for control in \
		$'\330\234' \
		$'\342\200\216' $'\342\200\217' \
		$'\342\200\250' $'\342\200\251' \
		$'\342\200\252' $'\342\200\253' $'\342\200\254' \
		$'\342\200\255' $'\342\200\256' \
		$'\342\201\246' $'\342\201\247' $'\342\201\250' $'\342\201\251'
	do
		value=${value//$control/}
	done
	printf '%s' "$value"
}

usage() {
	cat <<'EOF'
usage: worktree-audit.sh [--fetch] [repo-path]

Without --fetch, the audit reads only local Git state. With --fetch, it may
update an origin remote-tracking ref and query GitHub PR state before reporting.
EOF
}

refresh=0
repo=""
while [ "$#" -gt 0 ]; do
	case "$1" in
		--fetch) refresh=1 ;;
		-h|--help) usage; exit 0 ;;
		--)
			shift
			if [ "$#" -gt 1 ]; then
				printf 'worktree-audit.sh: expected at most one repo path\n' >&2
				exit 2
			fi
			[ "$#" -eq 1 ] && repo="$1"
			break
			;;
		-*) printf 'worktree-audit.sh: unknown option: %s\n' "$(sanitize_terminal "$1")" >&2; exit 2 ;;
		*)
			if [ -n "$repo" ]; then
				printf 'worktree-audit.sh: expected at most one repo path\n' >&2
				exit 2
			fi
			repo="$1"
			;;
	esac
	shift
done

if [ -z "$repo" ]; then
	repo=$(safe_git rev-parse --show-toplevel 2>/dev/null) || {
		printf 'not in a git repo; pass a repo path\n' >&2
		exit 1
	}
fi
requested_repo="$repo"
repo=$(safe_git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || {
	printf 'not a git repo: %s\n' "$(sanitize_terminal "$requested_repo")" >&2
	exit 1
}
cd "$repo" || exit 1

unsafe_git_config_for_worktree() {
	local worktree="$1" scope config_key config_key_lc
	for scope in --local --worktree; do
		while IFS= read -r config_key; do
			config_key_lc=$(printf '%s' "$config_key" | tr '[:upper:]' '[:lower:]')
			case "$config_key_lc" in
				url.*.insteadof|url.*.pushinsteadof|core.attributesfile|core.askpass|core.fsmonitor|core.gitproxy|core.hookspath|core.sshcommand|core.worktree|credential.*|diff.external|diff.*.command|filter.*|include.path|includeif.*.path|interactive.difffilter|merge.*.driver|remote.*.uploadpack|remote.*.receivepack|remote.*.proxy|remote.*.vcs|protocol.*.allow|http.*)
					printf '%s' "$config_key"
					return 0
					;;
			esac
		done < <(safe_git -C "$worktree" config "$scope" --no-includes \
			--name-only --get-regexp '.*' 2>/dev/null || true)
	done
}

worktrees=()
while IFS= read -r -d '' field; do
	case "$field" in
		worktree\ *) worktrees+=("${field#worktree }") ;;
	esac
done < <(safe_git worktree list --porcelain -z)

if [ "${#worktrees[@]}" -eq 0 ]; then
	printf 'git reported no worktrees for %s\n' "$(sanitize_terminal "$repo")" >&2
	exit 1
fi
main_wt="${worktrees[0]}"

for worktree_path in "${worktrees[@]}"; do
	unsafe_config=$(unsafe_git_config_for_worktree "$worktree_path")
	if [ -n "$unsafe_config" ]; then
		printf 'unsafe executable, path-redirecting, or transport-affecting Git configuration in %s: %s\n' \
			"$(sanitize_terminal "$worktree_path")" \
			"$(sanitize_terminal "$unsafe_config")" >&2
		exit 64
	fi
done

base_ref="${SPUDEX_BASE_REF:-}"
if [ -z "$base_ref" ]; then
	base_ref=$(safe_git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
fi
if [ -z "$base_ref" ] && safe_git show-ref --verify --quiet refs/remotes/origin/main; then
	base_ref=origin/main
fi
if [ -z "$base_ref" ] && safe_git show-ref --verify --quiet refs/heads/main; then
	base_ref=main
fi
if [ -z "$base_ref" ] && safe_git show-ref --verify --quiet refs/heads/master; then
	base_ref=master
fi
case "$base_ref" in
	refs/remotes/origin/*) base_ref="origin/${base_ref#refs/remotes/origin/}" ;;
esac
case "$base_ref" in
	""|-*|*:*|*' '*|*$'\t'*|*$'\n'*|*$'\r'*)
		printf 'invalid base ref: %s\n' "$(sanitize_terminal "$base_ref")" >&2
		exit 64
		;;
	origin/*)
		base_branch="${base_ref#origin/}"
		safe_git check-ref-format --branch "$base_branch" >/dev/null 2>&1 || {
			printf 'invalid origin branch: %s\n' "$(sanitize_terminal "$base_branch")" >&2
			exit 64
		}
		;;
	refs/*)
		safe_git check-ref-format "$base_ref" >/dev/null 2>&1 || {
			printf 'invalid base ref: %s\n' "$(sanitize_terminal "$base_ref")" >&2
			exit 64
		}
		;;
	*)
		safe_git check-ref-format --branch "$base_ref" >/dev/null 2>&1 || {
			printf 'invalid base branch: %s\n' "$(sanitize_terminal "$base_ref")" >&2
			exit 64
		}
		;;
esac

audit_tmp=$(mktemp -d "${TMPDIR:-/tmp}/spudex-worktree-audit.XXXXXX") || exit 1
trap 'rm -rf -- "$audit_tmp"' EXIT
prs="$audit_tmp/prs.json"
printf '[]\n' > "$prs"
pr_lookup=not-queried
repo_identity=""
base_refresh=not-requested

if [ "$refresh" -eq 1 ]; then
	base_refresh=not-applicable
	origin_url=$(safe_git remote get-url origin 2>/dev/null || true)
	repo_identity=""
	if [[ "$origin_url" =~ ^https://github\.com/([A-Za-z0-9][A-Za-z0-9_.-]*)/([A-Za-z0-9][A-Za-z0-9_.-]*)(\.git)?$ ]]; then
		repo_identity="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	elif [[ "$origin_url" =~ ^git@github\.com:([A-Za-z0-9][A-Za-z0-9_.-]*)/([A-Za-z0-9][A-Za-z0-9_.-]*)(\.git)?$ ]]; then
		repo_identity="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	elif [[ "$origin_url" =~ ^ssh://git@github\.com/([A-Za-z0-9][A-Za-z0-9_.-]*)/([A-Za-z0-9][A-Za-z0-9_.-]*)(\.git)?$ ]]; then
		repo_identity="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
	fi
	repo_identity=${repo_identity%.git}
	if [ -z "$repo_identity" ]; then
		printf 'refusing --fetch: origin is not a literal GitHub HTTPS or SSH repository URL\n' >&2
		exit 64
	fi
	if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
		printf 'gh and jq are required for refreshed GitHub state\n' >&2
		exit 69
	fi
	canonical_identity=$(GH_HOST=github.com gh repo view "github.com/$repo_identity" \
		--json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || true)
	canonical_identity_lc=$(printf '%s' "$canonical_identity" | tr '[:upper:]' '[:lower:]')
	repo_identity_lc=$(printf '%s' "$repo_identity" | tr '[:upper:]' '[:lower:]')
	if [ -z "$canonical_identity" ] || [ "$canonical_identity_lc" != "$repo_identity_lc" ]; then
		printf 'could not authenticate the literal GitHub repository identity\n' >&2
		exit 69
	fi
	repo_identity="$canonical_identity"
	case "$base_ref" in
		origin/*)
			base_branch="${base_ref#origin/}"
			refspec="+refs/heads/$base_branch:refs/remotes/origin/$base_branch"
			if safe_git_fetch fetch --quiet --no-tags --no-recurse-submodules \
				"$origin_url" "$refspec" 2>/dev/null; then
				base_refresh=fresh
			else
				base_refresh=failed
				printf 'warn: could not fetch %s; refreshed merge state is unavailable\n' \
					"$(sanitize_terminal "$base_ref")" >&2
			fi
			;;
	esac
	if GH_HOST=github.com gh pr list --repo "github.com/$repo_identity" --state all --limit 1000 \
		--json number,state,headRefName,headRefOid > "$prs" 2>/dev/null; then
		pr_lookup=queried
	else
		printf '[]\n' > "$prs"
		pr_lookup=unavailable
		printf 'warn: GitHub PR state unavailable\n' >&2
	fi
fi

if [ -n "$base_ref" ] && \
	safe_git rev-parse --verify --quiet --end-of-options "$base_ref^{commit}" >/dev/null; then
	base_available=1
else
	base_available=0
	printf 'warn: no local base ref found; merged state will be unknown\n' >&2
fi
if [ "$refresh" -eq 1 ] && [ "$base_refresh" != fresh ]; then
	base_available=0
fi

now=$(date +%s)
printf 'SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tTASK_USE\tBUCKET\tWORKTREE\n'

{
	for wt in "${worktrees[@]:1}"; do
		size=$(du -sh "$wt" 2>/dev/null | awk '{print $1}')
		[ -n "$size" ] || size="?"
		head=$(safe_git -C "$wt" rev-parse HEAD 2>/dev/null || true)
		head_ts=$(safe_git -C "$wt" log -1 --format='%ct' HEAD 2>/dev/null || printf '0')
		if [ "$head_ts" -gt 0 ] 2>/dev/null; then
			age="$(( (now - head_ts) / 86400 ))d"
		else
			age="?"
		fi

		if [ "$base_available" -eq 0 ] || [ -z "$head" ]; then
			merged=unknown
		elif safe_git merge-base --is-ancestor "$head" "$base_ref" 2>/dev/null; then
			merged=YES
		else
			merged=no
		fi

		status_file="$audit_tmp/status"
		if safe_git -C "$wt" status --porcelain=v1 -z --untracked-files=all \
			--ignored=matching > "$status_file" 2>/dev/null; then
			tracked_changes=0
			scratch_changes=0
			while IFS= read -r -d '' record; do
				status="${record:0:2}"
				if [ "$status" = "??" ] || [ "$status" = "!!" ]; then
					scratch_changes=$((scratch_changes + 1))
				else
					tracked_changes=$((tracked_changes + 1))
				fi
				case "$status" in
					R?|C?|?R|?C) IFS= read -r -d '' _old_path || true ;;
				esac
			done < "$status_file"
			if [ "$tracked_changes" -gt 0 ]; then
				dirty="wip:$tracked_changes"
			elif [ "$scratch_changes" -gt 0 ]; then
				dirty="scratch:$scratch_changes"
			else
				dirty=clean
			fi
		else
			dirty=unknown
		fi

		branch=$(safe_git -C "$wt" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
		if [ -z "$branch" ]; then
			remote=detached
		elif safe_git -C "$wt" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
			remote_head=$(safe_git -C "$wt" rev-parse "origin/$branch" 2>/dev/null || true)
			if [ "$remote_head" = "$head" ]; then
				remote=pushed
			else
				ahead=$(safe_git -C "$wt" rev-list --count "origin/$branch..HEAD" 2>/dev/null || printf '?')
				remote="ahead$ahead"
			fi
		else
			remote=no-remote
		fi

		case "$pr_lookup" in
			queried)
				pr_record=$(jq -r --arg h "$head" '
					[.[] | select(.headRefOid == $h)] as $matches |
					if ($matches | length) == 0 then "none\t-"
					elif ($matches | length) == 1 then
						"one\t#\($matches[0].number)/\($matches[0].state)@\($matches[0].headRefOid[0:12])"
					else "many\t\($matches | length)" end
				' "$prs" 2>/dev/null || printf 'error\tunavailable')
				IFS=$'\t' read -r pr_match pr_value <<< "$pr_record"
				case "$pr_match" in
					one)
						pr="$pr_value"
						pr_state=${pr_value#*/}
						pr_state=${pr_state%@*}
						;;
					many) pr="ambiguous-head:$pr_value"; pr_state=ambiguous ;;
					none) pr="-"; pr_state=none ;;
					*) pr=unavailable; pr_state=unavailable ;;
				esac
				;;
			unavailable) pr=unavailable; pr_state=unavailable ;;
			*) pr=not-queried; pr_state=not-queried ;;
		esac
		task_use=check-in-app

		case "$dirty" in
			wip:*|unknown) bucket=hold-wip ;;
			scratch:*) bucket=hold-scratch ;;
			*)
				case "$pr_state:$merged:$base_refresh" in
					OPEN:*) bucket=hold-open-pr ;;
					CLOSED:*) bucket=review-closed-pr ;;
					MERGED:YES:fresh) bucket=safe ;;
					MERGED:*) bucket=review-merged-unbound ;;
					ambiguous:*) bucket=review-ambiguous-pr ;;
					*:YES:*) bucket=review-local-merged ;;
					*) bucket=review ;;
				 esac
			;;
		esac
		if [ "$bucket" = safe ]; then
			current_head=$(safe_git -C "$wt" rev-parse HEAD 2>/dev/null || true)
			if [ "$current_head" != "$head" ] || \
				! safe_git merge-base --is-ancestor "$current_head" "$base_ref" 2>/dev/null; then
				merged=unknown
				bucket=review-head-changed
			else
				final_status_file="$audit_tmp/status-final"
				if ! safe_git -C "$wt" status --porcelain=v1 -z --untracked-files=all \
					--ignored=matching \
					> "$final_status_file" 2>/dev/null || \
					! cmp -s "$status_file" "$final_status_file"; then
					dirty=changed-during-audit
					bucket=review-status-changed
				fi
			fi
		fi

		display_wt=$(sanitize_terminal "$wt")
		printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
			"$size" "$age" "$merged" "$dirty" "$remote" "$pr" \
			"$task_use" "$bucket" "$display_wt"
	done
} | sort -t$'\t' -k1,1 -rh
