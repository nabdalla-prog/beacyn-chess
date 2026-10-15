import { useProgress } from './useProgress'

const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function ProgressView() {
  const p = useProgress(true)
  if (!p) return <p className="muted center">Loading…</p>
  const { streak, badges, fresh } = p
  const earned = badges.filter((b) => b.earned)
  const next = badges.filter((b) => !b.earned)
  return (
    <div className="progress-page">
      <h2>Your progress</h2>
      {fresh.length > 0 && (
        <p className="callout celebrate" role="status" data-testid="new-badges">
          New: <strong>{fresh.map((b) => b.name).join(', ')}</strong> — well done!
        </p>
      )}
      <section className="card streak-card" aria-labelledby="streak-title" data-testid="streak">
        <h3 id="streak-title">Day streak</h3>
        <p className="streak-num">
          <span aria-hidden="true">🔥</span> {streak.days} day{streak.days === 1 ? '' : 's'}
        </p>
        <p className="small muted">
          {streak.days === 0
            ? 'Play a game or do a few puzzles to start a streak.'
            : streak.activeToday
              ? 'Today counts already. See you tomorrow!'
              : 'Practise today to keep it going.'}{' '}
          Missing one day freezes your streak instead of resetting it.
          {streak.frozen > 0 && ` (${streak.frozen} day${streak.frozen === 1 ? '' : 's'} frozen so far.)`} Best: {streak.best}.
        </p>
      </section>

      <section className="card" aria-labelledby="earned-title">
        <h3 id="earned-title">
          Badges earned · {earned.length} of {badges.length}
        </h3>
        {earned.length === 0 ? (
          <p className="small muted">Your first badge is one game away.</p>
        ) : (
          <ul className="badge-grid" data-testid="badges-earned">
            {earned.map((b) => (
              <li key={b.id} className="badge-tile earned">
                <span className="badge-emoji" aria-hidden="true">
                  {b.icon}
                </span>
                <strong>{b.name}</strong>
                <span className="small muted">{b.at ? fmt(b.at) : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="next-title">
        <h3 id="next-title">Up next</h3>
        <ul className="badge-grid">
          {next.map((b) => (
            <li key={b.id} className="badge-tile">
              <span className="badge-emoji dim" aria-hidden="true">
                {b.icon}
              </span>
              <strong>{b.name}</strong>
              <span className="small muted">{b.how}</span>
              {b.progress && b.progress.have > 0 && (
                <span className="small">
                  <progress value={b.progress.have} max={b.progress.need} aria-label={`${b.name} progress`} /> {b.progress.have}/{b.progress.need}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** Small card on the home screen: streak, badge count and any new badge. */
export function ProgressCard() {
  const p = useProgress(false)
  if (!p) return null
  const earned = p.badges.filter((b) => b.earned).length
  if (p.streak.days === 0 && earned === 0) return null
  return (
    <a className="card progress-card" href="#/progress" data-testid="progress-card">
      <span>
        <span aria-hidden="true">🔥 </span>
        {p.streak.days}-day streak · {earned} badge{earned === 1 ? '' : 's'}
      </span>
      {p.fresh.length > 0 && <span className="small">New: {p.fresh.map((b) => b.name).join(', ')} 🎉</span>}
      <span className="small muted">See progress →</span>
    </a>
  )
}
