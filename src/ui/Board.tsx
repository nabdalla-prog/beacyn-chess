import { useEffect, useLayoutEffect, useRef } from 'react'
import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'
import type { DrawShape } from '@lichess-org/chessground/draw'
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
}

export function Board(props: BoardProps) {
  const el = useRef<HTMLDivElement>(null)
  const api = useRef<Api | null>(null)
  const onMove = useRef(props.onMove)
  useLayoutEffect(() => {
    onMove.current = props.onMove
  })

  useEffect(() => {
    if (!el.current) return
    api.current = Chessground(el.current, {
      animation: { duration: 220 },
      premovable: { enabled: false },
      drawable: { enabled: true, eraseOnMovablePieceClick: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => onMove.current?.(o, d) } },
    })
    return () => {
      api.current?.destroy()
      api.current = null
    }
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
  }, [props.fen, props.orientation, props.turnColor, props.movable, props.dests, props.lastMove, props.check, props.shapes, props.highlights])

  return (
    // The visual board is mouse/touch only; keyboard and screen-reader users get the
    // move input and live move announcements next to it.
    <div className="board-wrap" aria-hidden="true">
      <div ref={el} className="cg-host" />
    </div>
  )
}
