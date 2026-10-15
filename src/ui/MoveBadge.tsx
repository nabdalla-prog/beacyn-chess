import { CLASS_INFO, type MoveClass } from '../coach/classify'

/** Move-quality badge: color is always paired with a symbol and (optionally) a label. */
export function MoveBadge({ cls, label = false }: { cls: MoveClass; label?: boolean }) {
  const info = CLASS_INFO[cls]
  return (
    <span className={`badge q-${cls}`} title={info.label}>
      <span className="badge-icon" aria-hidden="true">
        {info.symbol === 'best' ? <Star /> : info.symbol === 'good' ? <Check /> : info.symbol}
      </span>
      {label ? <span className="badge-label">{info.label}</span> : <span className="sr-only">{info.label}</span>}
    </span>
  )
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" width="0.9em" height="0.9em" fill="currentColor">
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="0.9em" height="0.9em" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  )
}
