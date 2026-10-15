# Beacyn Chess — Plan

A free, open-source, visual chess coach that runs in the browser. It plays you,
explains the game on the board while you play, finds your weak spots and trains
them. No install, no account, no server: everything runs and is stored in your
browser. Hosted on GitHub Pages.

## Principles

1. **Never fake chess knowledge.** Every evaluation comes from Stockfish. Every
   named concept (fork, pin, hanging piece, isolated pawn…) comes from a
   detector that checks the actual board. If no detector fires, the coach says
   only what the engine says (e.g. "Nf3 was better: it keeps +1.2"), never an
   invented reason.
2. **Show, then tell.** Arrows, highlighted squares, colored badges and charts
   carry the message; text is one or two short sentences pointing at what is
   shown.
3. **Encouraging, never shaming.** Mistakes are "chances to learn", progress is
   always visible.
4. **Free forever.** Static files only. No paid APIs needed. Data stays in
   IndexedDB in the user's browser and can be exported as JSON.

## Architecture

```
src/
  engine/     Stockfish worker wrapper, UCI parsing, strength model, adaptive difficulty
  game/       Game session state (chess.js), clocks, results, PGN
  coach/      Move classification, concept detectors, explanation builder        (M2+)
  training/   Puzzles, spaced repetition, daily plan, drills, lessons            (M5+)
  storage/    IndexedDB (idb): games, settings, profile, puzzles, SRS cards
  ui/         React components (board, panels, screens), theming
public/
  engine/     stockfish-19-lite-single.{js,wasm} (copied from npm at install/build)
  puzzles/    curated Lichess puzzle subsets as static JSON, split by theme/band (M5)
```

- **React + Vite + TypeScript**, static build, deployed by a GitHub Actions
  workflow to GitHub Pages. `base` comes from the `BASE_PATH` env var the
  workflow sets, so forks with any repo name work.
- **chess.js** owns rules, legality, SAN, FEN, PGN. The UI never decides
  legality itself.
- **chessground** draws the board: drag/click moves, legal-move dots, last-move
  and check highlights, arrows/circles via its `drawable` auto-shapes (this is
  how all coach visuals are drawn).
- **Stockfish in a Web Worker.** Each `Engine` instance is its own worker with a
  job queue: one search runs at a time, every job is cancelable (`stop`), and
  results are parsed from UCI `info` lines into typed objects. Two instances are
  used: an **opponent** (strength-limited) and an **analyst** (full strength,
  MultiPV) so coaching never changes the opponent's settings.
- **State**: plain React state + small hooks; game logic lives in pure modules
  (`game/`, `engine/strength.ts`, `coach/*`) that are unit-tested without a DOM.
- **Storage**: IndexedDB through `idb`. Store versions are migrated in one
  `upgrade` function; export/import serialises every store to one JSON file.

### Stockfish on GitHub Pages (verified)

GitHub Pages cannot send the `Cross-Origin-Opener-Policy` /
`Cross-Origin-Embedder-Policy` headers that `SharedArrayBuffer` (multi-threaded
WASM) needs. Options:

| Option | Size | Works on Pages | Notes |
|---|---|---|---|
| `stockfish-19-lite-single` (npm `stockfish@19`) | ~1.9 MB | **yes**, no headers needed | Smaller NNUE net, still far stronger than any human |
| Full single-threaded | ~99 MB | yes | Too big to download on a phone |
| Multi-threaded + `coi-serviceworker` | 1.7 MB | mostly | Service-worker reload trick, first visit reloads the page, breaks some embeds/Safari edge cases |

**Decision:** use **lite single-threaded**. It needs no special headers, loads
fast on mobile, and is plenty strong for coaching (single thread is fine at the
depths we use). `scripts/copy-engine.mjs` copies the two files from
`node_modules/stockfish/bin` into `public/engine/` before `dev`/`build`, so
the engine version is pinned by `package-lock.json`. Verified in M1: the
worker loads and plays in Chromium at desktop and phone sizes, including when
served from the `/beacyn-chess/` sub-path GitHub Pages uses.

### Strength model (≈400 – 2500)

Stockfish's `UCI_Elo` only goes down to 1320, and even then it does not play
like a beginner (it rarely hangs pieces). So:

- **Rating ≥ 1400:** `UCI_LimitStrength=true`, `UCI_Elo=rating`, short movetime.
- **Rating < 1400:** `Skill Level 0`, shallow depth, `MultiPV` 6. The move is
  picked from the engine's candidate list with a softmax over centipawn scores
  whose temperature rises as the rating falls, plus a small "human slip"
  chance of a random legal move (highest at 400). This makes beginner-level
  play beatable in a natural way: it misses things and sometimes hangs a
  piece, but it still plays real moves.
