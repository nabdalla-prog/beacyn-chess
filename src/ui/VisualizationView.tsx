import { useEffect, useMemo, useRef, useState } from 'react'
import type { Key, SquareClasses } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { blindfoldTask, squareQuiz, type BlindfoldTask } from '../training/visualization'
import { mulberry32 } from '../engine/strength'

const EMPTY = '8/8/8/8/8/8/8/8 w - - 0 1'
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const ROUNDS = 10

export function VisualizationView({ mode, onBack }: { mode: 'squares' | 'blindfold'; onBack: () => void }) {
  return (
    <div className="game-layout puzzle vis">
      <div className="board-column">
        <div className="row spread review-top">
          <button type="button" className="small-btn" onClick={onBack}>
            ← Learn
          </button>
          <span className="small muted">Visualization</span>
        </div>
        {mode === 'squares' ? <SquareDrill /> : <Blindfold />}
      </div>
    </div>
  )
}

/** "Tap e4": coordinates hidden, 10 rounds, score and time. */
function SquareDrill() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const targets = useMemo(() => squareQuiz(mulberry32(seed), ROUNDS), [seed])
  const [round, setRound] = useState(0)
  const [right, setRight] = useState(0)
  const [flash, setFlash] = useState<SquareClasses>(new Map())
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  /** Timing starts at the first tap. */
  const started = useRef<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const done = round >= ROUNDS

  const tap = (k: Key) => {
    if (done) return
    started.current ??= Date.now()
    const ok = k === targets[round]
    setFlash(new Map([[targets[round] as Key, ok ? 'cc-target' : 'cc-weak']]))
    if (ok) setRight((r) => r + 1)
    if (round + 1 >= ROUNDS) setElapsed(Math.round((Date.now() - (started.current ?? Date.now())) / 1000))
    setRound((r) => r + 1)
  }

  return (
    <>
      <div className="board-stage">
        <Board key={orientation} fen={EMPTY} orientation={orientation} turnColor="white" coordinates={false} highlights={flash} onSelect={tap} announceSquares={false} label="Empty board" />
      </div>
      <div className="callout puzzle-card" data-testid="vis-squares" aria-live="polite">
        {!done ? (
          <>
            <p className="small muted">
              Round {round + 1} of {ROUNDS} · {right} right · board seen from {orientation === 'white' ? 'White' : 'Black'}
            </p>
            <p className="vis-target">
              Tap <strong data-testid="vis-target">{targets[round]}</strong>
            </p>
          </>
        ) : (
          <p>
            <strong>
              {right}/{ROUNDS} in {elapsed}s{right === ROUNDS ? ' — perfect!' : ''}
            </strong>
          </p>
        )}
        <div className="row wrap">
          <button type="button" className="small-btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} disabled={round > 0 && !done}>
            Flip board
          </button>
          {done && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                setSeed((s) => s + 1)
                setRound(0)
                setRight(0)
                setFlash(new Map())
                started.current = null
              }}
            >
              Play again
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Blindfold-lite: watch the start, pieces vanish, moves are read out, then find a piece. */
function Blindfold() {
  const [length, setLength] = useState(4)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  return <BlindfoldRound key={`${seed}-${length}`} seed={seed} length={length} setLength={setLength} next={() => setSeed((s) => s + 1)} />
}

function BlindfoldRound({ seed, length, setLength, next }: { seed: number; length: number; setLength: (n: number) => void; next: () => void }) {
  const task: BlindfoldTask = useMemo(() => blindfoldTask(mulberry32(seed), length), [seed, length])
  const [shown, setShown] = useState(0)
  const [answer, setAnswer] = useState<Key | null>(null)
  const reading = shown < task.moves.length

  useEffect(() => {
    if (!reading) return
    const t = setTimeout(() => setShown((s) => s + 1), 1300)
    return () => clearTimeout(t)
  }, [reading, shown])

  const correct = answer === task.answer
  const highlights: SquareClasses = answer ? new Map<Key, string>([[task.answer as Key, 'cc-target'], ...(correct ? [] : [[answer, 'cc-weak'] as [Key, string]])]) : new Map()

  return (
    <>
      <div className="board-stage">
        <Board fen={answer ? task.fen : shown === 0 ? START : EMPTY} orientation="white" turnColor="white" highlights={highlights} onSelect={(k) => !reading && !answer && setAnswer(k)} />
      </div>
      <div className="callout puzzle-card" data-testid="vis-blindfold" aria-live="polite">
        <p className="small muted">The pieces start in the usual places, then disappear. Follow the moves in your head.</p>
        <ol className="line-moves inline-moves" aria-label="Moves read out">
          {task.moves.slice(0, shown).map((m, i) => (
            <li key={i} className={i === shown - 1 ? 'current' : 'played'}>
              {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
              {m}
            </li>
          ))}
        </ol>
        <p>
          <strong data-testid="vis-question">
            {reading ? 'Watch the moves…' : answer ? (correct ? `Yes — it’s on ${task.answer}!` : `Not quite: it’s on ${task.answer}.`) : task.question}
          </strong>
        </p>
        <div className="row wrap">
          {[2, 4, 6, 8].map((n) => (
            <button key={n} type="button" className={`small-btn ${n === length ? 'accent' : ''}`} onClick={() => setLength(n)} aria-pressed={n === length}>
              {n} moves
            </button>
          ))}
          {answer && (
            <button type="button" className="primary" onClick={next}>
              Next
            </button>
          )}
        </div>
      </div>
    </>
  )
}
