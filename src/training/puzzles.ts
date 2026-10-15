// Puzzles: a curated Lichess set (CC0, static JSON split by theme and rating
// band) plus positions from the user's own mistakes.
import { Chess, type Square } from 'chess.js'
import type { GameRecord } from '../game/session'
import { replay } from '../game/session'
import { isError } from '../coach/classify'

export const THEMES = ['backRankMate', 'mateIn1', 'mateIn2', 'fork', 'pin', 'skewer', 'discoveredAttack', 'trappedPiece', 'hangingPiece'] as const
export type Theme = (typeof THEMES)[number]
export const BANDS: [number, number][] = [
  [0, 800],
  [800, 1100],
  [1100, 1400],
  [1400, 1700],
  [1700, 2000],
  [2000, 4000],
]

export const THEME_LABEL: Record<Theme, string> = {
  backRankMate: 'Back-rank mates',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  fork: 'Forks',
  pin: 'Pins',
  skewer: 'Skewers',
  discoveredAttack: 'Discovered attacks',
  trappedPiece: 'Trapped pieces',
  hangingPiece: 'Loose pieces',
}

/** Singular form for counts ("10 fork puzzles"). */
export const THEME_ITEM: Record<Theme, string> = {
  backRankMate: 'back-rank mate',
  mateIn1: 'mate-in-1',
  mateIn2: 'mate-in-2',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discovered-attack',
  trappedPiece: 'trapped-piece',
  hangingPiece: 'loose-piece',
}

/** Puzzle themes that train each skill-profile motif. */
export const MOTIF_THEMES: Record<string, Theme[]> = {
  'motif:hanging': ['hangingPiece', 'trappedPiece'],
  'motif:fork': ['fork'],
  'motif:pin': ['pin', 'skewer'],
  'motif:discovered': ['discoveredAttack'],
  'motif:mate': ['mateIn1', 'backRankMate', 'mateIn2'],
}

interface LichessRow {
  id: string
  fen: string
  moves: string
  rating: number
  themes: string[]
}

export interface TrainPuzzle {
  id: string
  source: 'lichess' | 'own'
  /** Starting position. For Lichess puzzles the opponent's `setup` move is played first. */
  fen: string
  setup?: string
  /** The user's moves and the replies, alternating, starting with the user's move. */
  solution: string[]
  themes: string[]
  rating?: number
  /** Own-mistake puzzles: where it came from. */
  gameId?: string
  ply?: number
  playedSan?: string
}

export const bandOf = (rating: number) => Math.max(0, BANDS.findIndex(([a, b]) => rating >= a && rating < b))

const cache = new Map<string, Promise<TrainPuzzle[]>>()
export function loadTheme(theme: Theme, band: number): Promise<TrainPuzzle[]> {
  const key = `${theme}/${band}`
  let p = cache.get(key)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}puzzles/${theme}/${band}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`puzzles ${key}: ${r.status}`)
        return r.json() as Promise<LichessRow[]>
      })
      .then((rows) => rows.map(fromLichess))
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/** A pool smaller than this gets topped up from neighbouring rating bands. */
export const MIN_POOL = 30

/**
 * Puzzles for a theme at the user's band. Thin bands (e.g. trapped pieces
 * below 800, where only 9 pass the quality filters) are filled with the
 * nearest bands' puzzles — closest first — instead of repeating the same few.
 */
export async function loadPool(theme: Theme, band: number, load: (theme: Theme, band: number) => Promise<TrainPuzzle[]> = loadTheme): Promise<TrainPuzzle[]> {
  const pool = [...(await load(theme, band))]
  for (let d = 1; pool.length < MIN_POOL && d < BANDS.length; d++) {
    for (const b of [band + d, band - d]) {
      if (b >= 0 && b < BANDS.length && pool.length < MIN_POOL) pool.push(...(await load(theme, b)))
    }
  }
  return pool
}

export function fromLichess(r: LichessRow): TrainPuzzle {
  const [setup, ...solution] = r.moves.split(' ')
  return { id: `l:${r.id}`, source: 'lichess', fen: r.fen, setup, solution, themes: r.themes, rating: r.rating }
}

/** Positions before the user's own mistakes (one move to find), from reviewed or coached games. */
export function ownMistakePuzzles(games: GameRecord[]): TrainPuzzle[] {
  const out: TrainPuzzle[] = []
  for (const g of games) {
    g.moves.forEach((m, ply) => {
      const r = m.review
      if (m.by !== 'user' || !r?.best || !isError(r.cls) || r.loss < 10 || (m.hintLevel ?? 0) >= 3) return
      out.push({
        id: `own:${g.id}:${ply}`,
        source: 'own',
        fen: replay(g, ply).fen(),
        solution: [r.best],
        themes: r.concepts,
        gameId: g.id,
        ply,
        playedSan: m.san,
      })
    })
  }
  return out
}

/** Position the user sees, with them to move. */
export function startPosition(p: TrainPuzzle): Chess {
  const c = new Chess(p.fen)
  if (p.setup) c.move({ from: p.setup.slice(0, 2), to: p.setup.slice(2, 4), promotion: p.setup[4] })
  return c
}

export type MoveVerdict = 'correct' | 'solved' | 'wrong'

/**
 * Check the user's move at `step` (index into `solution`, always a user move).
 * Like Lichess, any move that gives checkmate is accepted, even if it isn't the
 * stored one. Own-mistake puzzles accept other good moves after an engine check
 * (done by the caller); here only the stored move or a mate counts.
 */
export function checkMove(p: TrainPuzzle, pos: Chess, step: number, uci: string): MoveVerdict {
  const c = new Chess(pos.fen())
  try {
    c.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] ?? 'q' })
  } catch {
    return 'wrong'
  }
  const expected = p.solution[step]
  const same = uci === expected || (uci.length === 4 && expected?.length === 5 && expected.startsWith(uci) && expected[4] === 'q')
  if (c.isCheckmate()) return 'solved'
  if (!same) return 'wrong'
  return step + 1 >= p.solution.length ? 'solved' : 'correct'
}

/** Puzzle rating: simple Elo against the puzzle's rating. */
export function nextPuzzleRating(rating: number, puzzleRating: number, clean: boolean, k = 32): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400))
  return Math.round(Math.max(400, Math.min(3000, rating + k * ((clean ? 1 : 0) - expected))))
}

/** Next puzzles to show: unseen first, closest to the user's rating. */
export function pickPuzzles(pool: TrainPuzzle[], rating: number, seen: Set<string>, count: number): TrainPuzzle[] {
  const fresh = pool.filter((p) => !seen.has(p.id))
  const from = fresh.length >= count ? fresh : pool
  return [...from].sort((a, b) => Math.abs((a.rating ?? rating) - rating) - Math.abs((b.rating ?? rating) - rating)).slice(0, count)
}
