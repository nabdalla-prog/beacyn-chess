// Engine pass over every position of a game, shared by the review screen and
// the skill profile ("analyse my unreviewed games").
import { analyse } from './analyst'
import { buildReview, fromStored, REVIEW_DEPTH, toStored, type StoredEval } from './review'
import type { InfoLine } from '../engine/uci'
import { replay, type GameRecord } from '../game/session'

export function initialEvals(game: GameRecord): (InfoLine[] | null)[] {
  return Array.from({ length: game.moves.length + 1 }, (_, i) => (game.analysis?.depth === REVIEW_DEPTH ? fromStored(game.analysis.evals[i]) : null))
}

export function isAnalysed(game: GameRecord): boolean {
  return initialEvals(game).every(Boolean)
}

/** The game with stored evals and, once complete, a coach verdict on every user move that lacks one. */
export function withAnalysis(game: GameRecord, evals: (InfoLine[] | null)[]): GameRecord {
  // undefined = not analysed yet, null = no engine line (game over).
  const stored: (StoredEval | null | undefined)[] = evals.map((l) => (l ? toStored(l) : undefined))
  let moves = game.moves
  if (evals.every(Boolean)) {
    const review = buildReview(game, evals)
    moves = game.moves.map((m, i) => {
      const r = review.moves[i]
      if (m.by !== 'user' || m.review || !r) return m
      const e = r.explanation
      return { ...m, review: { cls: e.cls, loss: Math.round(e.loss * 10) / 10, best: e.bestUci, concepts: e.concepts, text: e.text } }
    })
  }
  return { ...game, moves, analysis: { depth: REVIEW_DEPTH, evals: stored } }
}

export interface AnalysisRun {
  promise: Promise<(InfoLine[] | null)[] | null>
  cancel(): void
}

/** Analyse missing positions in order. `onEval` fires after each one. Resolves null if cancelled. */
export function runAnalysis(game: GameRecord, start: (InfoLine[] | null)[], onEval?: (evals: (InfoLine[] | null)[], i: number) => void): AnalysisRun {
  let alive = true
  let cancelCurrent: (() => void) | null = null
  const evals = start.slice()
  const promise = (async () => {
    for (let i = 0; i < evals.length; i++) {
      if (!alive) return null
      if (evals[i]) continue
      const pos = replay(game, i)
      let lines: InfoLine[] | null
      if (pos.isGameOver()) lines = []
      else {
        const a = analyse(pos.fen(), { depth: REVIEW_DEPTH, multipv: 1 })
        cancelCurrent = a.cancel
        lines = await a.promise
      }
      if (!alive || !lines) return null
      evals[i] = lines
      onEval?.(evals.slice(), i)
    }
    return evals
  })()
  return {
    promise,
    cancel() {
      alive = false
      cancelCurrent?.()
    },
  }
}
