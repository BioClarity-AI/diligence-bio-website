# Working in this repo

## Never push on your own

Do not run `git push` unless the user asks for it **in that message**.
Committing is fine — commit finished work rather than leaving it loose.

This is not a style preference. `.github/workflows/deploy.yml` deploys on every
push to `main`, so a push here publishes to diligencebio.ai immediately — there is
no staging environment and no review step between the push and the live site.
A commit is local and reversible; a push is the publish.

Standing permission does not carry over. "Push" granted for one change
authorises that change only; the next one needs asking again.

A `PreToolUse` hook in `.claude/settings.json` blocks the push, so an attempt
fails with a message rather than going through. The hook is the backstop, not
the rule — do not work around it, and do not edit or disable it to get a push
through. If a push is genuinely wanted, the user will say so, and they can run
the command themselves.

Leave the work committed on the branch and say what changed. That is the
hand-off.

## Git settings live in `.git/config`

Before any `git push`, `git remote` or other operation that authenticates,
read `.git/config`. This clone pins its own remote and its own SSH identity
there; do not assume the defaults and do not change them. In particular the
remote stays on its `git@github.com:...` form — an HTTPS remote bypasses the
pinned identity and authenticates as whoever the credential helper knows.

`.git/config` is untracked, so it is local to this clone and absent in CI.

## Checks before handing work back

```sh
npm run check      # astro check — types and template diagnostics
npm run build      # must succeed; it is what the deploy workflow runs
```

Both must be clean. `npm run dev` serves the site locally for a visual check —
prefer looking at a page over assuming a change landed, especially for the
canvas panels, which no test covers.

## Things worth knowing

- `src/scripts/canvasStage.ts` is shared plumbing for every drawn panel; the
  page scripts hold only their own drawing.
- The pages are ported from a design-tool export. `README.md` records which
  departures from that export are deliberate — read it before "fixing" one.
- Canvas labels are fitted to the panel in code. When adding one, measure it
  against its neighbours; several overlapping-label bugs came from assuming
  there was room.
