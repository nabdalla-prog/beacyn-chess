import { useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Key } from '@lichess-org/chessground/types'
import { Board } from './Board'
import { legalDests } from '../game/session'
import { LESSONS, passes, type Lesson } from '../training/lessons'
import { completeLesson, type TrainingState } from '../training/store'

type Step = { kind: 'concept' } | { kind: 'exercise'; index: number } | { kind: 'quiz' } | { kind: 'done' }

export function LessonView({ lesson, done, update, onBack }: { lesson: Lesson; done: boolean; update: (fn: (s: TrainingState) => TrainingState) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'concept' })
  const [fen, setFen] = useState(lesson.exercises[0]?.fen ?? '')
  const [last, setLast] = useState<Key[] | undefined>()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [hint, setHint] = useState(false)
  const [boardKey, setBoardKey] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)

  const nextIdx = LESSONS.findIndex((l) => l.id === lesson.id) + 1
  const nextLesson = LESSONS[nextIdx]

  const startExercise = (index: number) => {
    setStep({ kind: 'exercise', index })
    setFen(lesson.exercises[index].fen)
    setLast(undefined)
    setFeedback(null)
    setHint(false)
  }

  const header = (
    <div className="row spread review-top">
      <button type="button" className="small-btn" onClick={onBack}>
        ← Learn
      </button>
      <span className="small muted">
        {lesson.unit}
        {done ? ' · done ✓' : ''}
      </span>
    </div>
  )

  if (step.kind === 'concept') {
    return (
      <div className="lesson">
        {header}
        <section className="card lesson-card" data-testid="lesson">
          <h2>{lesson.title}</h2>
          {lesson.concept.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <button type="button" className="primary" onClick={() => (lesson.exercises.length ? startExercise(0) : setStep({ kind: 'quiz' }))}>
            Try it on the board
          </button>
        </section>
      </div>
    )
  }

  if (step.kind === 'quiz' || step.kind === 'done') {
    const q = lesson.quiz
    const answered = choice != null
    return (
      <div className="lesson">
        {header}
        <section className="card lesson-card" data-testid="quiz">
          <h2>Quick check</h2>
          <p>
            <strong>{q.question}</strong>
          </p>
          <div className="quiz-options" role="group" aria-label="Answers">
            {q.options.map((o, i) => (
              <button
                key={i}
                type="button"
                className={`quiz-option ${answered && i === q.answer ? 'right' : ''} ${answered && i === choice && i !== q.answer ? 'wrong' : ''}`}
                aria-pressed={choice === i}
                disabled={answered && choice === q.answer}
                onClick={() => {
                  setChoice(i)
                  if (i === q.answer) {
                    update((s) => completeLesson(s, lesson.id))
                    setStep({ kind: 'done' })
                  }
                }}
              >
                {o}
              </button>
            ))}
          </div>
          {answered && (
            <p className={choice === q.answer ? 'good-text' : 'error'} role="status">
              {choice === q.answer ? `Right! ${q.why}` : 'Not quite — have another go.'}
            </p>
          )}
          {step.kind === 'done' && (
            <div className="row wrap">
              {lesson.drill && (
                <a className="small-btn accent link-btn" href={`#/learn/endgame/${lesson.drill}`}>
                  Practise it: endgame drill
                </a>
              )}
              {nextLesson ? (
                <a className="primary link-btn big-link" href={`#/learn/lesson/${nextLesson.id}`} data-testid="next-lesson">
                  Next lesson: {nextLesson.title}
                </a>
              ) : (
                <button type="button" className="primary" onClick={onBack}>
                  All lessons done!
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    )
  }

  const ex = lesson.exercises[step.index]
  const pos = new Chess(fen)
  const solved = feedback?.ok
  const userColor = new Chess(ex.fen).turn()

  const onMove = (from: Key, to: Key) => {
    const before = new Chess(ex.fen)
    const after = new Chess(ex.fen)
    let m
    try {
      m = after.move({ from: from as Square, to: to as Square, promotion: 'q' })
    } catch {
      setBoardKey((k) => k + 1)
      return
    }
    if (passes(ex.check, before, m, after)) {
      setFen(after.fen())
      setLast([from, to])
      setFeedback({ ok: true, text: ex.success })
    } else {
      setFeedback({ ok: false, text: `${m.san} isn’t it. Try again.` })
      setBoardKey((k) => k + 1)
    }
  }

  return (
    <div className="game-layout puzzle lesson">
      <div className="board-column">
        {header}
        <div className="board-stage">
          <Board
            fen={fen}
            orientation={userColor === 'w' ? 'white' : 'black'}
            turnColor={pos.turn() === 'w' ? 'white' : 'black'}
            movable={!solved ? (userColor === 'w' ? 'white' : 'black') : undefined}
            dests={!solved ? (legalDests(pos) as Map<Key, Key[]>) : undefined}
            lastMove={last}
            check={pos.isCheck()}
            resetKey={boardKey}
            onMove={onMove}
          />
        </div>
        <div className={`callout puzzle-card ${solved ? 'solved' : feedback ? 'wrong' : ''}`} data-testid="exercise" aria-live="polite">
          <p className="small muted">
            {lesson.title} · exercise {step.index + 1} of {lesson.exercises.length}
          </p>
          <p>
            <strong>{feedback ? feedback.text : ex.prompt}</strong>
          </p>
          {hint && !solved && <p className="small">Hint: {ex.hint}</p>}
          <div className="row wrap">
            {!solved ? (
              <button type="button" className="small-btn" onClick={() => setHint(true)} disabled={hint}>
                Hint
              </button>
            ) : step.index + 1 < lesson.exercises.length ? (
              <button type="button" className="primary" onClick={() => startExercise(step.index + 1)}>
                Next exercise
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => setStep({ kind: 'quiz' })} data-testid="to-quiz">
                Quick check
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
