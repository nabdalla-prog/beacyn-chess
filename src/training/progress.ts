// Day streak and badges. Everything is worked out from saved data, so a badge
// can only appear for something that really happened.
import type { GameRecord } from '../game/session'
import { userScore } from '../game/session'
import { RADAR_SKILLS, type SkillId, type SkillScore } from '../coach/skills'
import { dayKey } from './plan'
import type { TrainingState } from './store'
import { LESSONS } from './lessons'
import { DRILLS } from './endgames'

// ---------- streak ----------

const shiftDay = (key: string, days: number) => {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + days, 12).getTime()) // noon: safe across daylight-saving changes
}

export interface Streak {
  /** Active days in the current streak. */
  days: number
  /** Today already counts. */
  activeToday: boolean
  /** Days inside the streak that were missed and frozen instead of breaking it. */
  frozen: number
  /** Longest streak ever (same rule). */
  best: number
}

/**
 * A missed day freezes the streak instead of resetting it; two missed days in a row end it.
 * Today doesn't break anything yet — there's still time to practise.
 */
export function computeStreak(activeDays: Iterable<string>, now: number): Streak {
  const days = new Set(activeDays)
  const today = dayKey(now)
  const activeToday = days.has(today)
  // Walk back from today (or yesterday if today is still open).
  let cursor = activeToday ? today : shiftDay(today, -1)
  let count = 0
  let frozen = 0
  let gap = 0
  for (let i = 0; i < 4000; i++) {
    if (days.has(cursor)) {
      count++
      gap = 0
    } else {
      gap++
      if (gap >= 2) break
      // A single gap only counts as frozen if an active day comes before it.
      if (!days.has(shiftDay(cursor, -1))) break
      frozen++
    }
    cursor = shiftDay(cursor, -1)
  }
  return { days: count, activeToday, frozen, best: Math.max(count, bestStreak(days)) }
}

function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    if (prev && (d === shiftDay(prev, 1) || d === shiftDay(prev, 2))) run++
    else run = 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

/** Every day with a finished game against the coach or any training. */
export function activeDaysFrom(games: GameRecord[], training: TrainingState): string[] {
  const out = new Set(training.activeDays)
  for (const g of games) if (!g.imported && g.result && g.endedAt) out.add(dayKey(g.endedAt))
  for (const r of training.results) out.add(dayKey(r.at))
  return [...out]
}

// ---------- badges ----------

export interface BadgeDef {
  id: string
  name: string
  /** What it takes, said kindly. */
  how: string
  icon: string
}

export interface BadgeState extends BadgeDef {
  earned: boolean
  /** When it was earned, if known. */
  at?: number
  /** Progress towards it, e.g. 37 of 100. */
  progress?: { have: number; need: number }
}

export const BADGES: BadgeDef[] = [
  { id: 'first-game', name: 'First game', how: 'Finish a game against the coach.', icon: '♟' },
  { id: 'first-win', name: 'First win', how: 'Win a game against the coach.', icon: '🏆' },
  { id: 'first-mate', name: 'Checkmate!', how: 'Win a game by checkmate.', icon: '♚' },
  { id: 'clean-game', name: 'Clean game', how: 'Finish a reviewed game of 20+ moves with no blunders.', icon: '✨' },
  { id: 'first-review', name: 'Learning from it', how: 'Review one of your games.', icon: '🔍' },
  { id: 'drill-mate', name: 'Endgame finisher', how: 'Deliver checkmate in an endgame drill.', icon: '🎯' },
  { id: 'drill-draw', name: 'Fortress', how: 'Hold a draw in an endgame drill.', icon: '🛡' },
  { id: 'first-lesson', name: 'First lesson', how: 'Finish a lesson.', icon: '📘' },
  { id: 'all-lessons', name: 'Graduate', how: 'Finish every lesson.', icon: '🎓' },
  { id: 'opening-line', name: 'Opening memory', how: 'Play an opening line from memory twice in a row.', icon: '📖' },
  { id: 'puzzles-10', name: '10 puzzles', how: 'Do 10 puzzles.', icon: '🧩' },
  { id: 'puzzles-100', name: '100 puzzles', how: 'Do 100 puzzles.', icon: '🧠' },
  { id: 'puzzles-500', name: '500 puzzles', how: 'Do 500 puzzles.', icon: '💎' },
  { id: 'clean-10', name: 'Sharp eyes', how: 'Solve 10 puzzles in a row first try, no hints.', icon: '👁' },
  { id: 'streak-3', name: '3-day streak', how: 'Practise on 3 days in a streak.', icon: '🔥' },
  { id: 'streak-7', name: '7-day streak', how: 'Practise on 7 days in a streak.', icon: '📅' },
  { id: 'streak-30', name: '30-day streak', how: 'Practise on 30 days in a streak.', icon: '🌟' },
  { id: 'skill-60', name: 'Getting solid', how: 'Reach 60 in any skill.', icon: '📈' },
  { id: 'skill-80', name: 'Strong skill', how: 'Reach 80 in any skill.', icon: '🚀' },
]

