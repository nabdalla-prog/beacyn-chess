# Beacyn Chess

**Play it free: https://nabdalla-prog.github.io/Beacyn-chess/**

A free, open-source, visual chess coach that runs in your browser. Play against
an engine that adapts to your level; the coach explains the game with arrows,
highlights and short notes, finds your weak spots and trains them.

No install, no account, no server — all your data stays in your browser.

> **Status:** early development. Milestone 1 (play the coach) is done. See
> [PLAN.md](PLAN.md) for the roadmap.

## Features so far

- Play White, Black or random against Stockfish, strength ≈400–2500
- Beginner levels make human-like mistakes, so they can actually be beaten
- Strength adjusts after every game to keep you near a 50% score
- Untimed by default, or 5+0, 10+0, 15+10 clocks
- Take back moves while learning (logged, never penalised)
- Drag, click or type moves (`e4`, `Nf3`, `O-O`, `g1f3`)
- Game is saved after every move and resumes after a reload
- Light and dark themes; works on phones, tablets and desktops

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

Piece images: the *cburnett* set by Colin M.L. Burnett (GPLv2+), bundled with chessground.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). Because Stockfish and chessground
are GPL, any copy or fork you distribute must also be GPL and share its
source code.
