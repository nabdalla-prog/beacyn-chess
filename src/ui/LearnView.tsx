import { useState } from 'react'
import { LESSONS, nextLesson, UNITS } from '../training/lessons'
import { REPERTOIRES } from '../training/repertoires'
import { DRILLS } from '../training/endgames'
import { dueCards } from '../training/srs'
import { useTraining } from './useTraining'
import { LessonView } from './LessonView'
import { OpeningTrainer } from './OpeningTrainer'
import { EndgameDrillView } from './EndgameDrillView'
import { VisualizationView } from './VisualizationView'

export type LearnRoute =
  | { kind: 'home' }
  | { kind: 'lesson'; id: string }
  | { kind: 'opening'; id: string }
  | { kind: 'endgame'; id: string }
  | { kind: 'vis'; mode: 'squares' | 'blindfold' }

const go = (hash: string) => {
  location.hash = hash
}

export default function LearnView({ route }: { route: LearnRoute }) {
  const [t, update] = useTraining()
  const [now] = useState(() => Date.now())
  if (!t) return <p className="muted center">Loading…</p>
  const back = () => go('#/learn')

  if (route.kind === 'lesson') {
    const lesson = LESSONS.find((l) => l.id === route.id)
    if (lesson) return <LessonView lesson={lesson} done={t.lessonsDone.includes(lesson.id)} update={update} onBack={back} />
  }
  if (route.kind === 'opening') {
    const rep = REPERTOIRES.find((r) => r.id === route.id)
    if (rep) return <OpeningTrainer rep={rep} cards={t.openingCards} update={update} onBack={back} />
  }
  if (route.kind === 'endgame') {
    const drill = DRILLS.find((d) => d.id === route.id)
    if (drill) return <EndgameDrillView drill={drill} onBack={back} />
  }
  if (route.kind === 'vis') return <VisualizationView mode={route.mode} onBack={back} />

  const next = nextLesson(t.lessonsDone)
  const dueLines = (repId: string) => {
    const ids = REPERTOIRES.find((r) => r.id === repId)!.lines.map((l) => l.id)
    return dueCards(Object.values(t.openingCards).filter((c) => ids.includes(c.id)), now).length
  }

  return (
    <div className="learn">
      <section className="card" aria-labelledby="lessons-title" data-testid="lessons">
        <div className="row spread">
          <h2 id="lessons-title">Lessons</h2>
          <span className="small muted">
            {t.lessonsDone.length}/{LESSONS.length} done
          </span>
        </div>
        {next && (
          <p className="small">
            Recommended next:{' '}
            <a href={`#/learn/lesson/${next.id}`} className="strong-link">
              {next.title}
            </a>
          </p>
        )}
        {UNITS.map((u) => (
          <div key={u} className="unit">
            <h3>{u}</h3>
            <ul className="lesson-list">
              {LESSONS.filter((l) => l.unit === u).map((l) => (
                <li key={l.id}>
                  <a href={`#/learn/lesson/${l.id}`} className={`lesson-link ${t.lessonsDone.includes(l.id) ? 'done' : ''}`}>
                    <span className="lesson-check" aria-hidden="true">
                      {t.lessonsDone.includes(l.id) ? '✓' : ''}
                    </span>
                    {l.title}
                    {t.lessonsDone.includes(l.id) && <span className="sr-only"> (done)</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="openings-title">
        <h2 id="openings-title">Opening trainer</h2>
        <p className="small muted">Pick a repertoire and drill its lines on the board. Lines come back for review on a schedule.</p>
        <ul className="rep-list">
          {REPERTOIRES.map((r) => {
            const due = dueLines(r.id)
            return (
              <li key={r.id}>
                <a href={`#/learn/opening/${r.id}`} className="rep-link">
                  <span className={`side-dot side-${r.color}`} aria-hidden="true" />
                  <span>
                    <strong>{r.name}</strong>
                    <span className="small muted"> · as {r.color === 'w' ? 'White' : 'Black'} · {r.lines.length} line{r.lines.length === 1 ? '' : 's'}</span>
                    {due > 0 && <span className="due-tag">{due} due</span>}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="endgames-title">
        <h2 id="endgames-title">Endgame drills</h2>
        <p className="small muted">Play key endgames against the engine from fixed positions.</p>
        {[...new Set(DRILLS.map((d) => d.group))].map((g) => (
          <div key={g} className="unit">
            <h3>{g}</h3>
            <ul className="lesson-list">
              {DRILLS.filter((d) => d.group === g).map((d) => (
                <li key={d.id}>
                  <a href={`#/learn/endgame/${d.id}`} className="lesson-link">
                    <span className="lesson-check" aria-hidden="true" />
                    {d.name} <span className="small muted">· {d.goal === 'draw' ? 'hold the draw' : d.goal === 'mate' ? 'checkmate' : 'win'}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="vis-title">
        <h2 id="vis-title">Visualization</h2>
        <div className="row wrap">
          <a className="small-btn link-btn" href="#/learn/vis/squares">
            Name the square
          </a>
          <a className="small-btn link-btn" href="#/learn/vis/blindfold">
            Blindfold-lite
          </a>
        </div>
      </section>
    </div>
  )
}
