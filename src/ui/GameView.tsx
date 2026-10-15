import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Chess, type Square } from 'chess.js'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key, SquareClasses } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { PieceIcon } from './icons'
import { levelName } from './labels'
import { MoveBadge } from './MoveBadge'
import { CoachPanel } from './CoachPanel'
import { EvalBar } from './EvalBar'
import { formatClock } from '../game/clock'
import { describeResult, parseUserMove, toPgn, userScore, type Color } from '../game/session'
import type { Frame } from '../coach/explain'
import type { usePlay } from './usePlay'
import type { useCoach } from './useCoach'

type Play = ReturnType<typeof usePlay>
type Coach = ReturnType<typeof useCoach>

const PROMO_PIECES = [
  { role: 'q', name: 'Queen' },
  { role: 'r', name: 'Rook' },
  { role: 'b', name: 'Bishop' },
  { role: 'n', name: 'Knight' },
] as const

function frameShapes(frame: Frame): DrawShape[] {
  return frame.arrows.map((a) => ({ orig: a.orig, dest: a.dest, brush: a.brush }))
}

function frameHighlights(frame: Frame): SquareClasses {
  return new Map(frame.highlights.map((h) => [h.square as Key, `cc-${h.kind}`]))
}

const pair = (uci: string | undefined): Key[] | undefined => (uci ? [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key] : undefined)

