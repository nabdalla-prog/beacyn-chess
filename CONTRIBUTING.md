# Contributing to Beacyn Chess

Thanks for helping! Beacyn Chess is a free coach for beginner and
intermediate players who learn by seeing. Every change should keep it
**free, private (no server, no tracking), accessible and honest**.

## Ways to help

- **Report a bug** or **suggest a feature** with the issue templates.
- **Check chess content:** lessons, opening notes and drills must be correct.
  If something looks wrong, open an issue with the position (FEN) and why.

## Ground rules

1. **Never fake chess knowledge.** Evaluations come from Stockfish; named
   ideas (fork, pin…) come from a detector in `src/coach/` that checks the
   board, with a unit test. If no detector fires, the coach only repeats the
   engine fact. The optional AI may only reword those facts.
2. **Show, then tell.** Arrows, highlights and badges first; at most two
   short, encouraging sentences.
3. **Accessible by default.** Keyboard and screen reader work everywhere,
   colors come with a symbol, text contrast ≥ 4.5:1 in both themes. The axe
   tests in `e2e/a11y.spec.ts` must pass.
4. **Phone first.** Check your change at 390 px wide as well as on desktop.
5. **Untrusted input stays untrusted.** PGN and backup imports are validated
   strictly and never rendered as HTML.
6. **Licenses.** The project is GPL-3.0-or-later. New assets or libraries
   must be GPL-compatible and credited in the README.

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm run lint && npx tsc -b && npm test && npm run e2e
```

`npm run e2e` builds the site and tests it from the GitHub Pages sub-path on
a phone and a desktop viewport. Use `CHROMIUM_PATH=/usr/bin/chromium` to use
a system browser.

[PLAN.md](PLAN.md) explains the architecture and records every design
decision; please add a line there when you make one.

## Pull requests

- Keep each PR focused on one change, with tests for new logic (pure modules
  in `src/` have unit tests next to them; user flows have Playwright tests).
- Run the full check above before opening the PR; CI runs the same.
- Describe what changed and how you checked it (screenshots for UI changes,
  phone and desktop).

By contributing you agree that your work is released under GPL-3.0-or-later.