- Ratings are **estimates** and are labeled "≈". They are calibrated against
  Stockfish's own Elo scale above 1400 and are rough below it.

**Adaptive difficulty:** after each finished game the opponent rating moves
toward a ~50% score: `rating += K × (score − 0.5)` with `K` starting at 120 and
shrinking to 40 as more games are played, clamped to 400–2500. The same number
is shown as the user's estimated rating. Takebacks are logged on the game but
do not change the adjustment (decision: learning mode should not punish
experimenting; the log lets the skill profile see it later).

### Move classification (M2)

Win probability from centipawns (Lichess formula):
`win% = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)`. Mate scores map to
0/100%. Classification by win-% loss for the mover:

| Class | Rule |
|---|---|
| Best | the engine's top move (or equal score) |
| Brilliant | best move that is a sound sacrifice (material drops by ≥ 2 after the move, position stays ≥ best−2%) and was not the only obvious recapture |
| Good | loss < 5% |
| Inaccuracy | loss 5–10% |
| Mistake | loss 10–20% |
| Blunder | loss ≥ 20% |
| Missed win | best line was winning (≥ 80% or forced mate) and the played move drops below 60% |

Colors are paired with an icon and a label everywhere (colorblind-safe palette
from Okabe–Ito: blue Best, sky Good, yellow Inaccuracy, orange Mistake,
vermillion Blunder, purple Brilliant/Missed win).

### Concept detectors (M2)

Pure functions over a chess.js position (+ engine PV when needed), each
returning `{ concept, squares, arrows, facts }` or nothing. Text is filled from
`facts` by templates, so text can only describe something the detector proved:

- Tactics: hanging piece (attacked, under-defended by SEE), fork, pin
  (absolute/relative), skewer, discovered attack, back-rank weakness, mate
  threat (engine mate score or mate-in-1 search), overloaded defender, trapped
  piece (no safe squares).
- Strategy: center control, development count, king safety (pawn shield,
  open files near king), castling rights lost, doubled/isolated/passed pawns,
  open/semi-open files, outposts, bad bishop (own pawns on bishop color),
  piece mobility.
- Endgame: king activity (distance to center/pawns), opposition, rook behind
  passed pawn.

### Skill profile (M4)

Every analysed move produces `SkillEvent`s (skill, phase, ok/mistake, size,
game id, ply). Skills: tactics by motif, openings, middlegame, endgame,
calculation (errors in sharp positions, long forced lines), time use (moves
that used <5% or >30% of remaining time before a mistake), blunder rate. Score
per skill = recency-weighted success rate, shown as a radar chart plus trends.
The weakest three each get a one-sentence explanation linking to a real
position from the user's games.

### Training (M5–M6)

- Puzzles: user's own mistakes first (position before the mistake, find the
  engine move), then a curated **Lichess puzzle DB** (CC0) subset shipped as
  static JSON chunks `public/puzzles/{theme}/{band}.json` (~200 puzzles per
  chunk, 12 themes × 6 rating bands, lazy-loaded).
- Spaced repetition: **SM-2** (simple, well-understood, easy to test). Cards
  for missed puzzles and opening lines.
- Daily plan from the weakest skills, e.g. "10 fork puzzles · 1 endgame drill
  · 1 game".
- Opening trainer, endgame drills vs engine from fixed FENs, visualization
  drills, lessons with interactive exercises.

### Optional AI explanations (M7, off by default)

Bring-your-own-key; stored only in `localStorage`, sent only to the provider
the user chose, never in the repo. The prompt contains only engine facts and
detector outputs, and instructs the model not to add evaluations. The app is
complete without it.

## Milestones

Each milestone ends runnable: tests pass, app checked at phone (390×844) and
desktop (1440×900) sizes, committed.

- **M1 — Play.** Board, play vs Stockfish from either side, strength slider
  400–2500 with human-like mistakes, adaptive strength, untimed default plus
  clocks, takebacks (logged), resign, keyboard move entry, move list,
  game saved/resumed from IndexedDB, light/dark theme, GitHub Pages workflow.
- **M2 — Coach.** Analyst engine, move classification, concept detectors,
  visual explanations, "Show me why" PV playback, hint ladder, coaching modes
  (Silent / Hints / Guided blunder warning).
- **M3 — Review.** Full-game analysis, eval graph (click to jump), accuracy,
  class counts, 3–5 key moments with "Retry this position", ECO opening name
  and how long the user stayed in theory, PGN import.
- **M4 — Skill profile.** Skill events, radar + trend charts, weakest three
  with real examples.
- **M5 — Training.** Puzzle chunks, own-mistake puzzles, SM-2, daily plan.
- **M6 — Curriculum.** Lessons, opening trainer, endgame drills,
  visualization drills, onboarding placement.
