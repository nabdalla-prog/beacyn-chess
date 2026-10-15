// Runs the engine over every position of a finished game (reusing anything
// already analysed live), stores the result on the game, and builds the review.
import { useEffect, useMemo, useRef, useState } from 'react'
import { analyse } from '../coach/analyst'
import { identifyOpening, loadBook, type OpeningInfo } from '../coach/openings'
import { buildReview, fromStored, REVIEW_DEPTH, toStored, type StoredEval } from '../coach/review'
import type { InfoLine } from '../engine/uci'
import { replay, type GameRecord } from '../game/session'
import { saveGame } from '../storage/db'

export function useReview(game: GameRecord, onSaved?: (g: GameRecord) => void) {
  const total = game.moves.length + 1
  const [evals, setEvals] = useState<(InfoLine[] | null)[]>(() =>
    Array.from({ length: total }, (_, i) => (game.analysis?.depth === REVIEW_DEPTH ? fromStored(game.analysis.evals[i]) : null)),
  )
  const [opening, setOpening] = useState<OpeningInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  })

  useEffect(() => {
    let alive = true
    loadBook()
      .then((book) => alive && setOpening(identifyOpening(game, book)))
      .catch(() => {}) // the review works without opening names
    return () => {
      alive = false
    }
  }, [game])

  // Analyse missing positions one at a time, saving progress as we go.
  useEffect(() => {
    let alive = true
    let cancel: (() => void) | null = null
    const current = evals.slice()
    void (async () => {
      let sinceSave = 0
      for (let i = 0; i < total && alive; i++) {
        if (current[i]) continue
        const pos = replay(game, i)
        let lines: InfoLine[] | null
        if (pos.isGameOver()) lines = []
        else {
          const a = analyse(pos.fen(), { depth: REVIEW_DEPTH, multipv: 1 })
          cancel = a.cancel
          try {
            lines = await a.promise
          } catch (e) {
            if (alive) setError(e instanceof Error ? e.message : String(e))
            return
          }
        }
        if (!alive || !lines) return
        current[i] = lines
        setEvals(current.slice())
        if (++sinceSave >= 8 || i === total - 1) {
          sinceSave = 0
          void persist(current)
        }
      }
      if (alive && current.every(Boolean) && game.analysis?.depth !== REVIEW_DEPTH) void persist(current)
    })()

    async function persist(e: (InfoLine[] | null)[]) {
      // undefined = not analysed yet, null = no engine line (game over).
      const stored: (StoredEval | null | undefined)[] = e.map((l) => (l ? toStored(l) : undefined))
      const next: GameRecord = { ...game, analysis: { depth: REVIEW_DEPTH, evals: stored } }
      await saveGame(next)
      onSavedRef.current?.(next)
    }

    return () => {
      alive = false
      cancel?.()
    }
    // Run once per game; `evals` is only the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])

  const review = useMemo(() => buildReview(game, evals), [game, evals])
  const done = evals.filter(Boolean).length
  return { review, evals, opening, progress: { done, total }, error }
}
