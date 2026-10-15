import { useState } from 'react'
import { MAX_RATING, MIN_RATING } from '../engine/strength'
import { TIME_CONTROLS, type Color } from '../game/session'
import type { Profile, Settings } from '../storage/db'
import { levelName } from './labels'

interface Props {
  profile: Profile
  settings: Settings
  onSettings: (s: Settings) => void
  onStart: (opts: { userColor: Color; rating: number; timeControlIndex: number }) => void
}

export function NewGamePanel({ profile, settings, onSettings, onStart }: Props) {
  const [rating, setRating] = useState(profile.rating)
  const sides: { label: string; value: Settings['userColor'] }[] = [
    { label: 'White', value: 'w' },
    { label: 'Random', value: 'random' },
    { label: 'Black', value: 'b' },
  ]

  const start = () => {
    const userColor: Color = settings.userColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.userColor
    onStart({ userColor, rating, timeControlIndex: settings.timeControl })
  }

  return (
    <section className="card new-game" aria-labelledby="new-game-title">
      <h2 id="new-game-title">Play the coach</h2>
      <p className="muted">
        {profile.gamesPlayed === 0
          ? 'Pick a level to start. The coach adjusts after every game so you win about half the time.'
          : `Your estimated rating: ≈${profile.rating} · ${profile.gamesPlayed} game${profile.gamesPlayed === 1 ? '' : 's'} played`}
      </p>

      <fieldset className="field">
        <legend>You play</legend>
        <div className="segmented" role="radiogroup" aria-label="You play">
          {sides.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={settings.userColor === s.value}
              className={settings.userColor === s.value ? 'on' : ''}
              onClick={() => onSettings({ ...settings, userColor: s.value })}
            >
              <span className={`side-dot side-${s.value}`} aria-hidden="true" />
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="strength">
          Coach strength <strong>≈{rating}</strong> <span className="muted">· {levelName(rating)}</span>
        </label>
        <input
          id="strength"
          type="range"
          min={MIN_RATING}
          max={MAX_RATING}
          step={50}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          aria-valuetext={`about ${rating}, ${levelName(rating)}`}
        />
        <div className="range-ends muted" aria-hidden="true">
          <span>{MIN_RATING}</span>
          <span>{MAX_RATING}</span>
        </div>
      </div>

      <fieldset className="field">
        <legend>Time</legend>
        <div className="segmented" role="radiogroup" aria-label="Time control">
          {TIME_CONTROLS.map((tc, i) => (
            <button
              key={tc.label}
              type="button"
              role="radio"
              aria-checked={settings.timeControl === i}
              className={settings.timeControl === i ? 'on' : ''}
              onClick={() => onSettings({ ...settings, timeControl: i })}
            >
              {tc.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="check">
        <input
          type="checkbox"
          checked={settings.adaptive}
          onChange={(e) => onSettings({ ...settings, adaptive: e.target.checked })}
        />
        Adjust strength after each game
      </label>

      <button type="button" className="primary big" onClick={start}>
        Start game
      </button>
    </section>
  )
}
