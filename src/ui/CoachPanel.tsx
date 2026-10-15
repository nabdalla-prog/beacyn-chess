import { MoveBadge } from './MoveBadge'
import type { CoachMode } from '../game/session'
import type { usePlay } from './usePlay'
import type { useCoach } from './useCoach'

type Play = ReturnType<typeof usePlay>
type Coach = ReturnType<typeof useCoach>

const MODES: { value: CoachMode; label: string; help: string }[] = [
  { value: 'silent', label: 'Silent', help: 'The coach stays quiet during the game.' },
  { value: 'hints', label: 'Hints', help: 'Feedback after each move, hints when you ask.' },
  { value: 'guided', label: 'Guided', help: 'Feedback, hints, and a warning before a blunder.' },
]

const HINT_STEPS = ['Where to look', 'Which piece', 'The move', 'Why it works']

export function CoachPanel({ play, coach, selectedPly }: { play: Play; coach: Coach; selectedPly: number | null }) {
  const { settings, setSettings, game } = play
  const over = !!game?.result
  const fb = selectedPly != null ? coach.feedback[selectedPly] : coach.latest
  const hintLevel = coach.hint?.level ?? 0
  const canHint = coach.live && play.userTurn && !over && !coach.warning && hintLevel < 4

  return (
    <section className="card coach-card" aria-labelledby="coach-title" data-testid="coach">
      <div className="coach-head">
        <h3 id="coach-title">Coach</h3>
        <div className="segmented small-seg" role="radiogroup" aria-label="Coaching mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={settings.coachMode === m.value}
              className={settings.coachMode === m.value ? 'on' : ''}
              title={m.help}
              onClick={() => setSettings({ ...settings, coachMode: m.value })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!coach.live ? (
        <p className="muted small">{MODES[0].help} You can switch modes any time.</p>
      ) : (
        <>
          {coach.pendingFeedback && selectedPly == null ? (
            <p className="muted small" data-testid="feedback-pending">
              Looking at your move…
            </p>
          ) : fb ? (
            <div className="feedback" data-testid="feedback">
              <p className="feedback-head">
                <MoveBadge cls={fb.cls} label />
                <span className="feedback-move">{fb.san}</span>
              </p>
              <p className="feedback-text">{fb.text}</p>
              <div className="row wrap">
                {fb.frames.map((f, i) => (
                  <button key={i} type="button" className="small-btn" onClick={() => coach.showFrame(f)}>
                    {i === 0 ? 'See it on the board' : f.label}
                  </button>
                ))}
                {fb.lines.slice(0, 2).map((l, i) => (
                  <button key={`l${i}`} type="button" className={`small-btn ${i === 0 ? 'accent' : ''}`} onClick={() => coach.showLine(l)}>
                    {i === 0 ? 'Show me why' : l.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted small">{MODES.find((m) => m.value === settings.coachMode)?.help}</p>
          )}

          {coach.hint && (
            <div className="hint" data-testid="hint">
              <p className="hint-step small">
                Hint {coach.hint.level} of 4 · {HINT_STEPS[coach.hint.level - 1]}
              </p>
              <p className="hint-text">{coach.hint.text}</p>
              {coach.hint.line && (
                <button type="button" className="small-btn accent" onClick={() => coach.showLine(coach.hint!.line!)}>
                  Show me why
                </button>
              )}
            </div>
          )}

          {!over && (
            <button type="button" className="hint-btn" onClick={() => void coach.requestHint()} disabled={!canHint} data-testid="hint-btn">
              {hintLevel === 0 ? 'Hint' : hintLevel < 4 ? `More help (${hintLevel + 1} of 4)` : 'That’s all the help'}
            </button>
          )}

          <p className="legend small muted" aria-hidden="true">
            <span className="key best" /> better move <span className="key threat" /> threat <span className="key hint" /> hint
          </p>
        </>
      )}
    </section>
  )
}
