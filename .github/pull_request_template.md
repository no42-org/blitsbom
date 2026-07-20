<!--
Thanks for the PR. Keep it to one logical change — two unrelated fixes are two PRs.
-->

Closes #

## What and why

<!-- What does this change, and what problem does it solve? Write for whoever reads `git log` in a year. -->

## How it was verified

<!--
Show the evidence, not the intent — the command you ran and what it printed.
"make ci passes" is worth more than "should be fine".
-->

```
$ make ci
```

## Checklist

- [ ] `make ci` passes locally
- [ ] Linked to an issue above with a closing keyword (`Closes #123`)
- [ ] Commits are [Conventional Commits](https://www.conventionalcommits.org/) and signed off (`git commit -s`)
- [ ] AI-assisted commits carry an `Assisted-by:` trailer, and I have reviewed the output myself
- [ ] No new network calls (`make purity-check` enforces this)
- [ ] Docs updated if behaviour changed — including `RELEASING.md` if the pipeline changed