export function GameView({ play, coach, onNewGame }: { play: Play; coach: Coach; onNewGame: () => void }) {
  const { game, chess } = play
  const [flipped, setFlipped] = useState(false)
  const [moveText, setMoveText] = useState('')
  const [moveError, setMoveError] = useState('')
  const [copied, setCopied] = useState(false)
  // A move picked in the move list; forgotten as soon as another move is played.
  const [selected, setSelected] = useState<{ ply: number; at: number } | null>(null)
  const selectedPly = selected && selected.at === game?.moves.length ? selected.ply : null
  const moveListRef = useRef<HTMLOListElement>(null)

  const lastMove = useMemo(() => pair(game?.moves.at(-1)?.uci), [game?.moves])

  useEffect(() => {
    moveListRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [game?.moves.length])

  // Arrow keys step through a line being shown.
  const lineView = coach.view?.kind === 'line'
  const { stepLine, closeView } = coach
  useEffect(() => {
    if (!lineView) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') stepLine(1)
      else if (e.key === 'ArrowLeft') stepLine(-1)
      else if (e.key === 'Escape') closeView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lineView, stepLine, closeView])

  // What the board shows: a warning, an explanation view, or the live game (with any hint drawn on it).
  const board = useMemo(() => {
    if (!chess || !game) return null
    const liveFen = chess.fen()
    let fen = liveFen
    let shapes: DrawShape[] = []
    let highlights: SquareClasses = new Map()
    let last = lastMove
    let interactive = true
    let caption: string | null = null
    const view = coach.warning ? ({ kind: 'frame', frame: coach.warning.warning.frame } as const) : coach.view
    if (view?.kind === 'frame') {
      fen = view.frame.fen
      shapes = frameShapes(view.frame)
      highlights = frameHighlights(view.frame)
      last = view.frame.lastMove as Key[] | undefined
      interactive = false
      caption = coach.warning ? null : view.frame.label
    } else if (view?.kind === 'line') {
      fen = view.fens[view.index]
      const next = view.line.uci[view.index]
      const moverIsUser = fen.split(' ')[1] === game.userColor
      if (next) shapes = [{ orig: next.slice(0, 2) as Key, dest: next.slice(2, 4) as Key, brush: moverIsUser ? 'best' : 'threat' }]
      last = view.index > 0 ? pair(view.line.uci[view.index - 1]) : undefined
      interactive = false
    } else if (coach.hint && coach.hint.frame.fen === liveFen) {
      shapes = frameShapes(coach.hint.frame)
      highlights = frameHighlights(coach.hint.frame)
    }
    const pos = new Chess(fen)
    return { fen, shapes, highlights, last, interactive, caption, check: pos.isCheck(), turn: pos.turn() }
  }, [chess, game, lastMove, coach.warning, coach.view, coach.hint])

  if (!game || !chess || !board) return null
  const user = game.userColor
  const coachColor: Color = user === 'w' ? 'b' : 'w'
  const bottom = flipped ? coachColor : user
  const top = bottom === 'w' ? 'b' : 'w'
  const over = !!game.result

  const submitMove = (e: FormEvent) => {
    e.preventDefault()
    if (!play.userTurn) {
      setMoveError('Wait for the coach to move.')
      return
    }
    const mv = parseUserMove(chess, moveText)
    if (!mv) {
      setMoveError(`"${moveText}" isn't a legal move here. Try e.g. ${chess.moves()[0]}.`)
      return
    }
    coach.closeView()
    play.userMove(mv.from, mv.to, mv.promotion)
    setMoveText('')
    setMoveError('')
  }

  const status = over
    ? describeResult(game)
    : play.engineError
      ? `Engine problem: ${play.engineError}`
      : play.checking
        ? 'Coach is checking your move…'
        : coach.warning
          ? 'Take another look'
          : play.thinking
            ? 'Coach is thinking…'
            : play.userTurn
              ? chess.isCheck()
                ? 'Your move — you are in check!'
                : 'Your move'
              : '…'

  const showBadges = coach.live || over
  const pairs: { n: number; w?: number; b?: number }[] = []
  const firstBlack = game.startFen.split(' ')[1] === 'b'
  game.moves.forEach((_, i) => {
    const idx = i + (firstBlack ? 1 : 0)
    const n = Math.floor(idx / 2) + 1
    if (idx % 2 === 0) pairs.push({ n, w: i })
    else if (pairs.length && pairs[pairs.length - 1].n === n) pairs[pairs.length - 1].b = i
    else pairs.push({ n, b: i })
  })

  const moveCell = (ply: number | undefined) => {
    if (ply == null) return <span className="move" />
    const m = game.moves[ply]
    const cls = showBadges ? m.review?.cls : undefined
    const fb = coach.feedback[ply]
    const content = (
      <>
        {m.san}
        {cls && <MoveBadge cls={cls} />}
      </>
    )
    return fb ? (
      <button
        type="button"
        className={`move move-btn ${selectedPly === ply ? 'selected' : ''}`}
        data-san={m.san}
        onClick={() => {
          setSelected({ ply, at: game.moves.length })
          coach.showFrame(fb.frames[0])
        }}
        aria-label={`${m.san}, ${fb.cls}. Show explanation`}
      >
        {content}
      </button>
    ) : (
      <span className="move" data-san={m.san}>
        {content}
      </span>
    )
  }

  const player = (color: Color) => {
    const isUser = color === user
    const t = play.clocks?.[color]
    return (
      <div className={`player-bar ${play.turn === color && !over ? 'to-move' : ''}`}>
        <span className={`side-dot side-${color}`} aria-hidden="true" />
        <span className="player-name">{isUser ? 'You' : `Coach ≈${game.rating}`}</span>
        {!isUser && <span className="muted small">{levelName(game.rating)}</span>}
        {t != null && (
          <span
            className={`clock ${play.clocks?.running === color ? 'running' : ''} ${t < 20000 ? 'low' : ''}`}
            aria-label={`${isUser ? 'Your' : 'Coach'} clock ${formatClock(t)}`}
          >
            {formatClock(t)}
          </span>
        )}
      </div>
    )
  }

  const score = userScore(game)
  const delta = game.ratingAfter != null ? game.ratingAfter - game.rating : 0
  const movable = board.interactive && play.userTurn && !play.promotion && !play.checking ? (user === 'w' ? 'white' : 'black') : undefined
  const view = coach.view

  return (
    <div className="game-layout">
      <div className="board-column">
        {player(top)}
        {coach.live && <EvalBar score={coach.evalWhite} orientation={bottom} />}
        <div className="board-stage">
          <Board
            fen={board.fen}
            orientation={bottom === 'w' ? 'white' : 'black'}
            turnColor={board.turn === 'w' ? 'white' : 'black'}
            movable={movable}
            dests={play.dests as Map<Key, Key[]>}
            lastMove={board.last}
            check={board.check}
            shapes={board.shapes}
            highlights={board.highlights}
            resetKey={play.boardKey}
            onMove={(o, d) => play.userMove(o as Square, d as Square)}
          />
          {play.promotion && (
            <div className="promo" role="dialog" aria-label="Choose promotion piece">
              <p>Promote to</p>
              <div className="promo-choices">
                {PROMO_PIECES.map((p) => (
                  <button
                    key={p.role}
                    type="button"
                    autoFocus={p.role === 'q'}
                    aria-label={p.name}
                    onClick={() => play.userMove(play.promotion!.from, play.promotion!.to, p.role)}
                  >
                    <PieceIcon role={p.role} color={user} />
                    <small>{p.name}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="link" onClick={play.cancelPromotion}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {coach.warning && (
          <div className="callout warning" role="alertdialog" aria-labelledby="warn-text" data-testid="warning">
            <p id="warn-text">
              <strong>{coach.warning.warning.text}</strong>
            </p>
            <p className="small muted">The orange-red arrow shows the danger.</p>
            <div className="row">
              <button type="button" className="primary" autoFocus onClick={coach.dismissWarning}>
                Pick another move
              </button>
              <button type="button" onClick={coach.playAnyway}>
                Play it anyway
              </button>
            </div>
          </div>
        )}

        {!coach.warning && view && (
          <div className="callout view-bar" data-testid="view-bar">
            {view.kind === 'line' ? (
              <>
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
                  <button type="button" onClick={() => coach.stepLine(-1)} disabled={view.index === 0} aria-label="Previous move">
                    ◀
                  </button>
                  <button type="button" className="primary" onClick={() => coach.stepLine(1)} disabled={view.index >= view.fens.length - 1} aria-label="Next move">
                    Next ▶
                  </button>
                  <button type="button" onClick={coach.closeView}>
                    Back to game
                  </button>
                </div>
              </>
            ) : (
              <div className="row spread">
                <span>
                  Showing: <strong>{board.caption}</strong>
                </span>
                <button type="button" onClick={coach.closeView}>
                  Back to game
                </button>
              </div>
            )}
          </div>
        )}
        {player(bottom)}
      </div>

      <aside className="side-panel">
        <div className={`status card ${over ? 'over' : ''}`} role="status" data-testid="status">
          <strong>{status}</strong>
          {over && score != null && (
            <p className="muted">
              {score === 1 ? 'Nice work! ' : score === 0.5 ? 'Solid result. ' : 'Every loss teaches something. '}
              {delta !== 0 ? `Coach is now ≈${game.ratingAfter} (${delta > 0 ? '+' : ''}${delta}).` : `Coach stays at ≈${game.rating}.`}
            </p>
          )}
          {game.takebacks > 0 && <p className="muted small">Takebacks used: {game.takebacks}</p>}
        </div>

        <CoachPanel play={play} coach={coach} selectedPly={selectedPly} />

        <div className="card moves-card">
          <h3 className="sr-only">Moves</h3>
          {pairs.length === 0 ? (
            <p className="muted small">{play.userTurn ? 'Make your first move on the board.' : 'The coach moves first.'}</p>
          ) : (
            <ol className="move-list" ref={moveListRef} data-testid="move-list">
              {pairs.map((p) => (
                <li key={p.n}>
                  <span className="move-n">{p.n}.</span>
                  {p.w != null ? moveCell(p.w) : <span className="move">…</span>}
                  {moveCell(p.b)}
                </li>
              ))}
            </ol>
          )}
        </div>

        {!over && (
          <form className="move-input" onSubmit={submitMove}>
            <label htmlFor="move-text">Type a move</label>
            <div className="row">
              <input
                id="move-text"
                value={moveText}
                onChange={(e) => setMoveText(e.target.value)}
                placeholder="e4, Nf3, O-O"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-describedby={moveError ? 'move-error' : undefined}
              />
              <button type="submit">Play</button>
            </div>
            {moveError && (
              <p id="move-error" className="error small" role="alert">
                {moveError}
              </p>
            )}
          </form>
        )}

        <div className="controls">
          {!over ? (
            <>
              <button type="button" onClick={play.takeback} disabled={!play.canTakeback}>
                ↶ Take back
              </button>
              <button type="button" onClick={() => setFlipped((f) => !f)}>
                ⇅ Flip
              </button>
              <button type="button" className="danger" onClick={play.resign}>
                Resign
              </button>
            </>
          ) : (
            <>
              <button type="button" className="primary" onClick={onNewGame}>
                New game
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(toPgn(game)).then(() => setCopied(true))
                }}
              >
                {copied ? 'PGN copied ✓' : 'Copy PGN'}
              </button>
              <button type="button" onClick={() => setFlipped((f) => !f)}>
                ⇅ Flip
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="sr-only" aria-live="polite">
        {play.announcement}
        {coach.latest && !coach.pendingFeedback ? ` ${coach.latest.san}: ${coach.latest.cls}. ${coach.latest.text}` : ''}
        {coach.warning ? ` ${coach.warning.warning.text}` : ''}
      </div>
    </div>
  )
}
