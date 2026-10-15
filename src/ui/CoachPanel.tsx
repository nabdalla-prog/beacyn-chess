import { useState } from 'react'
import { MoveBadge } from './MoveBadge'
import { CLASS_INFO } from '../coach/classify'
import { useAiNote } from '../ai/useAiNote'
import type { AiSettings } from '../ai/types'
import type { CoachMode } from '../game/session'
import type { Explanation } from '../coach/explain'
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

function Feedback({ fb, coach, compact, ai }: { fb: Explanation; coach: Coach; compact: boolean; ai: AiSettings }) {
  const aiText = useAiNote({ san: fb.san, verdict: CLASS_INFO[fb.cls].label, text: fb.text }, ai)
  const [original, setOriginal] = useState(false)
  const showAi = aiText && !original
  return (
    <div className="feedback" data-testid="feedback">
      <p className="feedback-head">
        <MoveBadge cls={fb.cls} label />
        <span className="feedback-move">{fb.san}</span>
      </p>
      <p className={`feedback-text ${compact ? 'clamp' : ''}`}>{showAi ? aiText : fb.text}</p>
      {aiText && (
        <button type="button" className="link tiny-link" onClick={() => setOriginal((o) => !o)} data-testid="ai-toggle">
          {original ? 'Show friendlier wording' : 'Reworded by AI · show the coach’s words'}
        </button>
      )}
      <div className="row wrap">
        {fb.frames.slice(0, compact ? 1 : 2).map((f, i) => (
          <button key={i} type="button" className="small-btn" onClick={() => coach.showFrame(f)}>
            {i === 0 ? (compact ? 'See it' : 'See it on the board') : f.label}
          </button>
        ))}
        {fb.lines.slice(0, compact ? 1 : 2).map((l, i) => (
          <button key={`l${i}`} type="button" className={`small-btn ${i === 0 ? 'accent' : ''}`} onClick={() => coach.showLine(l)}>
            {i === 0 ? 'Show me why' : l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Latest feedback, the current hint and the hint button. */
function LiveCoaching({ play, coach, selectedPly, compact }: { play: Play; coach: Coach; selectedPly: number | null; compact: boolean }) {
  const over = !!play.game?.result
  const fb = selectedPly != null ? coach.feedback[selectedPly] : coach.latest
  const hintLevel = coach.hint?.level ?? 0
  const canHint = coach.live && play.userTurn && !over && !coach.warning && hintLevel < 4
  const hintButton = !over && (
    <button type="button" className={`hint-btn ${compact ? 'compact' : ''}`} onClick={() => void coach.requestHint()} disabled={!canHint} data-testid="hint-btn">
      {hintLevel === 0 ? 'Hint' : hintLevel < 4 ? `More help (${hintLevel + 1} of 4)` : compact ? 'No more hints' : 'That’s all the help'}
    </button>
  )

  return (
    <>
      {coach.hint ? (
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
      ) : coach.pendingFeedback && selectedPly == null ? (
        <p className="muted small" data-testid="feedback-pending">
          Looking at your move…
        </p>
      ) : fb ? (
        <Feedback key={`${fb.san}|${fb.text}`} fb={fb} coach={coach} compact={compact} ai={play.settings.ai} />
      ) : (
        <p className="muted small">{compact ? 'Make a move — the coach will comment on it here.' : MODES.find((m) => m.value === play.settings.coachMode)?.help}</p>
      )}
      {hintButton}
    </>
  )
}

function ModePicker({ play }: { play: Play }) {
  const { settings, setSettings } = play
  return (
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
  )
}

const Legend = () => (
  <p className="legend small muted" aria-hidden="true">
    <span className="key best" /> better move <span className="key threat" /> threat <span className="key hint" /> hint
  </p>
)

/**
 * Side-panel coach card. On phones (`showLive` false) the live feedback lives in
 * the strip under the board instead, and this card keeps only the mode picker.
 */
export function CoachPanel({ play, coach, selectedPly, showLive }: { play: Play; coach: Coach; selectedPly: number | null; showLive: boolean }) {
  return (
    <section className="card coach-card" aria-labelledby="coach-title" data-testid="coach">
      <div className="coach-head">
        <h3 id="coach-title">Coach</h3>
        <ModePicker play={play} />
      </div>
      {!coach.live ? (
        <p className="muted small">{MODES[0].help} You can switch modes any time.</p>
      ) : showLive ? (
        <>
          <LiveCoaching play={play} coach={coach} selectedPly={selectedPly} compact={false} />
          <Legend />
        </>
      ) : (
        <Legend />
      )}
    </section>
  )
}

/** Compact coach panel directly under the board on phones, so feedback is visible without scrolling. */
export function CoachStrip({ play, coach, selectedPly }: { play: Play; coach: Coach; selectedPly: number | null }) {
  if (!coach.live) return null
  return (
    <section className="coach-strip" aria-label="Coach" data-testid="coach-strip">
      <LiveCoaching play={play} coach={coach} selectedPly={selectedPly} compact />
    </section>
  )
}
