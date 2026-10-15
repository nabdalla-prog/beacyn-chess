import { useCallback, useEffect, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key, SquareClasses } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { playSound } from './sound'
import { analyse } from '../coach/analyst'
import { regionOf, regionSquares, PIECE_NAME } from '../coach/board'
import { classifyMove, isError, CLASS_INFO } from '../coach/classify'
import { explainMove, scoreAfterMove } from '../coach/explain'
import { REVIEW_DEPTH } from '../coach/review'
import { legalDests } from '../game/session'
import { checkMove, startPosition, THEME_LABEL, THEMES, type Theme, type TrainPuzzle } from '../training/puzzles'
import type { Attempt } from '../training/srs'

type Status = 'setup' | 'playing' | 'checking' | 'wrong' | 'solved' | 'revealed'

interface Props {
  title: string
  puzzles: TrainPuzzle[]
  /** Show the theme name before solving (theme practice) or keep it hidden (reviews). */
  showTheme: boolean
  onAttempt: (p: TrainPuzzle, a: Attempt) => void
  onExit: () => void
  /** Replaces the built-in "Next puzzle" step (e.g. placement picks the next puzzle adaptively). */
  onNext?: () => void
  /** Hide the hint and solution buttons (placement measures unaided solving). */
  noHelp?: boolean
}

const pairOf = (u?: string): Key[] | undefined => (u ? [u.slice(0, 2) as Key, u.slice(2, 4) as Key] : undefined)
const play = (c: Chess, u: string) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })

function promptFor(p: TrainPuzzle, turn: 'w' | 'b'): string {
  const side = turn === 'w' ? 'White' : 'Black'
  if (p.source === 'own') return `${side} to move. You played ${p.playedSan} here — find a better move.`
  if (p.themes.includes('mateIn1')) return `${side} to move. Find mate in 1.`
  if (p.themes.includes('mateIn2')) return `${side} to move. Find mate in 2.`
  return `${side} to move. Find the best move.`
}

