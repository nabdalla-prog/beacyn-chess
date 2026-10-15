// Live coaching during a game: per-move feedback, the hint ladder, guided-mode
// blunder warnings and the board views used to show explanations.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { analyse } from '../coach/analyst'
import { classifyMove } from '../coach/classify'
import { explainMove, hintFor, warningFor, type Explanation, type Frame, type Hint, type Line, type Warning } from '../coach/explain'
import { uciLineToSan } from '../coach/board'
import { toWhitePov, type InfoLine, type Score } from '../engine/uci'
import { replay } from '../game/session'
import type { usePlay } from './usePlay'

type Play = ReturnType<typeof usePlay>

export type BoardView =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'line'; line: Line; fens: string[]; index: number }

export interface PendingWarning {
  warning: Warning
  from: Square
  to: Square
  promotion?: string
}

export function useCoach(play: Play) {
  const { game, chess, userTurn } = play
  const mode = play.settings.coachMode
  const live = mode !== 'silent'
  const [feedback, setFeedback] = useState<Record<number, Explanation>>({})
  const [hint, setHint] = useState<Hint | null>(null)
  const [warning, setWarning] = useState<PendingWarning | null>(null)
  const [view, setView] = useState<BoardView | null>(null)
  const [evalWhite, setEvalWhite] = useState<Score | null>(null)
  const gameId = useRef<string | null>(null)
  const latestGame = useRef(game)
  useLayoutEffect(() => {
    latestGame.current = game
  })

  // New game: clear everything.
  useEffect(() => {
    if (game?.id === gameId.current) return
    gameId.current = game?.id ?? null
    setFeedback({})
    setHint(null)
    setWarning(null)
    setView(null)
    setEvalWhite(null)
  }, [game?.id])

  const fen = chess?.fen() ?? null

  // Position changed: an old hint no longer applies. (Explanation views stay open
  // until the user closes them, so the coach's reply doesn't yank them away.)
  useEffect(() => {
    setHint(null)
  }, [fen])

  // Analyse the position while the user thinks (feeds hints, the guard and the eval bar).
  useEffect(() => {
    if (!live || !fen || !userTurn || !chess || chess.isGameOver()) return
    const a = analyse(fen, { multipv: 3 })
    void a.promise.then((lines) => {
      if (lines?.[0]) setEvalWhite(toWhitePov(lines[0].score, chess.turn()))
    })
    return a.cancel
  }, [live, fen, userTurn, chess])

  // After a takeback, drop feedback for moves that no longer exist.
  const moveCount = game?.moves.length ?? 0
  useEffect(() => {
    setFeedback((f) => {
      const stale = Object.keys(f).filter((k) => Number(k) >= moveCount)
      if (!stale.length) return f
      const next = { ...f }
      for (const k of stale) delete next[Number(k)]
      return next
    })
  }, [moveCount])

  // Explain each user move once the engine has looked at it.
  useEffect(() => {
    if (!live || !game) return
    const ply = game.moves.findLastIndex((m) => m.by === 'user')
    if (ply < 0 || feedback[ply]) return
    const id = game.id
    const fenBefore = replay(game, ply).fen()
    const afterChess = replay(game, ply + 1)
    const fenAfter = afterChess.fen()
    const a1 = analyse(fenBefore, { multipv: 3 })
    const a2 = afterChess.isGameOver() ? null : analyse(fenAfter, { multipv: 1 })
    void Promise.all([a1.promise, a2 ? a2.promise : Promise.resolve([] as InfoLine[])]).then(([before, after]) => {
      if (!before || !after || gameId.current !== id) return
      // Ignore results for a move that was taken back meanwhile.
      if (latestGame.current?.moves[ply]?.uci !== game.moves[ply].uci) return
      const e = explainMove({ fenBefore, uci: game.moves[ply].uci, ply, before, after })
      setFeedback((f) => ({ ...f, [ply]: e }))
      play.annotate(ply, { cls: e.cls, loss: Math.round(e.loss * 10) / 10, best: e.bestUci, concepts: e.concepts })
      if (after[0]) setEvalWhite(toWhitePov(after[0].score, afterChess.turn()))
    })
    // Keep these searches running across re-renders; they are cheap and cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, game?.id, game?.moves.length])

  // Guided mode: check a move before it is played and warn about blunders.
  const guardRef = play.guardRef
  useEffect(() => {
    guardRef.current =
      mode !== 'guided'
        ? null
        : async (fenBefore: string, uci: string) => {
            const before = await analyse(fenBefore, { multipv: 3 }).promise
            if (!before?.[0]) return true
            const top = before[0]
            if (top.pv[0] === uci) return true
            const known = before.find((l) => l.pv[0] === uci)
            if (known) {
              const { cls } = classifyMove({ best: top.score, played: known.score, isTopMove: false })
              if (cls !== 'blunder' && cls !== 'missed-win') return true
            }
            const c = new Chess(fenBefore)
            c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
            const after = c.isGameOver() ? [] : await analyse(c.fen(), { multipv: 1 }).promise
            if (!after) return true
            const e = explainMove({ fenBefore, uci, ply: -1, before, after })
            const w = warningFor(e)
            if (!w) return true
            setWarning({ warning: w, from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] })
            return false
          }
    return () => {
      guardRef.current = null
    }
  }, [mode, guardRef])

  const requestHint = useCallback(async () => {
    if (!fen || !userTurn) return
    const level = Math.min(4, (hint?.level ?? 0) + 1) as Hint['level']
    const lines = await analyse(fen, { multipv: 3 }).promise
    if (!lines) return
    const h = hintFor(fen, lines, level)
    if (!h) return
    setHint(h)
    setView(null)
    const meta = play.moveMetaRef.current
    meta.hintLevel = Math.max(meta.hintLevel ?? 0, level)
  }, [fen, userTurn, hint, play.moveMetaRef])

  const dismissWarning = useCallback(() => {
    setWarning(null)
    play.resetBoard()
  }, [play])

  const playAnyway = useCallback(() => {
    if (!warning) return
    setWarning(null)
    play.userMove(warning.from, warning.to, warning.promotion, { force: true })
  }, [warning, play])

  const showFrame = useCallback((frame: Frame) => setView({ kind: 'frame', frame }), [])
  const showLine = useCallback((line: Line) => {
    const { fens } = uciLineToSan(line.fen, line.uci)
    setView({ kind: 'line', line, fens, index: 0 })
  }, [])
  const stepLine = useCallback((delta: number) => {
    setView((v) => (v?.kind === 'line' ? { ...v, index: Math.max(0, Math.min(v.fens.length - 1, v.index + delta)) } : v))
  }, [])
  const closeView = useCallback(() => setView(null), [])

  const lastUserPly = game ? game.moves.findLastIndex((m) => m.by === 'user') : -1
  return {
    mode,
    live,
    feedback,
    latest: lastUserPly >= 0 ? (feedback[lastUserPly] ?? null) : null,
    pendingFeedback: live && lastUserPly >= 0 && !feedback[lastUserPly],
    hint,
    warning,
    view,
    evalWhite,
    requestHint,
    dismissWarning,
    playAnyway,
    showFrame,
    showLine,
    stepLine,
    closeView,
  }
}
