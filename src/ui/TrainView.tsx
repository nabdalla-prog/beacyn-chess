import { useCallback, useEffect, useMemo, useState } from 'react'
import { PuzzleSession } from './PuzzleSession'
import { eventsFromGame, eventsFromPuzzles, scoreSkills, SKILL_INFO, weakestSkills } from '../coach/skills'
import { dueCards, type Attempt } from '../training/srs'
import { todaysPlan, dayKey, type PlanItem } from '../training/plan'
import { bandOf, loadTheme, ownMistakePuzzles, pickPuzzles, THEME_ITEM, THEME_LABEL, THEMES, type Theme, type TrainPuzzle } from '../training/puzzles'
import { applyAttempt, loadTraining, saveTraining, type SrsEntry, type TrainingState } from '../training/store'
import type { GameRecord } from '../game/session'
import { listGames, loadProfile } from '../storage/db'

interface Session {
  title: string
  puzzles: TrainPuzzle[]
  planItem?: string
  showTheme: boolean
}

export type TrainRoute = { kind: 'home' } | { kind: 'theme'; theme: Theme } | { kind: 'puzzle'; theme: Theme; band: number; id: string }

export default function TrainView({ route, onPlay, onHome }: { route: TrainRoute; onPlay: () => void; onHome: () => void }) {
  const [state, setState] = useState<TrainingState | null>(null)
  const [games, setGames] = useState<GameRecord[]>([])
  const [playRating, setPlayRating] = useState(800)
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([loadTraining(), listGames(), loadProfile()]).then(([t, g, p]) => {
      setGames(g.filter((x) => x.result))
      setPlayRating(p.rating)
      setState(t)
    })
  }, [])

  const now = Date.now()
  const rating = state?.rating ?? playRating

  const derived = useMemo(() => {
    if (!state) return null
    const own = ownMistakePuzzles(games)
    const cleanIds = new Set(state.results.filter((r) => r.clean).map((r) => r.puzzleId))
    const ownOpen = own.filter((p) => !cleanIds.has(p.id) && !state.cards[p.id]).reverse()
    const due = dueCards(Object.values(state.cards), now) as SrsEntry[]
    const events = [...games.flatMap(eventsFromGame), ...eventsFromPuzzles(state.results)]
    const weakest = weakestSkills(scoreSkills(events))
    const plan = todaysPlan(state.plan, { now, dueReviews: due.length, ownMistakes: ownOpen.length, weakest })
    const gamesToday = games.filter((g) => !g.imported && g.endedAt && dayKey(g.endedAt) === dayKey(now)).length
    return { ownOpen, due, plan, gamesToday }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, games])

  // Persist a freshly built plan so progress sticks for the day.
  useEffect(() => {
    if (state && derived && state.plan !== derived.plan) {
      const next = { ...state, plan: derived.plan }
      setState(next)
      void saveTraining(next)
    }
  }, [state, derived])

  const onAttempt = useCallback(
    (p: TrainPuzzle, a: Attempt) => {
      setState((s) => {
        if (!s) return s
        const next = applyAttempt(s, p, a, Date.now(), playRating, session?.planItem)
        void saveTraining(next)
        return next
      })
    },
    [playRating, session?.planItem],
  )

  const startTheme = useCallback(
    async (theme: Theme, count: number, planItem?: string) => {
      setError('')
      try {
        const pool = await loadTheme(theme, bandOf(rating))
        const puzzles = pickPuzzles(pool, rating, new Set(state?.seen ?? []), count)
        setSession({ title: THEME_LABEL[theme], puzzles, planItem, showTheme: true })
      } catch {
        setError('Couldn’t load puzzles. Check your connection and try again.')
      }
    },
    [rating, state?.seen],
  )

  // Deep links: #/train/theme/<theme> and #/train/puzzle/<theme>/<band>/<id>.
  useEffect(() => {
    if (!state) return
    if (route.kind === 'theme') void startTheme(route.theme, 10)
    if (route.kind === 'puzzle') {
      void loadTheme(route.theme, route.band)
        .then((pool) => {
          const p = pool.find((x) => x.id === `l:${route.id}`)
          if (p) setSession({ title: 'Puzzle', puzzles: [p], showTheme: false })
          else setError('That puzzle wasn’t found.')
        })
        .catch(() => setError('Couldn’t load puzzles.'))
    }
    // Only when the route changes (and once state is loaded).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.kind, route.kind !== 'home' ? route.theme : null, route.kind === 'puzzle' ? route.id : null, !!state])

  if (!state || !derived) return <p className="muted center">Loading…</p>

  if (session) {
    return (
      <PuzzleSession
        key={session.title + session.puzzles.map((p) => p.id).join()}
        title={session.title}
        puzzles={session.puzzles}
        showTheme={session.showTheme}
        onAttempt={onAttempt}
        onExit={() => {
          setSession(null)
          if (route.kind !== 'home') onHome()
        }}
      />
    )
  }

  const startItem = (item: PlanItem) => {
    if (item.kind === 'game') return onPlay()
    if (item.kind === 'theme') return void startTheme(item.theme, item.target - item.done, item.id)
    if (item.kind === 'review') {
      setSession({ title: 'Puzzles to review', puzzles: derived.due.slice(0, item.target - item.done).map((c) => c.puzzle), planItem: item.id, showTheme: false })
    }
    if (item.kind === 'own') {
      setSession({ title: 'Your own mistakes', puzzles: derived.ownOpen.slice(0, item.target - item.done), planItem: item.id, showTheme: false })
    }
  }

  const itemTitle = (i: PlanItem) =>
    i.kind === 'review'
      ? `Review ${i.target} puzzle${i.target === 1 ? '' : 's'} you missed`
      : i.kind === 'own'
        ? `Fix ${i.target} of your own mistakes`
        : i.kind === 'theme'
          ? `${i.target} ${THEME_ITEM[i.theme]} puzzles`
          : 'Play a game against the coach'
  const itemWhy = (i: PlanItem) =>
    i.kind === 'review'
      ? 'Spaced repetition: these are due today.'
      : i.kind === 'own'
        ? 'Positions from your games where a better move existed.'
        : i.kind === 'theme'
          ? i.reason === 'general'
            ? 'General tactics practice.'
            : i.reason === 'blunders'
              ? 'Spotting loose pieces cuts down blunders — one of your weakest areas.'
              : i.reason === 'calculation'
                ? 'Short forcing lines train calculation — one of your weakest areas.'
                : `${SKILL_INFO[i.reason as keyof typeof SKILL_INFO]?.name ?? 'This'} is one of your weakest skills.`
          : 'Use what you practised in a real game.'

  const progressOf = (i: PlanItem) => (i.kind === 'game' ? Math.min(1, derived.gamesToday) : i.done)

  return (
    <div className="train">
      <section className="card plan" data-testid="plan">
        <h2>Today’s plan</h2>
        <ol className="plan-list">
          {derived.plan.items.map((i) => {
            const done = progressOf(i)
            const complete = done >= i.target
            return (
              <li key={i.id} className={complete ? 'complete' : ''}>
                <div className="plan-main">
                  <strong>{itemTitle(i)}</strong>
                  <span className="small muted">{itemWhy(i)}</span>
                  <span className="plan-bar" role="progressbar" aria-valuemin={0} aria-valuemax={i.target} aria-valuenow={done} aria-label={itemTitle(i)}>
                    <span style={{ width: `${(done / i.target) * 100}%` }} />
                  </span>
                </div>
                <button type="button" className={complete ? 'small-btn' : 'small-btn accent'} onClick={() => startItem(i)} data-testid={`plan-${i.id}`}>
                  {complete ? 'Again' : done > 0 ? 'Continue' : 'Start'}
                </button>
              </li>
            )
          })}
        </ol>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card">
        <div className="row spread">
          <h3>Practise a theme</h3>
          <span className="small muted" data-testid="puzzle-rating">
            Puzzle rating ≈{rating}
          </span>
        </div>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t} type="button" className="small-btn" onClick={() => void startTheme(t, 10)}>
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="small muted">
          Puzzles from the free Lichess puzzle database, matched to your rating. Missed ones come back for review on a schedule (spaced
          repetition).
        </p>
      </section>
    </div>
  )
}
