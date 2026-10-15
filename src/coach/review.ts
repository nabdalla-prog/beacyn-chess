// Post-game review built from one engine evaluation per position. Pure: the UI
// runs the engine and passes the results in, so this is fully unit-testable.
import type { Color } from 'chess.js'
import { toWhitePov, type InfoLine, type Score } from '../engine/uci'
import type { GameRecord } from '../game/session'
import { replay } from '../game/session'
import { isError, winPercent, type MoveClass } from './classify'
import { explainMove, type Explanation } from './explain'

export const REVIEW_DEPTH = 12
const CLASSES: MoveClass[] = ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'missed-win']

/** Per-move accuracy from win-% before/after (mover's view), Lichess's published curve. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const diff = Math.max(0, winBefore - winAfter)
  const a = 103.1668100711649 * Math.exp(-0.04354415386753951 * diff) - 3.166924740191411
  return Math.max(0, Math.min(100, a))
}

export interface ReviewedMove {
  ply: number
  san: string
  uci: string
  color: Color
  by: 'user' | 'engine'
  cls: MoveClass
  loss: number
  accuracy: number
  /** White's expected score after this move (0–100), for the graph. */
  whiteAfter: number
  /** Engine score after this move, White's point of view. */
  scoreAfter: Score
  bestUci?: string
  bestSan?: string
  explanation: Explanation
}

export interface KeyMoment {
  ply: number
  /** "error": the user went wrong here. "chance": the coach slipped and the user could punish it. */
  kind: 'error' | 'chance'
  /** Position to retry, with the user to move. */
  fen: string
  /** Ply index of the move the user should improve on (the user's move, or the reply to the coach's slip). */
  retryPly: number
  cls: MoveClass
  loss: number
  playedSan: string
  bestUci?: string
  bestSan?: string
  text: string
}

export interface GameReview {
  /** Moves reviewed so far (all of them once analysis is complete). */
  moves: ReviewedMove[]
  complete: boolean
  accuracy: Record<Color, number | null>
  counts: Record<Color, Record<MoveClass, number>>
  keyMoments: KeyMoment[]
  /** White's expected score at each position, starting with the initial one. */
  series: { ply: number; white: number; score: Score }[]
}

// buildReview re-runs as analysis fills in; remember explanations already built.
const explainCache = new Map<string, Explanation>()
function explainCached(input: Parameters<typeof explainMove>[0]): Explanation {
  const key = `${input.fenBefore}|${input.uci}|${JSON.stringify(input.before[0] ?? null)}|${JSON.stringify(input.after[0] ?? null)}`
  let e = explainCache.get(key)
  if (!e) {
    e = explainMove(input)
    explainCache.set(key, e)
    if (explainCache.size > 3000) explainCache.delete(explainCache.keys().next().value!)
  }
  return { ...e, ply: input.ply }
}

const emptyCounts = () => Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<MoveClass, number>

/**
 * `evals[i]` = engine lines for the position before move i (side-to-move view);
 * `evals[moves.length]` = the final position. Missing entries stop the review there.
 */
export function buildReview(game: GameRecord, evals: (InfoLine[] | null | undefined)[]): GameReview {
  const moves: ReviewedMove[] = []
  const counts = { w: emptyCounts(), b: emptyCounts() }
  const accSum = { w: 0, b: 0 }
  const accN = { w: 0, b: 0 }
  const series: GameReview['series'] = []

  const startTurn = replay(game, 0).turn()
  const first = evals[0]?.[0]
  if (first) {
    const s = toWhitePov(first.score, startTurn)
    series.push({ ply: 0, white: winPercent(s), score: s })
  }

  for (let i = 0; i < game.moves.length; i++) {
    const before = evals[i]
    const after = evals[i + 1]
    if (!before || !after) break
    const fenBefore = replay(game, i).fen()
    const m = game.moves[i]
    const e = explainCached({ fenBefore, uci: m.uci, ply: i, before, after })
    const color = e.color
    const winBefore = winPercent(e.scoreBefore)
    const winAfter = winPercent(e.scoreAfter)
    const accuracy = moveAccuracy(winBefore, winAfter)
    const scoreAfterWhite = color === 'w' ? e.scoreAfter : { type: e.scoreAfter.type, value: -e.scoreAfter.value }
    moves.push({
      ply: i,
      san: m.san,
      uci: m.uci,
      color,
      by: m.by,
      cls: e.cls,
      loss: e.loss,
      accuracy,
      whiteAfter: winPercent(scoreAfterWhite),
      scoreAfter: scoreAfterWhite,
      bestUci: e.bestUci,
      bestSan: e.bestSan,
      explanation: e,
    })
    counts[color][e.cls]++
    accSum[color] += accuracy
    accN[color]++
    series.push({ ply: i + 1, white: winPercent(scoreAfterWhite), score: scoreAfterWhite })
  }

  return {
    moves,
    complete: moves.length === game.moves.length,
    accuracy: { w: accN.w ? accSum.w / accN.w : null, b: accN.b ? accSum.b / accN.b : null },
    counts,
    keyMoments: findKeyMoments(game, moves),
    series,
  }
}

/** The 3–5 turning points: the user's biggest errors, topped up with the coach's slips the user could punish. */
const label = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${san}`

export function findKeyMoments(game: GameRecord, moves: ReviewedMove[], max = 5, min = 3): KeyMoment[] {
  const who = game.imported ? 'Your opponent' : 'The coach'
  const userErrors = moves
    .filter((m) => m.by === 'user' && isError(m.cls) && m.loss >= 5)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, max)
  const picked: KeyMoment[] = userErrors.map((m) => ({
    ply: m.ply,
    kind: 'error',
    fen: replay(game, m.ply).fen(),
    retryPly: m.ply,
    cls: m.cls,
    loss: m.loss,
    playedSan: m.san,
    bestUci: m.bestUci,
    bestSan: m.bestSan,
    text: m.explanation.text,
  }))
  if (picked.length < min) {
    const chances = moves
      .filter((m) => m.by === 'engine' && (m.cls === 'mistake' || m.cls === 'blunder' || m.cls === 'missed-win'))
      .sort((a, b) => b.loss - a.loss)
    for (const m of chances) {
      if (picked.length >= min) break
      const reply = moves[m.ply + 1]
      if (!reply) continue
      picked.push({
        ply: m.ply,
        kind: 'chance',
        fen: replay(game, m.ply + 1).fen(),
        retryPly: m.ply + 1,
        cls: m.cls,
        loss: m.loss,
        playedSan: reply.san,
        bestUci: reply.bestUci,
        bestSan: reply.bestSan,
        text: `${who} slipped with ${label(m.ply, m.san)}. ${reply.bestSan ? `The strongest answer was ${label(m.ply + 1, reply.bestSan)}` : 'There was a strong answer'}${reply.uci === reply.bestUci ? ' — and you found it!' : '.'}`,
      })
    }
  }
  return picked.sort((a, b) => a.ply - b.ply)
}

/** Compact form stored on the game record: top line per position. */
export interface StoredEval {
  s: Score
  pv: string[]
}

export function toStored(lines: InfoLine[]): StoredEval | null {
  const l = lines[0]
  return l ? { s: l.score, pv: l.pv.slice(0, 10) } : null
}

export function fromStored(e: StoredEval | null | undefined): InfoLine[] | null {
  if (e === undefined) return null
  return e ? [{ depth: REVIEW_DEPTH, multipv: 1, score: e.s, pv: e.pv }] : []
}
