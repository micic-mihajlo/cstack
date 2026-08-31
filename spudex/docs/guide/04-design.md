# Design before you write code

One attempt at a hard design locks in the first shape the model thought of. Spudex keeps the same design ladder.

## Settle the shape with `$spudex architect`

[`$spudex architect`](../../references/capabilities/architect/SKILL.md) grounds itself first, then compares plausible designs before implementation when the boundary change is real.

## Fan out attempts with `$spudex arena`

[`$spudex arena`](../../references/capabilities/arena/SKILL.md) runs competing candidates in isolated outputs, then picks a base and grafts the best ideas from the rest.

## Cover slices and races with `$spudex swarm`

[`$spudex swarm`](../../references/capabilities/swarm/SKILL.md) fans workers across independent slices or race arms and returns one compact report.

## Break it with `$spudex interrogate`

[`$spudex interrogate`](../../references/capabilities/interrogate/SKILL.md) sends the same diff and rubric to independent reviewers and sorts the results into act-on signal versus noise.

## How much design work does a task deserve

Small finished change you do not fully trust. Use `$spudex interrogate`.

Boundary change or ownership change. Use `$spudex architect`.

Competing ideas. Use `$spudex arena`.

Coverage matrix or race. Use `$spudex swarm`.

Next: [Build and clean the change](./05-build-and-clean.md).
