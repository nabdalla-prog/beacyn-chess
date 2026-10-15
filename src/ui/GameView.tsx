import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Square } from 'chess.js'
import type { Key } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { PieceIcon } from './icons'
import { levelName } from './labels'
import { formatClock } from '../game/clock'
import { describeResult, parseUserMove, toPgn, userScore, type Color } from '../game/session'
import type { usePlay } from './usePlay'

type Play = ReturnType<typeof usePlay>

const PROMO_PIECES = [
  { role: 'q', name: 'Queen' },
  { role: 'r', name: 'Rook' },
  { role: 'b', name: 'Bishop' },
  { role: 'n', name: 'Knight' },
] as const

export function GameView({ play, onNewGame }: { play: Play; onNewGame: () => void }) {
  const { game, chess } = play
  const [flipped, setFlipped] = useState(false)
  const [moveText, setMoveText] = useState('')
  const [moveError, setMoveError] = useState('')
  const [copied, setCopied] = useState(false)
  const moveListRef = useRef<HTMLOListElement>(null)

  const lastMove = useMemo(() => {
    const u = game?.moves.at(-1)?.uci
    return u ? ([u.slice(0, 2), u.slice(2, 4)] as Key[]) : undefined
  }, [game?.moves])

  useEffect(() => {
    moveListRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' })
  }, [game?.moves.length])

  if (!game || !chess) return null
  const user = game.userColor
  const coach: Color = user === 'w' ? 'b' : 'w'
  const bottom = flipped ? coach : user
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
    play.userMove(mv.from, mv.to, mv.promotion)
    setMoveText('')
    setMoveError('')
  }

  const status = over
    ? describeResult(game)
    : play.engineError
      ? `Engine problem: ${play.engineError}`
      : play.thinking
        ? 'Coach is thinking…'
        : play.userTurn
          ? chess.isCheck()
            ? 'Your move — you are in check!'
            : 'Your move'
          : '…'

  const pairs: { n: number; w?: string; b?: string }[] = []
  const firstBlack = game.startFen.split(' ')[1] === 'b'
  game.moves.forEach((m, i) => {
    const idx = i + (firstBlack ? 1 : 0)
    const n = Math.floor(idx / 2) + 1
    if (idx % 2 === 0) pairs.push({ n, w: m.san })
    else if (pairs.length && pairs[pairs.length - 1].n === n) pairs[pairs.length - 1].b = m.san
    else pairs.push({ n, b: m.san })
  })

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

  return (
    <div className="game-layout">
      <div className="board-column">
        {player(top)}
        <div className="board-stage">
          <Board
            fen={chess.fen()}
            orientation={bottom === 'w' ? 'white' : 'black'}
            turnColor={chess.turn() === 'w' ? 'white' : 'black'}
            movable={play.userTurn && !play.promotion ? (user === 'w' ? 'white' : 'black') : undefined}
            dests={play.dests as Map<Key, Key[]>}
            lastMove={lastMove}
            check={chess.isCheck()}
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
        {player(bottom)}
      </div>

      <aside className="side-panel">
        <div className={`status card ${over ? 'over' : ''}`} role="status" data-testid="status">
          <strong>{status}</strong>
          {over && score != null && (
            <p className="muted">
              {score === 1 ? 'Nice work! ' : score === 0.5 ? 'Solid result. ' : 'Every loss teaches something. '}
              {delta !== 0
                ? `Coach is now ≈${game.ratingAfter} (${delta > 0 ? '+' : ''}${delta}).`
                : `Coach stays at ≈${game.rating}.`}
            </p>
          )}
          {game.takebacks > 0 && <p className="muted small">Takebacks used: {game.takebacks}</p>}
        </div>

        <div className="card moves-card">
          <h3 className="sr-only">Moves</h3>
          {pairs.length === 0 ? (
            <p className="muted small">{play.userTurn ? 'Make your first move on the board.' : 'The coach moves first.'}</p>
          ) : (
            <ol className="move-list" ref={moveListRef} data-testid="move-list">
              {pairs.map((p) => (
                <li key={p.n}>
                  <span className="move-n">{p.n}.</span>
                  <span className="move">{p.w ?? '…'}</span>
                  <span className="move">{p.b ?? ''}</span>
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
      </div>
    </div>
  )
}
