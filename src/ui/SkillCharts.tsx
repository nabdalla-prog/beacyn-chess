import { useState } from 'react'

export interface RadarAxis {
  label: string
  /** 0–100, or null when there isn't enough data yet. */
  value: number | null
}

const R = 100 // radius in SVG units
const RINGS = [25, 50, 75, 100]

/**
 * One-series radar chart. Every axis is labeled with its own value, so no
 * legend is needed; axes without enough data say so instead of plotting a fake 0.
 */
export function RadarChart({ axes, title }: { axes: RadarAxis[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = axes.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (i: number, v: number) => [Math.cos(angle(i)) * (R * v) / 100, Math.sin(angle(i)) * (R * v) / 100] as const
  const known = axes.map((a, i) => ({ ...a, i })).filter((a) => a.value != null)
  const poly = known.map((a) => pt(a.i, a.value!).join(',')).join(' ')
  const complete = known.length === n
  // With gaps, only join neighbouring axes that both have data, so no shape implies missing scores.
  const segments = complete
    ? []
    : axes.flatMap((a, i) => {
        const b = axes[(i + 1) % n]
        return a.value != null && b.value != null ? [[pt(i, a.value), pt((i + 1) % n, b.value)]] : []
      })
  const desc = axes.map((a) => `${a.label} ${a.value ?? 'not enough data'}`).join(', ')

  return (
    <svg className="radar" viewBox="-190 -145 380 295" role="img" aria-label={`${title}: ${desc}`} data-testid="radar">
      {RINGS.map((r) => (
        <polygon key={r} className="radar-ring" points={axes.map((_, i) => pt(i, r).join(',')).join(' ')} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 100)
        return <line key={i} className="radar-spoke" x1={0} y1={0} x2={x} y2={y} />
      })}
      <text className="radar-ring-label" x={3} y={-R / 2 + 3}>
        50
      </text>
      {complete && <polygon className="radar-area" points={poly} />}
      {segments.map(([p1, p2], i) => (
        <line key={i} className="radar-line" x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />
      ))}
      {known.map((a) => {
        const [x, y] = pt(a.i, a.value!)
        return (
          <circle
            key={a.i}
            className={`radar-dot ${hover === a.i ? 'on' : ''}`}
            cx={x}
            cy={y}
            r={hover === a.i ? 6 : 4.5}
            onPointerEnter={() => setHover(a.i)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{`${a.label}: ${a.value}`}</title>
          </circle>
        )
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 122)
        const anchor = Math.abs(x) < 8 ? 'middle' : x > 0 ? 'start' : 'end'
        return (
          <g key={i} className={`radar-label ${hover === i ? 'on' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            {nameLines(a.label).map((line, k, all) => (
              <text key={k} x={x} y={y - 2 - (all.length - 1 - k) * 12} textAnchor={anchor} className="radar-name">
                {line}
              </text>
            ))}
            <text x={x} y={y + 12} textAnchor={anchor} className={`radar-value ${a.value == null ? 'none' : ''}`}>
              {a.value ?? 'no data yet'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Long axis names go on two lines so they fit at phone width. */
function nameLines(label: string): string[] {
  if (label.length <= 10 || !label.includes(' ')) return [label]
  const i = label.indexOf(' ')
  return [label.slice(0, i), label.slice(i + 1)]
}

/** Tiny trend line for one skill (small multiple): score after each game. */
export function Sparkline({ points, label }: { points: { at: number; score: number }[]; label: string }) {
  const W = 120
  const H = 36
  if (points.length < 2) return <span className="small muted">{points.length ? `${points[0].score}` : '—'}</span>
  const xs = points.map((_, i) => 2 + (i / (points.length - 1)) * (W - 4))
  const ys = points.map((p) => 2 + (1 - p.score / 100) * (H - 4))
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join('')
  const first = points[0].score
  const last = points[points.length - 1].score
  const change = last - first
  return (
    <span className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}: from ${first} to ${last} over ${points.length} games`}>
        <line className="spark-mid" x1={0} x2={W} y1={H / 2} y2={H / 2} />
        <path className="spark-line" d={d} />
        <circle className="spark-end" cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} />
      </svg>
      <span className={`spark-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
        {change > 0 ? '▲' : change < 0 ? '▼' : '='} {Math.abs(change)}
      </span>
    </span>
  )
}
