// Opening names (ECO) from the Lichess chess-openings data set (CC0), matched by
// position so transpositions are recognised. Loaded on demand from public/openings.json.
import type { GameRecord } from '../game/session'
import { replay, START_FEN } from '../game/session'

export interface OpeningBook {
  named: Map<string, [eco: string, name: string]>
  /** Every position on a named line (named ones included). */
  book: Set<string>
}

export interface OpeningInfo {
  eco: string
  name: string
  /** Plies from the start that stayed in known theory. */
  theoryPlies: number
  /** Who played the first move out of theory, if anyone did. */
  leftBy: 'user' | 'engine' | null
  leftSan: string | null
  /** Full-move number of that move. */
  leftMoveNumber: number | null
}

export const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

export function makeBook(data: { named: Record<string, [string, string]>; book: string[] }): OpeningBook {
  const named = new Map(Object.entries(data.named))
  return { named, book: new Set([...data.book, ...named.keys()]) }
}

let loading: Promise<OpeningBook> | null = null
export function loadBook(): Promise<OpeningBook> {
  loading ??= fetch(`${import.meta.env.BASE_URL}openings.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`openings.json: ${r.status}`)
      return r.json()
    })
    .then(makeBook)
  return loading
}

export function identifyOpening(game: Pick<GameRecord, 'startFen' | 'moves'>, book: OpeningBook): OpeningInfo | null {
  if (game.startFen !== START_FEN) return null
  let found: [string, string] | null = null
  let theoryPlies = 0
  for (let i = 1; i <= game.moves.length; i++) {
    const key = epd(replay(game, i).fen())
    if (!book.book.has(key)) break
    theoryPlies = i
    found = book.named.get(key) ?? found
  }
  if (!found) return null
  const left = game.moves[theoryPlies]
  return {
    eco: found[0],
    name: found[1],
    theoryPlies,
    leftBy: left ? left.by : null,
    leftSan: left ? left.san : null,
    leftMoveNumber: left ? Math.floor(theoryPlies / 2) + 1 : null,
  }
}