export interface ProgressInput {
  games: GameRecord[]
  training: TrainingState
  /** Current skill scores (radar skills). */
  scores: Partial<Record<SkillId, SkillScore>>
  /** Badges already earned before, with their dates (never taken away). */
  earned: Record<string, number>
  now: number
}

const isWin = (g: GameRecord) => userScore(g) === 1

export function computeBadges({ games, training, scores, earned, now }: ProgressInput): BadgeState[] {
  const coachGames = games.filter((g) => !g.imported && g.result && g.endedAt).sort((a, b) => a.endedAt! - b.endedAt!)
  const firstWhere = <T,>(xs: T[], ok: (x: T) => boolean, at: (x: T) => number | undefined) => {
    const x = xs.find(ok)
    return x ? { at: at(x) ?? now } : null
  }
  const results = [...training.results].sort((a, b) => a.at - b.at)
  const drills = [...(training.drills ?? [])].sort((a, b) => a.at - b.at)
  const lessonsAt = training.lessonsAt ?? {}
  const lessonDates = training.lessonsDone.map((id) => lessonsAt[id]).filter((x): x is number => x != null)
  let cleanRun = 0
  let cleanAt: number | null = null
  for (const r of results) {
    cleanRun = r.clean ? cleanRun + 1 : 0
    if (cleanRun >= 10 && cleanAt == null) cleanAt = r.at
  }
  const streak = computeStreak(activeDaysFrom(games, training), now)
  const bestSkill = Math.max(0, ...RADAR_SKILLS.map((s) => scores[s]?.score ?? 0))
  const blunderFree = (g: GameRecord) => {
    const mine = g.moves.filter((m) => m.by === 'user')
    return mine.length >= 20 && mine.every((m) => m.review) && !mine.some((m) => m.review!.cls === 'blunder' || m.review!.cls === 'missed-win')
  }

  // id → (earned date or null, optional progress)
  const check: Record<string, { hit: { at: number } | null; progress?: { have: number; need: number } }> = {
    'first-game': { hit: firstWhere(coachGames, () => true, (g) => g.endedAt) },
    'first-win': { hit: firstWhere(coachGames, isWin, (g) => g.endedAt) },
    'first-mate': { hit: firstWhere(coachGames, (g) => isWin(g) && g.result!.termination === 'checkmate', (g) => g.endedAt) },
    'clean-game': { hit: firstWhere(coachGames, blunderFree, (g) => g.endedAt) },
    'first-review': { hit: firstWhere(games, (g) => !!g.analysis, (g) => g.endedAt ?? g.startedAt) },
    'drill-mate': { hit: firstWhere(drills, (d) => d.won && d.mate, (d) => d.at) },
    'drill-draw': { hit: firstWhere(drills, (d) => d.won && DRILLS.find((x) => x.id === d.id)?.goal === 'draw', (d) => d.at) },
    'first-lesson': { hit: training.lessonsDone.length ? { at: Math.min(...lessonDates, now) } : null },
    'all-lessons': {
      hit: LESSONS.every((l) => training.lessonsDone.includes(l.id)) ? { at: Math.max(0, ...lessonDates) || now } : null,
      progress: { have: LESSONS.filter((l) => training.lessonsDone.includes(l.id)).length, need: LESSONS.length },
    },
    'opening-line': { hit: Object.values(training.openingCards).some((c) => c.reps >= 2) ? { at: now } : null },
    'clean-10': { hit: cleanAt != null ? { at: cleanAt } : null },
    'skill-60': { hit: bestSkill >= 60 ? { at: now } : null, progress: { have: bestSkill, need: 60 } },
    'skill-80': { hit: bestSkill >= 80 ? { at: now } : null, progress: { have: bestSkill, need: 80 } },
  }
  for (const n of [10, 100, 500]) {
    check[`puzzles-${n}`] = { hit: results.length >= n ? { at: results[n - 1].at } : null, progress: { have: Math.min(results.length, n), need: n } }
  }
  for (const n of [3, 7, 30]) {
    check[`streak-${n}`] = { hit: streak.best >= n ? { at: now } : null, progress: { have: Math.min(streak.best, n), need: n } }
  }

  return BADGES.map((b) => {
    const c = check[b.id]
    const before = earned[b.id]
    const isEarned = before != null || !!c?.hit
    return {
      ...b,
      earned: isEarned,
      at: before ?? c?.hit?.at,
      progress: isEarned ? undefined : c?.progress,
    }
  })
}

/** Badges earned now that weren't in the saved list (to celebrate once). */
export function newlyEarned(badges: BadgeState[], earned: Record<string, number>): BadgeState[] {
  return badges.filter((b) => b.earned && earned[b.id] == null)
}
