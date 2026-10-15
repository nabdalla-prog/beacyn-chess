import { useCallback, useEffect, useMemo, useState } from 'react'
import { MoveBadge } from './MoveBadge'
import { RadarChart, Sparkline } from './SkillCharts'
import { initialEvals, isAnalysed, runAnalysis, withAnalysis, type AnalysisRun } from '../coach/gameAnalysis'
import {
  eventsFromGame,
  MOTIFS,
  RADAR_SKILLS,
  scoreSkills,
  SKILL_INFO,
  skillTrend,
  weakestSkills,
  weaknessSentence,
  type SkillEvent,
  type SkillScore,
} from '../coach/skills'
import type { GameRecord } from '../game/session'
import { getGame, listGames, saveGame } from '../storage/db'

const moveLabel = (ply: number, san: string) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '…'} ${san}`
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Games whose user moves still lack a coach verdict (played in Silent mode or imported, not reviewed). */
const needsAnalysis = (g: GameRecord) => !!g.result && !isAnalysed(g) && g.moves.some((m) => m.by === 'user' && !m.review)

export default function SkillsView({ onOpenReview, onPlay }: { onOpenReview: (id: string, ply: number) => void; onPlay: () => void }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  const [job, setJob] = useState<{ done: number; total: number; run: AnalysisRun | null } | null>(null)

  const reload = useCallback(() => {
    void listGames().then((g) => setGames(g.filter((x) => x.result)))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => () => job?.run?.cancel(), [job?.run])

  const data = useMemo(() => {
    if (!games) return null
    const perGame = games.map((g) => ({ gameId: g.id, at: g.startedAt, events: eventsFromGame(g) }))
    const all: SkillEvent[] = perGame.flatMap((p) => p.events)
    const scores = scoreSkills(all)
    const weakest = weakestSkills(scores)
    const counted = perGame.filter((p) => p.events.length > 0).length
    return { perGame, all, scores, weakest, counted }
  }, [games])

  const pending = games?.filter(needsAnalysis) ?? []

  const analyseAll = async () => {
    const queue = pending.slice()
    for (let i = 0; i < queue.length; i++) {
      const g = queue[i]
      const run = runAnalysis(g, initialEvals(g))
      setJob({ done: i, total: queue.length, run })
      const evals = await run.promise
      if (!evals) {
        setJob(null)
        return
      }
      const latest = (await getGame(g.id)) ?? g
      await saveGame(withAnalysis(latest, evals))
    }
    setJob(null)
    reload()
  }

  if (!games || !data) return <p className="muted center">Loading…</p>

  const gameById = new Map(games.map((g) => [g.id, g]))
  /** Sentence for a weak skill, using the (distinct) example position picked for it. */
  const example = (s: SkillScore) => {
    const e = s.example
    if (!e) return null
    const g = gameById.get(e.gameId)
    const text = g?.moves[e.ply]?.review?.text ?? `${e.san} was a ${e.cls}.`
    return { e, sentence: weaknessSentence(s, text, `${moveLabel(e.ply, e.san)} on ${shortDate(e.at)}`) }
  }

  const empty = data.counted === 0

  return (
    <div className="skills">
      <section className="card skills-head">
        <h2>Your skills</h2>
        <p className="muted small">
          {empty
            ? 'Play a game with coaching on (Hints or Guided), or review a game, and your skill profile appears here.'
            : `Based on ${data.counted} game${data.counted === 1 ? '' : 's'} and ${new Set(data.all.map((e) => `${e.gameId}:${e.ply}`)).size} of your moves. Recent games count more.`}
        </p>
        {pending.length > 0 && (
          <div className="row wrap analyse-row">
            {job ? (
              <span className="small" role="status">
                Analysing game {job.done + 1} of {job.total}…
              </span>
            ) : (
              <>
                <span className="small muted">
                  {pending.length} game{pending.length === 1 ? ' isn’t' : 's aren’t'} analysed yet.
                </span>
                <button type="button" className="small-btn accent" onClick={() => void analyseAll()} data-testid="analyse-games">
                  Analyse {pending.length === 1 ? 'it' : 'them'} now
                </button>
              </>
            )}
          </div>
        )}
        {empty && (
          <button type="button" className="primary" onClick={onPlay}>
            Play a game
          </button>
        )}
      </section>

      {!empty && (
        <>
          <section className="card radar-card">
            <h3>Skill profile</h3>
            <RadarChart title="Skill profile, 0 to 100" axes={RADAR_SKILLS.map((k) => ({ label: SKILL_INFO[k].name, value: data.scores[k].score }))} />
            <p className="small muted">Each score (0–100) is the share of your moves in that area the engine rated Good or better. Areas marked “no data yet” need more games.</p>
          </section>

          <section className="card weakest" data-testid="weakest">
            <h3>Work on these first</h3>
            {data.weakest.length === 0 ? (
              <p className="muted small">No clear weak spot yet — play a few more games to sharpen the picture.</p>
            ) : (
              <ol>
                {data.weakest.map((w, rank) => {
                  const ex = example(w)
                  if (!ex) return null
                  return (
                    <li key={w.skill} className="weak-item">
                      <p className="weak-head">
                        <span className="weak-rank">{rank + 1}</span>
                        <strong>{SKILL_INFO[w.skill].name}</strong>
                        <span className="weak-score">{w.score}</span>
                      </p>
                      <p className="small">{ex.sentence}</p>
                      <button type="button" className="small-btn" onClick={() => onOpenReview(ex.e.gameId, ex.e.ply + 1)}>
                        <MoveBadge cls={ex.e.cls} /> Show me this position
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section className="card">
            <h3>Tactics by motif</h3>
            <ul className="motif-bars" aria-label="Tactics by motif">
              {MOTIFS.map((m) => {
                const s = data.scores[m]
                return (
                  <li key={m}>
                    <span className="motif-name">{SKILL_INFO[m].name}</span>
                    <span className="motif-track" aria-hidden="true">
                      {s.score != null && <span className="motif-fill" style={{ width: `${s.score}%` }} />}
                    </span>
                    <span className="motif-val">{s.score != null ? s.score : s.n ? `${s.n} seen` : '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="card">
            <h3>Trends</h3>
            <ul className="trend-list">
              {RADAR_SKILLS.map((k) => (
                <li key={k}>
                  <span>{SKILL_INFO[k].name}</span>
                  <Sparkline label={SKILL_INFO[k].name} points={skillTrend(data.perGame, k)} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
