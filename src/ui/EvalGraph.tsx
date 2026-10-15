import { useRef, useState, type PointerEvent } from 'react'
import { CLASS_INFO, type MoveClass } from '../coach/classify'
import { formatScore, type Score } from '../engine/uci'
import type { ReviewedMove } from '../coach/review'

const W = 600
const H = 150
const PAD = 6
const MARKED: MoveClass[] = ['mistake', 'blunder', 'missed-win', 'brilliant']

interface Props {
  /** White's expected score per position (index = ply). */
  series: { ply: number; white: number; score: Score }[]
  moves: ReviewedMove[]
  /** Total plies in the game, so the x-axis is stable while analysis fills in. */
  totalPlies: number
  current: number
  onSelect: (ply: number) => void
}

/**
 * One series: White's winning chances (0–100) after each move. The light area is
 * White's share, the dark area Black's. Markers flag big moments; the move list
 * and the arrow buttons give the same navigation without a pointer.
 */
export function EvalGraph({ series, moves, totalPlies, current, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const n = Math.max(1, totalPlies)
  const x = (ply: number) => PAD + (ply / n) * (W - 2 * PAD)
  const y = (white: number) => PAD + (1 - white / 100) * (H - 2 * PAD)

  const pts = series.map((p) => `${x(p.ply).toFixed(1)},${y(p.white).toFixed(1)}`)
  const line = pts.length ? `M${pts.join('L')}` : ''
  const area = pts.length ? `M${x(series[0].ply)},${H - PAD}L${pts.join('L')}L${x(series[series.length - 1].ply)},${H - PAD}Z` : ''

  const plyAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const ply = Math.round(((px - PAD) / (W - 2 * PAD)) * n)
    return Math.max(0, Math.min(series.length ? series[series.length - 1].ply : 0, ply))
  }

  const shown = hover ?? null
  const point = shown != null ? series[shown] : null
  const move = shown != null && shown > 0 ? moves[shown - 1] : null
  const markers = moves.filter((m) => MARKED.includes(m.cls))
  const summary = summarize(series)

  return (
    <figure className="eval-graph" data-testid="eval-graph">
      <figcaption className="small muted">White’s winning chances, move by move · tap to jump</figcaption>
      <div className="eval-graph-wrap">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
          onPointerMove={(e) => setHover(plyAt(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => onSelect(plyAt(e))}
        >
          <rect className="eg-black" x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} rx="4" />
          {area && <path className="eg-white" d={area} />}
          <line className="eg-mid" x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} />
          {line && <path className="eg-line" d={line} vectorEffect="non-scaling-stroke" />}
          <line className="eg-cursor" x1={x(current)} x2={x(current)} y1={PAD} y2={H - PAD} vectorEffect="non-scaling-stroke" />
          {shown != null && <line className="eg-hover" x1={x(shown)} x2={x(shown)} y1={PAD} y2={H - PAD} vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* Markers as HTML so they stay round when the SVG stretches. */}
        {markers.map((m) => (
          <span
            key={m.ply}
            className={`eg-marker q-${m.cls}`}
            style={{ left: `${(x(m.ply + 1) / W) * 100}%`, top: `${(y(m.whiteAfter) / H) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {point && (
          <div className="eg-tip" style={{ left: `${Math.min(80, Math.max(20, (x(point.ply) / W) * 100))}%` }}>
            {move ? (
              <>
                <strong>
                  {Math.floor(move.ply / 2) + 1}
                  {move.color === 'w' ? '.' : '…'} {move.san}
                </strong>{' '}
                <span className="muted">{CLASS_INFO[move.cls].label}</span>
              </>
            ) : (
              <strong>Start</strong>
            )}{' '}
            · {formatScore(point.score)}
          </div>
        )}
      </div>
    </figure>
  )
}

function summarize(series: Props['series']): string {
  if (series.length < 2) return 'Evaluation graph: analysis in progress.'
  let best = series[0]
  let worst = series[0]
  for (const p of series) {
    if (p.white > best.white) best = p
    if (p.white < worst.white) worst = p
  }
  const end = series[series.length - 1]
  return `Evaluation graph. White's chances peaked at ${Math.round(best.white)}% (ply ${best.ply}), lowest ${Math.round(worst.white)}% (ply ${worst.ply}), ending at ${Math.round(end.white)}%.`
}
