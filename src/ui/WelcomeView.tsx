import { useEffect, useState } from 'react'
import { PuzzleSession } from './PuzzleSession'
import { EXPERIENCE, PLACEMENT_PUZZLES, coachStrengthFrom, placementRating, type ExperienceId } from '../training/placement'
import { bandOf, loadTheme, pickPuzzles, type Theme, type TrainPuzzle } from '../training/puzzles'
import { isClean } from '../training/srs'
import { applyAttempt, loadTraining, saveTraining } from '../training/store'
import { loadProfile, loadSettings, saveProfile, saveSettings, setKv } from '../storage/db'
import type { CoachMode } from '../game/session'

const ROTATION: Theme[] = ['mateIn1', 'hangingPiece', 'fork', 'mateIn1', 'fork']

type Step = { kind: 'experience' } | { kind: 'puzzle'; n: number } | { kind: 'mode' } | { kind: 'done' }

const markOnboarded = () => setKv('onboarded', true)

export default function WelcomeView({ onFinish }: { onFinish: () => void | Promise<void> }) {
  const [step, setStep] = useState<Step>({ kind: 'experience' })
  const [prior, setPrior] = useState(700)
  const [results, setResults] = useState<{ rating: number; clean: boolean }[]>([])
  const [puzzle, setPuzzle] = useState<TrainPuzzle | null>(null)
  const [error, setError] = useState('')
  const estimate = placementRating(prior, results)

  // Load the next puzzle at the current estimate.
  useEffect(() => {
    if (step.kind !== 'puzzle') return
    setPuzzle(null)
    const theme = ROTATION[step.n % ROTATION.length]
    loadTheme(theme, bandOf(estimate))
      .then((pool) => setPuzzle(pickPuzzles(pool, estimate, new Set(), 1)[0] ?? null))
      .catch(() => setError('Couldn’t load puzzles — you can skip this and set your level yourself.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const finish = async (mode: CoachMode) => {
    const [profile, settings, training] = await Promise.all([loadProfile(), loadSettings(), loadTraining()])
    await saveProfile({ ...profile, rating: coachStrengthFrom(estimate) })
    await saveSettings({ ...settings, coachMode: mode })
    await saveTraining({ ...training, rating: estimate })
    await markOnboarded()
    setStep({ kind: 'done' })
  }

  if (step.kind === 'experience') {
    return (
      <section className="card welcome" data-testid="welcome">
        <h2>Welcome! Let’s find your level</h2>
        <p className="muted">About two minutes: one question and {PLACEMENT_PUZZLES} short puzzles. You can change everything later.</p>
        <p>
          <strong>How much chess have you played?</strong>
        </p>
        <div className="choice-list">
          {EXPERIENCE.map((e) => (
            <button
              key={e.id}
              type="button"
              className="choice"
              onClick={() => {
                setPrior(EXPERIENCE.find((x) => x.id === (e.id as ExperienceId))!.prior)
                setStep({ kind: 'puzzle', n: 0 })
              }}
            >
              {e.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="link"
          onClick={() => {
            void markOnboarded().then(onFinish)
          }}
        >
          Skip — I’ll pick a level myself
        </button>
      </section>
    )
  }

  if (step.kind === 'puzzle') {
    if (error)
      return (
        <section className="card welcome">
          <p className="error">{error}</p>
          <button type="button" className="primary" onClick={() => setStep({ kind: 'mode' })}>
            Continue
          </button>
        </section>
      )
    if (!puzzle) return <p className="muted center">Loading puzzle…</p>
    return (
      <PuzzleSession
        key={puzzle.id}
        title={`Placement ${step.n + 1}/${PLACEMENT_PUZZLES}`}
        puzzles={[puzzle]}
        showTheme={false}
        noHelp
        onAttempt={(p, a) => {
          setResults((r) => [...r, { rating: p.rating ?? estimate, clean: isClean(a) }])
          void loadTraining().then((t) => saveTraining(applyAttempt(t, p, a, Date.now(), estimate)))
        }}
        onNext={() => setStep(step.n + 1 >= PLACEMENT_PUZZLES ? { kind: 'mode' } : { kind: 'puzzle', n: step.n + 1 })}
        onExit={() => setStep({ kind: 'mode' })}
      />
    )
  }

  if (step.kind === 'mode') {
    const modes: { value: CoachMode; label: string; help: string }[] = [
      { value: 'guided', label: 'Guided', help: 'Feedback on every move and a warning before a blunder. Best for learning.' },
      { value: 'hints', label: 'Hints', help: 'Feedback on every move; hints only when you ask.' },
      { value: 'silent', label: 'Silent', help: 'No help during the game; review afterwards.' },
    ]
    return (
      <section className="card welcome" data-testid="welcome-mode">
        <h2>Your level: about {estimate}</h2>
        <p className="muted">
          The coach will start at ≈{coachStrengthFrom(estimate)} and adjust after every game. {results.filter((r) => r.clean).length} of {results.length} puzzles solved.
        </p>
        <p>
          <strong>How should the coach help during games?</strong>
        </p>
        <div className="choice-list">
          {modes.map((m) => (
            <button key={m.value} type="button" className="choice" onClick={() => void finish(m.value)}>
              <strong>{m.label}</strong>
              <span className="small muted">{m.help}</span>
            </button>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="card welcome" data-testid="welcome-done">
      <h2>All set!</h2>
      <p>Your first game is ready. The coach explains as you play, and your skills page fills in as you go.</p>
      <button type="button" className="primary big" onClick={() => void onFinish()}>
        Let’s play
      </button>
    </section>
  )
}
