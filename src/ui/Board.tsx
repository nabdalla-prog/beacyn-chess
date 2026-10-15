import { useEffect, useLayoutEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'
import type { DrawBrushes, DrawShape } from '@lichess-org/chessground/draw'
import type { Key, Color as CgColor, SquareClasses } from '@lichess-org/chessground/types'
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
}

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
  useLayoutEffect(() => {
    onMove.current = props.onMove
    onSelect.current = props.onSelect
  })

  useEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      animation: { duration: 220 },
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

  useEffect(() => {
    const config: Config = {
      fen: props.fen,
      orientation: props.orientation,
      turnColor: props.turnColor,
      lastMove: props.lastMove,
      check: props.check ? props.turnColor : false,
      viewOnly: false,
      highlight: { lastMove: true, check: true, custom: props.highlights ?? new Map() },
      movable: {
        color: props.movable,
        dests: props.movable ? (props.dests ?? new Map()) : new Map(),
      },
    }
    api.current?.set(config)
    api.current?.setAutoShapes(props.shapes ?? [])
  }, [props.fen, props.orientation, props.turnColor, props.movable, props.dests, props.lastMove, props.check, props.shapes, props.highlights, props.resetKey])

  return (
    // The visual board is mouse/touch only; keyboard and screen-reader users get the
    // move input and live move announcements next to it.
    <div className="board-wrap" aria-hidden="true">
      <div ref={el} className="cg-host" />
    </div>
  )
}
