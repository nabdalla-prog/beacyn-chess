import { useEffect, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { analyse } from '../coach/analyst'
import { kingCentrality, opposition, rooksBehindPassedPawns } from '../coach/board'
import { REVIEW_DEPTH } from '../coach/review'
import { formatScore, type Score } from '../engine/uci'
import { legalDests } from '../game/session'
import { judgeDrill, type DrillStatus, type EndgameDrill } from '../training/endgames'
import { recordDrill, type TrainingState } from '../training/store'

const neg = (s: Score): Score => ({ type: s.type, value: -s.value })

/** One verified endgame fact about the user's last move, if any. */
function factAbout(before: Chess, after: Chess, user: 'w' | 'b', movedPiece: string): string | null {
  const o = opposition(after)
  if (movedPiece === 'k' && o?.kind === 'direct' && o.holder === user) return 'You have the opposition: the other king must give way.'
  const rookBehind = rooksBehindPassedPawns(after, user).filter((r) => !rooksBehindPassedPawns(before, user).some((b) => b.rook === r.rook))
  if (rookBehind.length) return 'Your rook stands behind the passed pawn — exactly where rooks belong.'
  if (movedPiece === 'k' && kingCentrality(after, user) < kingCentrality(before, user)) return 'Your king moved toward the centre: in endgames the king is a fighting piece.'
  return null
}

export function EndgameDrillView({ drill, onBack, update }: { drill: EndgameDrill; onBack: () => void; update: (fn: (s: TrainingState) => TrainingState) => void }) {
  const user = new Chess(drill.fen).turn()
  const [fen, setFen] = useState(drill.fen)
  const [last, setLast] = useState<Key[] | undefined>()
  const [userMoves, setUserMoves] = useState(0)
  const [status, setStatus] = useState<DrillStatus>({ state: 'playing' })
  const [thinking, setThinking] = useState(false)
  const [message, setMessage] = useState('')
  const [score, setScore] = useState<Score | null>(null)
  const [shapes, setShapes] = useState<DrawShape[]>([])
  const [boardKey, setBoardKey] = useState(0)
  const promoted = useRef(false)
  const run = useRef(0)

  const restart = () => {
    run.current++
    setFen(drill.fen)
    setLast(undefined)
    setUserMoves(0)
    setStatus({ state: 'playing' })
    setThinking(false)
    setMessage('')
    setScore(null)
    setShapes([])
    promoted.current = false
  }

  const pos = new Chess(fen)
  // Read-only hook for end-to-end tests that need the current position.
  useEffect(() => {
    ;(window as unknown as { __drillFen?: string }).__drillFen = fen
  }, [fen])
  const canMove = status.state === 'playing' && !thinking && pos.turn() === user

  const onMove = async (from: Key, to: Key) => {
    if (!canMove) return
    const me = run.current
    const before = new Chess(fen)
    const after = new Chess(fen)
    let m
    try {
      m = after.move({ from: from as Square, to: to as Square, promotion: 'q' })
    } catch {
      setBoardKey((k) => k + 1)
      return
    }
    if (m.promotion) promoted.current = true
    const moves = userMoves + 1
    setShapes([])
    setFen(after.fen())
    setLast([from, to])
    setUserMoves(moves)
    setMessage(factAbout(before, after, user, m.piece) ?? '')

    let lines = null
    if (!after.isGameOver()) {
      setThinking(true)
      lines = await analyse(after.fen(), { depth: REVIEW_DEPTH, multipv: 1 }).promise
      if (run.current !== me) return
    }
    const userScore = lines?.[0] ? neg(lines[0].score) : null
    setScore(userScore)
    const verdict = judgeDrill(drill, user, after, userScore, moves, promoted.current)
    if (verdict.state !== 'playing' || !lines?.[0]) {
      setThinking(false)
      setStatus(verdict)
      if (verdict.state !== 'playing') update((s) => recordDrill(s, { id: drill.id, won: verdict.state === 'won', mate: after.isCheckmate(), at: Date.now() }))
      return
    }
    // The engine answers with its best move.
    const reply = lines[0].pv[0]
    setTimeout(() => {
      if (run.current !== me) return
      const next = new Chess(after.fen())
      next.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] })
      setFen(next.fen())
      setLast([reply.slice(0, 2) as Key, reply.slice(2, 4) as Key])
      setThinking(false)
      const v2 = judgeDrill(drill, user, next, next.isGameOver() ? null : userScore, moves, promoted.current)
      if (v2.state !== 'playing') {
        setStatus(v2)
        update((s) => recordDrill(s, { id: drill.id, won: v2.state === 'won', mate: false, at: Date.now() }))
      }
    }, 400)
  }

  const hint = async () => {
    const lines = await analyse(fen, { depth: REVIEW_DEPTH, multipv: 1 }).promise
    const u = lines?.[0]?.pv[0]
    if (u) setShapes([{ orig: u.slice(0, 2) as Key, dest: u.slice(2, 4) as Key, brush: 'hint' }])
  }

  const goal = drill.goal === 'mate' ? `Checkmate within ${drill.limit} moves.` : drill.goal === 'promote' ? `Promote the pawn and keep the win (${drill.limit} moves).` : `Hold the draw for ${drill.limit} moves.`

  return (
    <div className="game-layout drill">
      <div className="board-column">
        <div className="row spread review-top">
          <button type="button" className="small-btn" onClick={onBack}>
            ← Learn
          </button>
          <span className="small muted">
            {drill.group} · move {userMoves}/{drill.limit}
          </span>
        </div>
        <div className="board-stage">
          <Board
            fen={fen}
            orientation={user === 'w' ? 'white' : 'black'}
            turnColor={pos.turn() === 'w' ? 'white' : 'black'}
            movable={canMove ? (user === 'w' ? 'white' : 'black') : undefined}
            dests={canMove ? (legalDests(pos) as Map<Key, Key[]>) : undefined}
            lastMove={last}
            check={pos.isCheck()}
            shapes={shapes}
            resetKey={boardKey}
            onMove={(o, d) => void onMove(o, d)}
          />
        </div>
        <div className={`callout puzzle-card ${status.state === 'won' ? 'solved' : status.state === 'failed' ? 'wrong' : ''}`} data-testid="drill" aria-live="polite">
          <p className="small muted">
            {drill.name} · {goal}
            {score && status.state === 'playing' ? ` · engine ${formatScore(score)}` : ''}
          </p>
          <p>
            <strong data-testid="drill-status">
              {status.state !== 'playing' ? status.reason : thinking ? 'Engine is thinking…' : message || (userMoves === 0 ? `You play ${user === 'w' ? 'White' : 'Black'}. Your move.` : 'Your move.')}
            </strong>
          </p>
          <div className="row wrap">
            {status.state === 'playing' ? (
              <button type="button" className="small-btn" onClick={() => void hint()} disabled={!canMove}>
                Hint
              </button>
            ) : null}
            <button type="button" className={status.state === 'playing' ? 'small-btn' : 'primary'} onClick={restart}>
              {status.state === 'playing' ? 'Restart' : 'Try again'}
            </button>
          </div>
        </div>
      </div>
      <aside className="side-panel">
        <section className="card">
          <h3>The idea</h3>
          <p className="small">{drill.idea}</p>
        </section>
      </aside>
    </div>
  )
}
