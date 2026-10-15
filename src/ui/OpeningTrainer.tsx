import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { legalDests } from '../game/session'
import type { Repertoire, RepLine } from '../training/repertoires'
import { dueCards, type Card } from '../training/srs'
import { applyOpeningDrill, type TrainingState } from '../training/store'

/** Line to drill: due ones first, then ones never drilled, then the least recently reviewed. */
function pickLine(rep: Repertoire, cards: Record<string, Card>, now: number): RepLine {
  const due = dueCards(rep.lines.map((l) => cards[l.id]).filter(Boolean), now)
  if (due[0]) return rep.lines.find((l) => l.id === due[0].id)!
  return rep.lines.find((l) => !cards[l.id]) ?? [...rep.lines].sort((a, b) => cards[a.id].due - cards[b.id].due)[0]
}

export function OpeningTrainer({ rep, cards, update, onBack }: { rep: Repertoire; cards: Record<string, Card>; update: (fn: (s: TrainingState) => TrainingState) => void; onBack: () => void }) {
  const now = Date.now()
  const [line, setLine] = useState<RepLine>(() => pickLine(rep, cards, now))
  const [ply, setPly] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [shapes, setShapes] = useState<DrawShape[]>([])
  const [message, setMessage] = useState('')
  const [boardKey, setBoardKey] = useState(0)
  const [finished, setFinished] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const positions = useMemo(() => {
    const c = new Chess()
    const fens = [c.fen()]
    const moves = line.moves.map((san) => {
      const m = c.move(san)
      fens.push(c.fen())
      return m
    })
    return { fens, moves }
  }, [line])

  const userTurn = (p: number) => (p % 2 === 0) === (rep.color === 'w')

  // The opponent's moves play themselves.
  useEffect(() => {
    if (finished) return
    if (ply >= line.moves.length) {
      setFinished(true)
      update((s) => applyOpeningDrill(s, line.id, mistakes, Date.now()))
      setMessage(mistakes === 0 ? 'Line complete — perfect!' : `Line complete with ${mistakes} slip${mistakes === 1 ? '' : 's'}. It will come back sooner.`)
      return
    }
    if (!userTurn(ply)) {
      timer.current = setTimeout(() => setPly((p) => p + 1), 500)
      return () => clearTimeout(timer.current!)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, finished, line])

  const start = (l: RepLine) => {
    setLine(l)
    setPly(0)
    setMistakes(0)
    setShapes([])
    setMessage('')
    setFinished(false)
  }

  const fen = positions.fens[ply]
  const pos = new Chess(fen)
  const expected = positions.moves[ply]
  const canMove = !finished && userTurn(ply) && ply < line.moves.length
  const lastMove = ply > 0 ? ([positions.moves[ply - 1].from, positions.moves[ply - 1].to] as Key[]) : undefined
  const idea = line.notes[ply - 1]

  const onMove = (from: Key, to: Key) => {
    if (!canMove || !expected) return
    if (from === expected.from && to === expected.to) {
      setShapes([])
      setMessage(line.notes[ply] ?? `${expected.san} — that’s the line.`)
      setPly(ply + 1)
      return
    }
    setMistakes((m) => m + 1)
    let san = `${from}-${to}`
    try {
      san = new Chess(fen).move({ from: from as Square, to: to as Square, promotion: 'q' }).san
    } catch {
      /* illegal drops just reset */
    }
    setShapes([{ orig: expected.from as Key, dest: expected.to as Key, brush: 'best' }])
    setMessage(`${san} isn’t in this repertoire. The line plays ${expected.san}${line.notes[ply] ? `: ${line.notes[ply].charAt(0).toLowerCase()}${line.notes[ply].slice(1)}` : '.'}`)
    setBoardKey((k) => k + 1)
  }

  return (
    <div className="game-layout opening">
      <div className="board-column">
        <div className="row spread review-top">
          <button type="button" className="small-btn" onClick={onBack}>
            ← Learn
          </button>
          <span className="small muted">
            {rep.name} · {line.name}
          </span>
        </div>
        <div className="board-stage">
          <Board
            fen={fen}
            orientation={rep.color === 'w' ? 'white' : 'black'}
            turnColor={pos.turn() === 'w' ? 'white' : 'black'}
            movable={canMove ? (rep.color === 'w' ? 'white' : 'black') : undefined}
            dests={canMove ? (legalDests(pos) as Map<Key, Key[]>) : undefined}
            lastMove={lastMove}
            check={pos.isCheck()}
            shapes={shapes}
            resetKey={boardKey}
            onMove={onMove}
          />
        </div>
        <div className={`callout puzzle-card ${finished ? 'solved' : shapes.length ? 'wrong' : ''}`} data-testid="opening-card" aria-live="polite">
          <p className="small muted">
            Move {Math.floor(ply / 2) + 1} · {canMove ? 'your move' : finished ? 'done' : 'opponent…'}
          </p>
          <p>
            <strong>{message || (canMove ? (ply === 0 ? `Play the first move of the ${rep.name}.` : 'Your move — play the line.') : 'Watch the opponent’s move.')}</strong>
          </p>
          {!message && idea && <p className="small muted">{idea}</p>}
          <ol className="line-moves inline-moves" aria-label="Moves so far">
            {positions.moves.slice(0, ply).map((m, i) => (
              <li key={i} className="played">
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                {m.san}
              </li>
            ))}
          </ol>
          {finished && (
            <div className="row wrap">
              {rep.lines.map((l) => (
                <button key={l.id} type="button" className={l.id === line.id ? 'small-btn' : 'small-btn accent'} onClick={() => start(l)}>
                  {l.id === line.id ? 'Again' : l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <aside className="side-panel">
        <section className="card">
          <h3>{rep.name}</h3>
          <p className="small">{rep.summary}</p>
          <ul className="lesson-list">
            {rep.lines.map((l) => {
              const c = cards[l.id]
              const status = !c ? 'new' : c.due <= now ? 'due' : `next in ${Math.max(1, Math.round((c.due - now) / 86_400_000))} d`
              return (
                <li key={l.id}>
                  <button type="button" className="link lesson-link" onClick={() => start(l)}>
                    {l.name} <span className="small muted">· {status}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </aside>
    </div>
  )
}
