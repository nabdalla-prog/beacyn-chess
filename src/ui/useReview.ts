// Runs the engine over every position of a finished game (reusing anything
// already analysed live), stores the result on the game, and builds the review.
import { useEffect, useMemo, useRef, useState } from 'react'
import { identifyOpening, loadBook, type OpeningInfo } from '../coach/openings'
import { buildReview } from '../coach/review'
import { initialEvals, runAnalysis, withAnalysis } from '../coach/gameAnalysis'
import type { InfoLine } from '../engine/uci'
import type { GameRecord } from '../game/session'
import { getGame, saveGame } from '../storage/db'

export function useReview(game: GameRecord, onSaved?: (g: GameRecord) => void) {
  const [evals, setEvals] = useState<(InfoLine[] | null)[]>(() => initialEvals(game))
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
    const start = initialEvals(game)
    if (start.every(Boolean)) return
    let sinceSave = 0
    const persist = async (e: (InfoLine[] | null)[]) => {
      // Merge into the latest saved copy so retries recorded meanwhile aren't lost.
      const latest = (await getGame(game.id)) ?? game
      const next = withAnalysis(latest, e)
      await saveGame(next)
      onSavedRef.current?.(next)
    }
    const run = runAnalysis(game, start, (e, i) => {
      setEvals(e)
      if (++sinceSave >= 8 || i === e.length - 1) {
        sinceSave = 0
        void persist(e)
      }
    })
    run.promise.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return run.cancel
    // Run once per game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id])

  const review = useMemo(() => buildReview(game, evals), [game, evals])
  const done = evals.filter(Boolean).length
  return { review, evals, opening, progress: { done, total: evals.length }, error }
}
