import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key, SquareClasses } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { NavIcon } from './icons'
import { MoveBadge } from './MoveBadge'
import { EvalGraph } from './EvalGraph'
import { NARROW, useMediaQuery } from './useMediaQuery'
import { useReview } from './useReview'
import { analyse } from '../coach/analyst'
import { uciLineToSan } from '../coach/board'
import { classifyMove, isError, CLASS_INFO, type MoveClass } from '../coach/classify'
import { explainMove, hintFor, scoreAfterMove, type Frame, type Hint, type Line } from '../coach/explain'
import { REVIEW_DEPTH, type KeyMoment } from '../coach/review'
import { formatScore } from '../engine/uci'
import { describeResult, legalDests, opponentLabel, replay, type GameRecord } from '../game/session'
import { saveGame } from '../storage/db'

const SHOWN_CLASSES: MoveClass[] = ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'missed-win']

const toShapes = (f: Frame): DrawShape[] => f.arrows.map((a) => ({ orig: a.orig, dest: a.dest, brush: a.brush }))
const toHighlights = (f: Frame): SquareClasses => new Map(f.highlights.map((h) => [h.square as Key, `cc-${h.kind}`]))
const pairOf = (uci?: string): Key[] | undefined => (uci ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : undefined)
const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${san}`

interface Retry {
  moment: KeyMoment
  tries: number
  status: 'trying' | 'checking' | 'wrong' | 'solved' | 'revealed'
  message: string
  frame?: Frame
  hint?: Hint
}

type View = { kind: 'better' } | { kind: 'line'; line: Line; fens: string[]; index: number } | null

export default function ReviewView({ game: initial, initialPly = null, onBack }: { game: GameRecord; initialPly?: number | null; onBack: () => void }) {
  const [game, setGame] = useState(initial)
  const { review, evals, opening, progress, error } = useReview(initial, (g) => setGame((cur) => ({ ...cur, analysis: g.analysis, moves: g.moves })))
  const total = game.moves.length
  const [cursor, setCursor] = useState(initialPly != null ? Math.min(total, Math.max(0, initialPly)) : total)
  const [view, setView] = useState<View>(null)
  const [retry, setRetry] = useState<Retry | null>(null)
  const [boardKey, setBoardKey] = useState(0)
  const narrow = useMediaQuery(NARROW)
  const user = game.userColor
  const boardRef = useRef<HTMLDivElement>(null)
  /** On phones, actions in the lists below bring the board back into view. */
  const showBoard = () => {
    const el = boardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  const go = useCallback(
    (ply: number) => {
      setCursor(Math.max(0, Math.min(total, ply)))
      setView(null)
      setRetry(null)
    },
    [total],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (view?.kind === 'line') {
        if (e.key === 'ArrowRight') setView({ ...view, index: Math.min(view.fens.length - 1, view.index + 1) })
        else if (e.key === 'ArrowLeft') setView({ ...view, index: Math.max(0, view.index - 1) })
        else if (e.key === 'Escape') setView(null)
        return
      }
      if (retry) return
      if (e.key === 'ArrowRight') go(cursor + 1)
      else if (e.key === 'ArrowLeft') go(cursor - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(total)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor, go, total, view, retry])

  const current = cursor > 0 ? review.moves[cursor - 1] : undefined
  const isUserMove = current?.by === 'user'

  // ----- what the board shows -----
  const board = useMemo(() => {
    if (retry) {
      const pos = new Chess(retry.moment.fen)
      const f = retry.frame ?? retry.hint?.frame
      const interactive = retry.status === 'trying' || retry.status === 'wrong'
      return {
        fen: retry.frame?.fen ?? retry.moment.fen,
        shapes: f ? toShapes(f) : [],
        highlights: f ? toHighlights(f) : new Map(),
        last: retry.frame?.lastMove as Key[] | undefined,
        movable: interactive && !retry.frame ? pos.turn() : undefined,
        dests: interactive && !retry.frame ? legalDests(pos) : new Map(),
      }
    }
    if (view?.kind === 'line') {
      const fen = view.fens[view.index]
      const next = view.line.uci[view.index]
      const moverIsUser = fen.split(' ')[1] === user
      return {
        fen,
        shapes: next ? [{ orig: next.slice(0, 2) as Key, dest: next.slice(2, 4) as Key, brush: moverIsUser ? 'best' : 'threat' }] : [],
        highlights: new Map(),
        last: view.index > 0 ? pairOf(view.line.uci[view.index - 1]) : undefined,
      }
    }
    if (view?.kind === 'better' && current?.explanation.frames[1]) {
      const f = current.explanation.frames[1]
      return { fen: f.fen, shapes: toShapes(f), highlights: toHighlights(f), last: undefined }
    }
    const fen = replay(game, cursor).fen()
    const f = current && isUserMove ? current.explanation.frames[0] : undefined
    return {
      fen,
      shapes: f ? toShapes(f) : [],
      highlights: f ? toHighlights(f) : new Map(),
      last: pairOf(game.moves[cursor - 1]?.uci),
    }
  }, [retry, view, current, isUserMove, game, cursor, user])

  const pos = new Chess(board.fen)

  // ----- retry this position -----
  const recordRetry = (ply: number, solved: boolean, tries: number) => {
    setGame((g) => {
      const next = { ...g, retries: [...(g.retries ?? []), { ply, solved, tries, at: Date.now() }] }
      void saveGame(next)
      return next
    })
  }

  const startRetry = (m: KeyMoment) => {
    showBoard()
    setView(null)
    setRetry({
      moment: m,
      tries: 0,
      status: 'trying',
      message: m.kind === 'error' ? `You played ${m.playedSan} here. Find a better move.` : `${game.imported ? 'Your opponent' : 'The coach'} just slipped. Find the strongest reply.`,
    })
  }

  const onRetryMove = async (from: Key, to: Key) => {
    if (!retry) return
    const m = retry.moment
    const before = new Chess(m.fen)
    let mv
    try {
      mv = before.move({ from, to, promotion: 'q' })
    } catch {
      setBoardKey((k) => k + 1)
      return
    }
    const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`
    const tries = retry.tries + 1
    const lines = evals[m.retryPly]
    if (uci === m.bestUci || !lines?.[0]) {
      setRetry({ ...retry, tries, status: 'solved', message: tries === 1 ? `Yes! ${mv.san} is the move.` : `Yes! ${mv.san} — found it.`, frame: undefined, hint: undefined })
      recordRetry(m.retryPly, true, tries)
      return
    }
    setRetry({ ...retry, tries, status: 'checking', message: 'Checking…', hint: undefined })
    const after = before.isGameOver() ? [] : await analyse(before.fen(), { depth: REVIEW_DEPTH, multipv: 1 }).promise
    if (!after) return
    const { cls } = classifyMove({ best: lines[0].score, played: scoreAfterMove(before, after), isTopMove: false })
    if (!isError(cls)) {
      setRetry((r) => r && { ...r, status: 'solved', message: `${mv.san} works too — the engine rates it ${CLASS_INFO[cls].label.toLowerCase()}. The top move was ${m.bestSan}.` })
      recordRetry(m.retryPly, true, tries)
      return
    }
    const e = explainMove({ fenBefore: m.fen, uci, ply: m.retryPly, before: lines, after })
    setRetry((r) => r && { ...r, status: 'wrong', message: `Not quite: ${e.text.replace(/ Better was \S+\.$/, '')}`, frame: e.frames[0] })
  }

  const retryHint = () => {
    if (!retry) return
    const lines = evals[retry.moment.retryPly]
    if (!lines) return
    const level = Math.min(3, (retry.hint?.level ?? 0) + 1) as Hint['level']
    const h = hintFor(retry.moment.fen, lines, level)
    if (h) setRetry({ ...retry, status: 'trying', frame: undefined, hint: h, message: h.text })
  }

  const reveal = () => {
    if (!retry?.moment.bestUci) return
    const b = retry.moment.bestUci
    setRetry({
      ...retry,
      status: 'revealed',
      message: `The move was ${retry.moment.bestSan}.`,
      frame: { label: 'Answer', fen: retry.moment.fen, arrows: [{ orig: b.slice(0, 2) as Square, dest: b.slice(2, 4) as Square, brush: 'best' }], highlights: [] },
      hint: undefined,
    })
    recordRetry(retry.moment.retryPly, false, retry.tries)
  }

  // ----- pieces of the UI -----
  const acc = (c: 'w' | 'b') => (review.accuracy[c] == null ? '–' : `${Math.round(review.accuracy[c]!)}%`)
  const opp = user === 'w' ? 'b' : 'w'
  const analysing = progress.done < progress.total

  const moveCard = retry ? (
    <div className={`callout retry ${retry.status}`} data-testid="retry" aria-live="polite">
      <p className="small muted">
        Retry · move {Math.floor(retry.moment.retryPly / 2) + 1} · {pos.turn() === 'w' ? 'White' : 'Black'} to move
      </p>
      <p>
        <strong>{retry.message}</strong>
      </p>
      <div className="row wrap">
        {retry.status === 'wrong' && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setRetry({ ...retry, status: 'trying', frame: undefined, message: 'Try again.' })
              setBoardKey((k) => k + 1)
            }}
          >
            Try again
          </button>
        )}
        {(retry.status === 'trying' || retry.status === 'wrong') && (
          <>
            <button type="button" className="small-btn" onClick={retryHint}>
              Hint
            </button>
            <button type="button" className="small-btn" onClick={reveal}>
              Show answer
            </button>
          </>
        )}
        <button type="button" className="small-btn" onClick={() => setRetry(null)}>
          Back to review
        </button>
      </div>
    </div>
  ) : view?.kind === 'line' ? (
    <div className="callout view-bar" data-testid="view-bar">
      <div className="line-moves" aria-live="polite">
        <strong>{view.line.label}</strong>
        <ol>
          {view.line.san.map((s, i) => (
            <li key={i} className={i === view.index - 1 ? 'current' : i < view.index ? 'played' : ''}>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="row">
        <button type="button" onClick={() => setView({ ...view, index: Math.max(0, view.index - 1) })} disabled={view.index === 0} aria-label="Previous move">
          <NavIcon dir="prev" />
        </button>
        <button type="button" className="primary" onClick={() => setView({ ...view, index: Math.min(view.fens.length - 1, view.index + 1) })} disabled={view.index >= view.fens.length - 1} aria-label="Next move">
          Next <NavIcon dir="next" />
        </button>
        <button type="button" onClick={() => setView(null)}>
          Back
        </button>
      </div>
    </div>
  ) : (
    <div className="callout move-card" data-testid="move-card">
      {!current ? (
        <p className="muted small">{cursor === 0 ? 'Start position. Use the arrow buttons or tap the graph to step through the game.' : analysing ? 'Analysing this move…' : ''}</p>
      ) : (
        <>
          <p className="feedback-head">
            <MoveBadge cls={current.cls} label />
            <span className="feedback-move">{moveLabel(current.ply, current.san)}</span>
            <span className="muted small">{isUserMove ? 'you' : opponentLabel(game).toLowerCase()}</span>
            <span className="eval-chip">{formatScore(current.scoreAfter)}</span>
          </p>
          <p className="feedback-text">
            {isUserMove
              ? current.explanation.text
              : isError(current.cls)
                ? `${opponentLabel(game)} played ${current.san}; the engine preferred ${current.bestSan}.`
                : `${opponentLabel(game)} played ${current.san}.`}
          </p>
          {isUserMove && (
            <div className="row wrap">
              {current.explanation.frames[1] && (
                <button type="button" className="small-btn" onClick={() => setView(view?.kind === 'better' ? null : { kind: 'better' })}>
                  {view?.kind === 'better' ? 'Show my move' : current.explanation.frames[1].label}
                </button>
              )}
              {current.explanation.lines[0] && (
                <button
                  type="button"
                  className="small-btn accent"
                  onClick={() => {
                    const l = current.explanation.lines[0]
                    setView({ kind: 'line', line: l, fens: uciLineToSan(l.fen, l.uci).fens, index: 0 })
                  }}
                >
                  Show me why
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  const nav = (
    <div className="review-nav row" role="group" aria-label="Move navigation">
      <button type="button" onClick={() => go(0)} disabled={cursor === 0 || !!retry} aria-label="First move">
        <NavIcon dir="first" />
      </button>
      <button type="button" onClick={() => go(cursor - 1)} disabled={cursor === 0 || !!retry} aria-label="Previous move">
          <NavIcon dir="prev" />
      </button>
      <span className="muted small nav-pos">
        {cursor}/{total}
      </span>
      <button type="button" onClick={() => go(cursor + 1)} disabled={cursor === total || !!retry} aria-label="Next move" data-testid="review-next">
        <NavIcon dir="next" />
      </button>
      <button type="button" onClick={() => go(total)} disabled={cursor === total || !!retry} aria-label="Last move">
        <NavIcon dir="last" />
      </button>
    </div>
  )

  const graph = (
    <EvalGraph series={review.series} moves={review.moves} totalPlies={total} current={cursor} onSelect={go} />
  )

  // Move list rows
  const rows: { n: number; w?: number; b?: number }[] = []
  const firstBlack = game.startFen.split(' ')[1] === 'b'
  game.moves.forEach((_, i) => {
    const idx = i + (firstBlack ? 1 : 0)
    const n = Math.floor(idx / 2) + 1
    if (idx % 2 === 0) rows.push({ n, w: i })
    else if (rows.length && rows[rows.length - 1].n === n) rows[rows.length - 1].b = i
    else rows.push({ n, b: i })
  })
  const cell = (ply?: number) => {
    if (ply == null) return <span className="move" />
    const r = review.moves[ply]
    return (
      <button type="button" className={`move move-btn ${cursor === ply + 1 ? 'selected' : ''}`} onClick={() => go(ply + 1)} data-san={game.moves[ply].san}>
        {game.moves[ply].san}
        {r && <MoveBadge cls={r.cls} />}
      </button>
    )
  }

  return (
    <div className="game-layout review">
      <div className="board-column">
        <div className="row spread review-top">
          <button type="button" className="small-btn" onClick={onBack}>
            ← Back
          </button>
          <span className="muted small">{describeResult(game)}</span>
        </div>
        <div className="board-stage" ref={boardRef}>
          <Board
            fen={board.fen}
            orientation={user === 'w' ? 'white' : 'black'}
            turnColor={pos.turn() === 'w' ? 'white' : 'black'}
            movable={'movable' in board && board.movable ? (board.movable === 'w' ? 'white' : 'black') : undefined}
            dests={'dests' in board ? (board.dests as Map<Key, Key[]>) : undefined}
            lastMove={board.last}
            check={pos.isCheck()}
            shapes={board.shapes as DrawShape[]}
            highlights={board.highlights as SquareClasses}
            resetKey={boardKey}
            onMove={(o, d) => void onRetryMove(o, d)}
          />
        </div>
        {!retry && nav}
        {moveCard}
        {narrow && graph}
      </div>

      <aside className="side-panel">
        <section className="card review-summary" data-testid="review-summary">
          <h2 className="review-title">Game review</h2>
          {analysing && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Analysing the game">
              <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              <span className="small muted">
                Analysing {progress.done}/{progress.total} positions…
              </span>
            </div>
          )}
          {error && <p className="error small">Engine problem: {error}</p>}
          <div className="accuracy-row">
            <div className="accuracy">
              <span className="acc-num" data-testid="accuracy-user">
                {acc(user)}
              </span>
              <span className="small muted">your accuracy</span>
            </div>
            <div className="accuracy">
              <span className="acc-num muted">{acc(opp)}</span>
              <span className="small muted">{opponentLabel(game).toLowerCase()}</span>
            </div>
          </div>
          <ul className="class-counts" aria-label="Your moves by quality">
            {SHOWN_CLASSES.filter((c) => review.counts[user][c] > 0).map((c) => (
              <li key={c}>
                <MoveBadge cls={c} label /> <strong>{review.counts[user][c]}</strong>
              </li>
            ))}
          </ul>
          {opening && (
            <p className="opening small" data-testid="opening">
              <strong>
                {opening.eco} · {opening.name}
              </strong>
              <br />
              {openingSentence(opening)}
            </p>
          )}
        </section>

        {!narrow && <section className="card">{graph}</section>}

        <section className="card key-moments" data-testid="key-moments">
          <h3>Key moments</h3>
          {review.keyMoments.length === 0 ? (
            <p className="muted small">{analysing ? 'Looking for turning points…' : 'No big turning points — a clean game!'}</p>
          ) : (
            <ol>
              {review.keyMoments.map((k) => {
                const tried = game.retries?.filter((r) => r.ply === k.retryPly)
                const solved = tried?.some((r) => r.solved)
                return (
                  <li key={k.ply} className="moment">
                    <p className="feedback-head">
                      <MoveBadge cls={k.cls} />
                      <button
                        type="button"
                        className="link moment-link"
                        onClick={() => {
                          go(k.ply + 1)
                          showBoard()
                        }}
                      >
                        {moveLabel(k.ply, game.moves[k.ply].san)}
                      </button>
                      {k.kind === 'chance' && <span className="small muted">{game.imported ? 'opponent’s slip' : 'coach’s slip'}</span>}
                      {solved && <span className="small solved">✓ solved</span>}
                    </p>
                    <p className="small">{k.text}</p>
                    <button type="button" className="small-btn accent" onClick={() => startRetry(k)}>
                      Retry this position
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="card moves-card">
          <h3 className="sr-only">Moves</h3>
          <ol className="move-list" data-testid="move-list">
            {rows.map((r) => (
              <li key={r.n}>
                <span className="move-n">{r.n}.</span>
                {r.w != null ? cell(r.w) : <span className="move">…</span>}
                {cell(r.b)}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

function openingSentence(o: NonNullable<ReturnType<typeof useReview>['opening']>): string {
  const moves = Math.ceil(o.theoryPlies / 2)
  const stayed = `Known theory for ${moves} move${moves === 1 ? '' : 's'}.`
  if (!o.leftBy || !o.leftSan) return `${stayed} The whole game stayed in the book.`
  return o.leftBy === 'user'
    ? `${stayed} You left the book with ${o.leftSan} on move ${o.leftMoveNumber}.`
    : `${stayed} Your opponent left the book first with ${o.leftSan} on move ${o.leftMoveNumber}.`
}
