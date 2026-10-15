import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'
import type { DrawBrushes, DrawShape } from '@lichess-org/chessground/draw'
import type { Key, Color as CgColor, SquareClasses } from '@lichess-org/chessground/types'
import { read as readFen } from '@lichess-org/chessground/fen'
import { moveSound, playSound } from './sound'
import { stepSquare } from './boardKeys'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'

export interface BoardProps {
  fen: string
  orientation: CgColor
  turnColor: CgColor
  /** Which side the user may move; undefined = view only. */
  movable?: CgColor
  dests?: Map<Key, Key[]>
  lastMove?: Key[]
  check?: boolean
  shapes?: DrawShape[]
  highlights?: SquareClasses
  onMove?: (orig: Key, dest: Key) => void
  /** Change to force the board back in sync with `fen` (e.g. after a rejected move). */
  resetKey?: number
  /** Called when any square is tapped (used by the visualization drills). */
  onSelect?: (key: Key) => void
  /** Show a–h / 1–8 labels (default true). */
  coordinates?: boolean
  /** Say square names to screen readers while moving the keyboard cursor (off for "name the square" drills). */
  announceSquares?: boolean
  /** Accessible name, e.g. "Puzzle board". */
  label?: string
}

const COLOR_WORD = { white: 'white', black: 'black' } as const
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches



// Coach arrow colors (Okabe–Ito palette, distinguishable with color-vision deficiency).
const BRUSHES = {
  best: { key: 'cb', color: '#0072b2', opacity: 0.9, lineWidth: 12 },
  threat: { key: 'ct', color: '#d55e00', opacity: 0.9, lineWidth: 12 },
  good: { key: 'cg', color: '#009e73', opacity: 0.85, lineWidth: 10 },
  bad: { key: 'cx', color: '#e69f00', opacity: 0.9, lineWidth: 12 },
  hint: { key: 'ch', color: '#cc79a7', opacity: 0.9, lineWidth: 12 },
}

export function Board(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMove = useRef(props.onMove)
  const onSelect = useRef(props.onSelect)
  // Keyboard cursor: shown only after the board gets keyboard focus.
  const [cursor, setCursor] = useState<Key | null>(null)
  const [said, setSaid] = useState('')
  const interactive = !!props.movable || !!props.onSelect
  useLayoutEffect(() => {
    onMove.current = props.onMove
    onSelect.current = props.onSelect
  })

  useEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      animation: { duration: reducedMotion() ? 0 : 220 },
      premovable: { enabled: false },
      drawable: { enabled: true, eraseOnMovablePieceClick: true, brushes: BRUSHES as unknown as DrawBrushes },
      movable: { free: false, showDests: true, events: { after: (o, d) => onMove.current?.(o, d) } },
      events: { select: (k) => onSelect.current?.(k) },
      // Coordinates are drawn once, when the board is created.
      coordinates: props.coordinates ?? true,
    })
    return () => {
      api.current?.destroy()
      api.current = null
    }
    // Created once; later prop changes go through api.set below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new last move on a new position makes a sound (works for every board: play, puzzles, lessons, review).
  const prev = useRef<{ fen: string; last?: string } | null>(null)
  useEffect(() => {
    const last = props.lastMove?.join('')
    const p = prev.current
    if (p && props.lastMove?.length === 2 && last !== p.last && props.fen !== p.fen) {
      const s = moveSound(readFen(p.fen), props.lastMove[0], props.lastMove[1], !!props.check)
      if (s) playSound(s)
    }
    prev.current = { fen: props.fen, last }
  }, [props.fen, props.lastMove, props.check])

  useEffect(() => {
    const config: Config = {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      lastMove: props.lastMove,
      check: props.check ? props.turnColor : false,
      viewOnly: false,
      highlight: { lastMove: true, check: true, custom: withCursor(props.highlights, cursor) },
      movable: {
        color: props.movable,
        dests: props.movable ? (props.dests ?? new Map()) : new Map(),
      },
    }
    api.current?.set(config)
    api.current?.setAutoShapes(props.shapes ?? [])
    // The cursor has its own effect below, so moving it never re-sends the position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.movable, props.dests, props.lastMove, props.check, props.shapes, props.highlights, props.resetKey])

  useEffect(() => {
    api.current?.set({ highlight: { custom: withCursor(props.highlights, cursor) } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor])

  const describe = (key: Key): string => {
    const state = api.current?.state
    if (!state) return ''
    const parts: string[] = []
    if (props.announceSquares !== false) {
      const p = state.pieces.get(key)
      parts.push(p ? `${key}, ${COLOR_WORD[p.color]} ${p.role}` : `${key}, empty`)
    }
    if (state.selected === key) parts.push('selected')
    else if (state.selected && state.movable.dests?.get(state.selected)?.includes(key)) parts.push('you can move here')
    return parts.join(', ')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const a = api.current
    if (!a) return
    const start = (a.state.selected ?? (props.movable === 'black' ? 'e7' : 'e2')) as Key
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = cursor ? stepSquare(cursor, e.key, props.orientation) : start
      setCursor(next)
      setSaid(describe(next))
    } else if ((e.key === 'Enter' || e.key === ' ') && cursor) {
      e.preventDefault()
      const before = a.state.selected
      a.selectSquare(cursor)
      const after = a.state.selected
      if (props.onSelect && !props.movable) return // the drill gives its own feedback
      if (after === cursor && after !== before) {
        const n = a.state.movable.dests?.get(cursor)?.length ?? 0
        setSaid(`${describe(cursor)}. ${n} ${n === 1 ? 'move' : 'moves'}. Choose a square and press Enter.`)
      } else if (!after && before && before !== cursor) {
        setSaid('') // a move was made; the page announces it
      } else if (!after) setSaid(props.announceSquares === false ? 'Nothing to move there.' : `${describe(cursor)}. Nothing of yours to move there.`)
    } else if (e.key === 'Escape' && a.state.selected) {
      e.preventDefault()
      a.selectSquare(null)
      setSaid('Selection cleared.')
    }
  }

  const hint = props.movable
    ? 'Arrow keys choose a square, Enter picks up a piece and Enter again puts it down. You can also type moves.'
    : props.onSelect
      ? 'Arrow keys choose a square, Enter picks it.'
      : 'View only.'

  return (
    <div
      className="board-wrap"
      role={interactive ? 'application' : 'img'}
      aria-roledescription="chessboard"
      aria-label={`${props.label ?? 'Chessboard'}. ${hint}`}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onFocus={(e) => {
        if (interactive && !cursor && e.currentTarget.matches(':focus-visible')) setCursor((api.current?.state.selected ?? (props.movable === 'black' ? 'e7' : 'e2')) as Key)
      }}
      onBlur={() => setCursor(null)}
      onPointerDown={() => setCursor(null)}
    >
      <div ref={el} className="cg-host" aria-hidden="true" />
      {interactive && (
        <div className="sr-only" aria-live="polite">
          {said}
        </div>
      )}
    </div>
  )
}

function withCursor(highlights: SquareClasses | undefined, cursor: Key | null): SquareClasses {
  const m = new Map(highlights ?? [])
  if (cursor) m.set(cursor, `${m.get(cursor) ?? ''} kb-cursor`.trim())
  return m
}
