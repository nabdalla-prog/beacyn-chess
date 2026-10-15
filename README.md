<p align="center">
  <img src="docs/logo.png" alt="Beacyn Chess logo: a white pawn with an amber beacon on navy" width="120" height="120">
</p>

<h1 align="center">Beacyn Chess</h1>

**Play it free: https://nabdalla-prog.github.io/beacyn-chess/**

A free, open-source, visual chess coach that runs in your browser. Play against
an engine that adapts to your level; the coach explains the game with arrows,
highlights and short notes, finds your weak spots and trains them.

No install, no account, no server — all your data stays in your browser.

> **Status:** early development. Milestones 1–6 (play the coach, live
> coaching, post-game review, skill profile, training, lessons and drills)
> are done. See [PLAN.md](PLAN.md) for the roadmap.

## Features so far

- Play White, Black or random against Stockfish, strength ≈400–2500
- Beginner levels make human-like mistakes, so they can actually be beaten
- Strength adjusts after every game to keep you near a 50% score
- Untimed by default, or 5+0, 10+0, 15+10 clocks
- Take back moves while learning (logged, never penalised)
- Drag, click or type moves (`e4`, `Nf3`, `O-O`, `g1f3`)
- Game is saved after every move and resumes after a reload
- Light and dark themes; works on phones, tablets and desktops

**Live coaching**

- Every move gets a badge: Brilliant, Best, Good, Inaccuracy, Mistake,
  Blunder or Missed win (colorblind-safe colors, always with a symbol)
- A one- or two-sentence reason built only from Stockfish and verified board
  checks: hanging pieces, forks, pins, skewers, discovered attacks, trapped
  pieces, back-rank weakness, mate threats, missed captures, development,
  center, castling, open files, passed pawns
- "See it on the board" draws the threat (orange-red), the better move (blue)
  and the weak square; "Show me why" steps through the engine's line
- Four-step hint ladder: where to look → which piece → the move → why
- Guided mode warns before a blunder ("Wait — check what that move leaves
  undefended") and lets you pick another move
- Evaluation bar above the board

**Post-game review**

- Graph of who was winning, move by move — tap any point to jump there
- Accuracy for you and your opponent, and a count of each move quality
- The 3–5 key moments of the game, each with **Retry this position**: find
  the better move yourself, with a hint or the answer if you need it
- Opening name (ECO) and how long each side stayed in known theory
- Import games you played elsewhere by pasting PGN or choosing a `.pgn` file
- Your recent games, saved in this browser

**Skill profile**

- Radar chart of seven skills: tactics, openings, middlegame, endgames,
  calculation, time use and avoiding blunders (0–100, recent games count more)
- Tactics broken down by motif: loose pieces, forks, pins and skewers,
  discovered attacks, checkmate patterns
- Your three weakest skills, each with one sentence and a real position from
  your own games — tap to open it in the review
- Trend lines showing how each skill changes game by game
- Tactics count what you get right too: tactics you found and real threats
  you defended, plus puzzles you solve

**Training**

- A daily plan built from your weakest skills: missed puzzles due for
  review, positions from your own mistakes, themed puzzles and a game
- Over 5,000 hand-filtered puzzles from the free Lichess puzzle database in
  9 themes (mates, forks, pins, skewers, discovered attacks, loose and
  trapped pieces), matched to your puzzle rating
- Hints step by step (where to look → which piece → the move), or step
  through the solution
- Missed puzzles come back on a spaced-repetition schedule (SM-2)

**Learn**

- 16 short lessons from how the pieces move to the rule of the square, each
  with board exercises and a quick check — all open, with a recommended next
- Opening trainer: Italian, London, 1…e5, Caro-Kann and Queen’s Gambit
  Declined lines with the idea behind each move, reviewed on a schedule
- Endgame drills against the engine: basic mates, king and pawn, Lucena,
  Philidor
- Visualization drills: name the square, and blindfold-lite
- A two-minute placement for new players to set the starting level

## Run locally

```sh
npm install      # also copies the Stockfish engine into public/engine/
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run e2e      # end-to-end tests (Playwright)
```

For `npm run e2e` either run `npx playwright install chromium` once, or point
at a system browser: `CHROMIUM_PATH=/usr/bin/chromium npm run e2e`.

## How it works

- **Engine:** Stockfish 19 *lite, single-threaded* WebAssembly build in a Web
  Worker. It needs no special server headers, so it runs on GitHub Pages.
- **Board:** [chessground](https://github.com/lichess-org/chessground) (the
  Lichess board); rules by [chess.js](https://github.com/jhlywa/chess.js).
- **Storage:** IndexedDB in your browser.

## Deploy your own copy

Fork the repo, then in **Settings → Pages** choose **GitHub Actions** as the
source. Every push to `main` runs the tests and publishes the site.

## Credits

Beacyn Chess is built on these open-source projects. Thank you to their authors.

| Project | Used for | License |
|---|---|---|
| [Stockfish](https://stockfishchess.org/) via [stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg and the Stockfish developers | Chess engine (WebAssembly, runs in your browser) | GPL-3.0 |
| [chessground](https://github.com/lichess-org/chessground) by the Lichess team | Interactive board, pieces, arrows and highlights | GPL-3.0-or-later |
| [chess.js](https://github.com/jhlywa/chess.js) by Jeff Hlywa | Chess rules, move validation, PGN and FEN | BSD-2-Clause |
| [React](https://react.dev/) | User interface | MIT |
| [idb](https://github.com/jakearchibald/idb) by Jake Archibald | IndexedDB storage | ISC |
| [chess-openings](https://github.com/lichess-org/chess-openings) by the Lichess team | Opening names and ECO codes | CC0 |
| [Lichess puzzle database](https://database.lichess.org/#puzzles) | Training puzzles (curated subset) | CC0 |

The [Lexend](https://www.lexend.com/) font (SIL Open Font License 1.1) is
bundled via [Fontsource](https://fontsource.org/).

Piece images: the *cburnett* set by Colin M.L. Burnett (GPLv2+), bundled with chessground.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). Because Stockfish and chessground
are GPL, any copy or fork you distribute must also be GPL and share its
source code.