- **M7 — Polish.** Accessibility pass, sounds, board/piece themes, progress &
  badges, export/import, optional AI, Playwright e2e for all four flows,
  Lighthouse ≥ 90 mobile, README with screenshots.

## Status

- **M1 — done (2026-10-14).** Play vs coach, strength 400–2500, adaptive
  rating, clocks, takebacks, promotion picker, typed moves, resume after
  reload, light/dark theme, Pages workflow. 28 unit tests, 4 e2e runs
  (desktop + phone). Deployed to https://nabdalla-prog.github.io/beacyn-chess/.
- **M2 — done (2026-10-14).** Analyst engine (separate worker, cached,
  shared in-flight searches), win-% move classification, tactical and
  positional detectors, explanation builder, move badges, "See it on the
  board" / "Show me why" line stepping, hint ladder, Silent / Hints / Guided
  modes with pre-move blunder warning, eval bar. 58 unit tests, 10 e2e runs.
  Detectors still to add: overloaded defender (M4), outposts, bad bishop,
  piece mobility (M4), king activity, opposition, rook behind passed pawn
  (M6 with endgame drills).
- **M3 — done (2026-10-15).** Full-game review (one engine pass per
  position at depth 12, stored on the game so reopening is instant), eval
  graph (click/tap to jump), accuracy per side, move-class counts, 3–5 key
  moments with "Retry this position" (hint, show answer, attempts logged),
  ECO opening name with how long each side stayed in theory, PGN import
  (paste or file), recent games list, hash routes so the back button works.
  84 unit tests, 16 e2e runs. Next: M4.

## Risks

| Risk | Mitigation |
|---|---|
| Analysis is slow on phones (single thread) | Shallow depth during play (depth 12–14), deeper post-game review in the background, cancel on navigation, cache analysed FENs |
| Concept detectors give wrong reasons | Each detector unit-tested on known positions; when unsure, show only the engine fact |
| Beginner strength feels robotic | Candidate-move softmax + rare slips, short think delay; tune with self-play tests |
| Puzzle data size | Curated subset only, split by theme/band, lazy-loaded |
| Rating estimate is rough below 1400 | Label as estimate; adaptive loop corrects it with games |
| chessground/Stockfish are GPL | Project licensed GPL-3.0 |
| IndexedDB unavailable (private mode) | App still works in-memory; banner explains progress won't be saved |

## Decisions log

- Lite single-threaded Stockfish; no service-worker header tricks (see above).
- Untimed is the default time control; clocks optional (5+0, 10+0, 15+10).
  Flag = loss, unless the opponent has only a king (draw).
- Engine waits at least ~0.5 s before moving so play feels human and the user
  can see the move arrive.
- Promotion: picker for all four pieces (beginners should learn
  underpromotion exists), queen pre-selected.
- In-progress game is saved after every move and resumed on reload.
- Takebacks allowed in every game, counted on the game record, not
  penalised in rating.
- Default coaching mode is **Guided** (best for a beginner-to-intermediate
  visual learner). Hints mode = per-move feedback + hints on request; Silent =
  nothing until the game ends. Guided warns only before blunders (≥ 20% win
  loss or a thrown-away win), once per move, and the user can always play the
  move anyway (logged as `warned` on the move).
- Live analysis runs at depth 12 (MultiPV 3 for the user's position) so it
  stays responsive on phones; the post-game review uses the same depth.
- Explanation views stay open when the coach replies; they close only when
  the user taps "Back to game" or plays a move.
- Opening principles (early queen, king walk) are only mentioned as a
  supporting reason when the engine has already marked the move as an error.
- Review depth = live depth (12) so positions analysed during the game are
  reused and every move is judged at the same depth.
- Accuracy uses Lichess's published per-move curve; the game figure is the
  plain average of move accuracies (Lichess also blends in a volatility-
  weighted mean — ours is simpler and documented as such).
- Key moments: the user's biggest errors (up to 5); if fewer than 3, the
  opponent's biggest slips are added as "chances" to punish.
- The eval graph is a small hand-made SVG instead of Recharts: one series,
  no extra ~100 KB dependency, full control over tap-to-jump. The radar and
  trend charts (M4) follow the same approach.
- Opening names: Lichess chess-openings (CC0), built into
  `public/openings.json` by `scripts/build-openings.mjs`, matched by position
  (transpositions count), loaded only on the review screen (~90 KB gzipped).
- PGN import treats files as untrusted: 100 KB / 300-move limits, friendly
  error messages, first game of multi-game files, only moves, result, date
  and a cleaned opponent name are kept (comments and other tags dropped),
  nothing is ever rendered as HTML. Imported games never change the rating.