export function PuzzleSession({ title, puzzles, showTheme, onAttempt, onExit, onNext, noHelp }: Props) {
  const [index, setIndex] = useState(0)
  const p = puzzles[index]
  const [fen, setFen] = useState(p?.fen ?? '')
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<Status>('setup')
  useEffect(() => {
    if (status === 'solved') playSound('right')
    else if (status === 'wrong') playSound('wrong')
  }, [status])
  const [message, setMessage] = useState('')
  const [last, setLast] = useState<Key[] | undefined>()
  const [shapes, setShapes] = useState<DrawShape[]>([])
  const [highlights, setHighlights] = useState<SquareClasses>(new Map())
  const [boardKey, setBoardKey] = useState(0)
  const attempt = useRef<Attempt>({ solved: false, wrongTries: 0, hintLevel: 0, revealed: false })
  const reported = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms))

  // Start a puzzle: show the position, then play the opponent's setup move.
  useEffect(() => {
    if (!p) return
    timers.current.forEach(clearTimeout)
    timers.current = []
    attempt.current = { solved: false, wrongTries: 0, hintLevel: 0, revealed: false }
    reported.current = false
    setStep(0)
    setShapes([])
    setHighlights(new Map())
    setFen(p.fen)
    setLast(undefined)
    const start = startPosition(p)
    if (p.setup) {
      setStatus('setup')
      setMessage('Watch the opponent’s move…')
      later(() => {
        setFen(start.fen())
        setLast(pairOf(p.setup))
        setStatus('playing')
        setMessage(promptFor(p, start.turn()))
      }, 700)
    } else {
      setStatus('playing')
      setMessage(promptFor(p, start.turn()))
    }
    return () => timers.current.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id])

  const finish = useCallback(
    (solved: boolean, revealed: boolean) => {
      if (reported.current || !p) return
      reported.current = true
      attempt.current = { ...attempt.current, solved, revealed }
      onAttempt(p, attempt.current)
    },
    [p, onAttempt],
  )

  if (!p) {
    return (
      <section className="card puzzle-done">
        <h2>{title}</h2>
        <p>All done — nice work!</p>
        <button type="button" className="primary" onClick={onExit}>
          Back to training
        </button>
      </section>
    )
  }

  const pos = new Chess(fen)
  const userColor = startPosition(p).turn()
  const canMove = (status === 'playing' || status === 'wrong') && pos.turn() === userColor

  const onMove = async (from: Key, to: Key) => {
    if (!canMove) return
    const c = new Chess(fen)
    let mv
    try {
      mv = c.move({ from: from as Square, to: to as Square, promotion: 'q' })
    } catch {
      setBoardKey((k) => k + 1)
      return
    }
    const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`
    setShapes([])
    setHighlights(new Map())
    let verdict = checkMove(p, pos, step, uci)

    // Own mistakes: another move the engine rates Good or better also counts.
    if (verdict === 'wrong' && p.source === 'own') {
      setStatus('checking')
      setMessage('Checking…')
      const before = await analyse(fen, { depth: REVIEW_DEPTH, multipv: 1 }).promise
      const after = c.isGameOver() ? [] : await analyse(c.fen(), { depth: REVIEW_DEPTH, multipv: 1 }).promise
      if (before?.[0] && after) {
        const { cls } = classifyMove({ best: before[0].score, played: scoreAfterMove(c, after), isTopMove: false })
        if (!isError(cls)) {
          verdict = 'solved'
          setMessage(`${mv.san} works too — the engine rates it ${CLASS_INFO[cls].label.toLowerCase()}.`)
        } else {
          const e = explainMove({ fenBefore: fen, uci, ply: 0, before, after })
          attempt.current.wrongTries++
          setStatus('wrong')
          setMessage(`Not quite: ${e.text.replace(/ Better was \S+\.$/, '')} Try again.`)
          setBoardKey((k) => k + 1)
          return
        }
      }
    }

    if (verdict === 'wrong') {
      attempt.current.wrongTries++
      setStatus('wrong')
      setMessage(`${mv.san} isn’t it. Try again.`)
      setBoardKey((k) => k + 1)
      return
    }
    setFen(c.fen())
    setLast(pairOf(uci))
    if (verdict === 'solved') {
      setStatus('solved')
      if (p.source !== 'own' || uci === p.solution[0]) setMessage(attempt.current.wrongTries === 0 && attempt.current.hintLevel === 0 ? `${mv.san} — solved!` : `${mv.san} — solved.`)
      finish(true, false)
      return
    }
    // Correct so far: the opponent replies.
    const reply = p.solution[step + 1]
    setStatus('setup')
    setMessage('Good! Keep going…')
    later(() => {
      const c2 = new Chess(c.fen())
      play(c2, reply)
      setFen(c2.fen())
      setLast(pairOf(reply))
      setStep(step + 2)
      setStatus('playing')
      setMessage('Good! Now the next move.')
    }, 450)
  }

  const hint = () => {
    const u = p.solution[step]
    if (!u) return
    const level = Math.min(3, attempt.current.hintLevel + 1)
    attempt.current.hintLevel = level
    const from = u.slice(0, 2) as Square
    const to = u.slice(2, 4) as Square
    if (level === 1) {
      const region = regionOf(to)
      setHighlights(new Map(regionSquares(region).map((s) => [s as Key, 'cc-region'])))
      setShapes([])
      setMessage(`Hint: look at the ${region}.`)
    } else if (level === 2) {
      const piece = pos.get(from)
      setHighlights(new Map([[from as Key, 'cc-piece']]))
      setMessage(`Hint: move your ${piece ? PIECE_NAME[piece.type] : 'piece'} on ${from}.`)
    } else {
      setHighlights(new Map())
      setShapes([{ orig: from as Key, dest: to as Key, brush: 'hint' }])
      setMessage('Hint: play the arrow.')
    }
  }

  const reveal = () => {
    setStatus('revealed')
    setHighlights(new Map())
    finish(false, true)
    const c = new Chess(fen)
    const rest = p.solution.slice(step)
    setMessage(`The solution: ${rest.map((u) => {
      try {
        return play(c, u).san
      } catch {
        return u
      }
    }).join(' ')}`)
    const c2 = new Chess(fen)
    rest.forEach((u, i) =>
      later(() => {
        play(c2, u)
        setFen(c2.fen())
        setLast(pairOf(u))
        setShapes([])
      }, 600 * (i + 1)),
    )
    if (rest[0]) setShapes([{ orig: rest[0].slice(0, 2) as Key, dest: rest[0].slice(2, 4) as Key, brush: 'best' }])
  }

  const done = status === 'solved' || status === 'revealed'
  const themeLabel = p.themes.filter((t): t is Theme => (THEMES as readonly string[]).includes(t)).map((t) => THEME_LABEL[t])[0]

  return (
    <div className="game-layout puzzle">
      <div className="board-column">
        <div className="row spread review-top">
          <button type="button" className="small-btn" onClick={onExit}>
            ← Training
          </button>
          <span className="muted small">
            {title} · {index + 1}/{puzzles.length}
          </span>
        </div>
        <div className="board-stage">
          <Board
            fen={fen}
            orientation={userColor === 'w' ? 'white' : 'black'}
            turnColor={pos.turn() === 'w' ? 'white' : 'black'}
            movable={canMove ? (userColor === 'w' ? 'white' : 'black') : undefined}
            dests={canMove ? (legalDests(pos) as Map<Key, Key[]>) : undefined}
            lastMove={last}
            check={pos.isCheck()}
            shapes={shapes}
            highlights={highlights}
            resetKey={boardKey}
            onMove={(o, d) => void onMove(o, d)}
          />
        </div>
        <div className={`callout puzzle-card ${status}`} data-testid="puzzle" aria-live="polite">
          <p className="small muted">
            {p.source === 'own' ? 'From your games' : `Puzzle ${p.rating ? `· rated ${p.rating}` : ''}`}
            {(showTheme || done) && themeLabel ? ` · ${themeLabel}` : ''}
          </p>
          <p>
            <strong data-testid="puzzle-message">{message}</strong>
          </p>
          <div className="row wrap">
            {!done ? (
              noHelp ? (
                <button type="button" className="small-btn" onClick={reveal} disabled={status === 'setup' || status === 'checking'}>
                  I don’t know
                </button>
              ) : (
                <>
                  <button type="button" className="small-btn" onClick={hint} disabled={!canMove || attempt.current.hintLevel >= 3}>
                    Hint
                  </button>
                  <button type="button" className="small-btn" onClick={reveal} disabled={status === 'setup' || status === 'checking'}>
                    Show solution
                  </button>
                </>
              )
            ) : (
              <button type="button" className="primary" onClick={() => (onNext ? onNext() : setIndex((i) => i + 1))} data-testid="next-puzzle">
                {index + 1 < puzzles.length ? 'Next puzzle' : 'Finish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
