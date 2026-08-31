# Build the change and clean the diff

The build playbooks share one discipline. Say what you observed, let the playbook demand the evidence. This page shows what to put in the prompt for each common build task, then the cleanup habit that keeps diffs reviewable.

## Prompt each build playbook with what you know

A bug prompt states the symptom and asks for a reproduction first:

```text
$cstack this command emits two records after a retry. repro first, then fix and verify.
```

A feature prompt states the behavior and what must not change:

```text
$cstack add a --json flag. text output stays byte-identical. verify both forms.
```

A refactoring prompt pins behavior before structure moves:

```text
$cstack move parsing into one module, zero behavior change. record the current output first and prove it's unchanged after.
```

A perf prompt states the measurement, not a vibe:

```text
$cstack startup takes 1.8s on this fixture. trace it, fix the measured cause, show me before and after.
```

Each of these routes to its playbook ([Bug fix](../../playbooks/bug-fix.md), [Feature](../../playbooks/feature.md), [Refactoring](../../playbooks/refactoring.md), [Perf issue](../../playbooks/perf-issue.md)), and the playbook supplies the steps you didn't type: reproduce before fixing, name the data shape before implementing, pin behavior before restructuring, profile before optimizing.

For sustained improvement of one number, there's the [Hillclimb playbook](../../playbooks/hillclimb.md). Give it the metric, a target, and a floor on attempts, and it loops one hypothesis at a time with a frozen measurement harness. It keeps wins and reverts everything else.

## Write the failing test first with `$cstack tdd`

When a bug has a cheap local test path, the whole prompt can be two words:

```text
$cstack tdd implement
```

In context, that's enough. [`$cstack tdd`](../../references/capabilities/tdd/SKILL.md) writes the smallest real test that fails for the intended reason, then the fix, then reruns the test. Mocks, fakes, and monkey patches are forbidden. If the real path cannot run, the result names the gap instead of manufacturing proof.

## Let the TypeScript rules load themselves

cstack loads [TypeScript practices](../../references/capabilities/typescript-best-practices/SKILL.md) whenever it touches a `.ts` or `.tsx` file. The contract turns the type-system principles into discriminated unions, `unknown` at boundaries, exhaustive variants, and schema-derived types.

## Clean before you commit

The [Opening a PR playbook](../../playbooks/opening-a-pr.md) runs the installed [`$unslop`](../../references/capabilities/unslop/SKILL.md) skill when available and requires an exact-diff self-review. It removes narrating comments, unsupported guards, dead compatibility paths, and unrelated edits.

For prose, `$unslop` takes a target and any extra rules you have:

```text
$unslop the readme changes, no em dashes
```

You'll develop your own shorthand. The skill reads intent fine from terse prompts like `unslop that, tighten it`.

## Strip the comments with `$cstack no-comments`

Comments need their own pass, and not from the agent that wrote them. An author defends its comments the way you'd defend yours. So before review, hand them to fresh eyes:

```text
$cstack no-comments the diff
```

[`$cstack no-comments`](../../references/capabilities/no-comments/SKILL.md) uses [Comment Sicko](../../agents/comment-sicko.md), a read-only reviewer with a short keep list. It allows licenses, public API contracts, standards links, and behavior forced by an external dependency the code cannot reshape. A surprise in your own code becomes a structural refactor flag.

The division of labor is simple. `$unslop` cleans prose and code phrasing. Exact-diff review catches unrelated or defensive clutter. `$cstack no-comments` gives comments to an independent reviewer.

**Pitfall:** cleanup is not optional polish. A diff with narrating comments and defensive dead weight reads as unfinished to reviewers, and the extra code is where the next bug hides. If the diff feels padded, run `$unslop` and an exact-diff review before you commit, not after review calls it out.

Next: [Verify and ship](./06-verify-and-ship.md).
