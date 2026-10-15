// Daily training plan from the skill profile: missed puzzles due for review,
// the user's own mistakes, themed puzzles for the weakest tactic, and a game.
import type { SkillId, SkillScore } from '../coach/skills'
import { MOTIF_THEMES, type Theme } from './puzzles'

export type PlanItem =
  | { id: string; kind: 'review'; target: number; done: number }
  | { id: string; kind: 'own'; target: number; done: number }
  | { id: string; kind: 'theme'; theme: Theme; reason: string; target: number; done: number }
  | { id: string; kind: 'openings'; target: number; done: number }
  | { id: string; kind: 'game'; target: number; done: number }

export interface DailyPlan {
  date: string
  items: PlanItem[]
}

export const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Puzzle theme that actually trains a weak skill, or null. Openings, middlegame,
 * endgames and time use aren't trained by tactic puzzles (opening and endgame
 * drills come with M6), so they get no themed set.
 */
export function themeFor(skill: SkillId): Theme | null {
  const t = MOTIF_THEMES[skill]
  if (t) return t[0]
  if (skill === 'blunders') return 'hangingPiece'
  if (skill === 'calculation') return 'mateIn2'
  return null
}

export interface PlanInput {
  now: number
  dueReviews: number
  ownMistakes: number
  /** Opening lines due for review (spaced repetition). */
  dueOpenings?: number
  weakest: SkillScore[]
}

export function buildPlan({ now, dueReviews, ownMistakes, weakest, dueOpenings = 0 }: PlanInput): DailyPlan {
  const items: PlanItem[] = []
  if (dueReviews > 0) items.push({ id: 'review', kind: 'review', target: Math.min(10, dueReviews), done: 0 })
  if (ownMistakes > 0) items.push({ id: 'own', kind: 'own', target: Math.min(5, ownMistakes), done: 0 })
  if (dueOpenings > 0) items.push({ id: 'openings', kind: 'openings', target: Math.min(3, dueOpenings), done: 0 })

  // Up to two themed sets for weak skills that puzzles really train, weakest first.
  const themes: { theme: Theme; reason: string }[] = []
  for (const w of weakest) {
    const theme = themeFor(w.skill)
    if (theme && !themes.some((t) => t.theme === theme)) themes.push({ theme, reason: w.skill })
    if (themes.length === 2) break
  }
  // Top up with general tactics so there's always something to solve.
  for (const theme of ['mateIn1', 'hangingPiece', 'fork'] as Theme[]) {
    if (themes.length >= 2) break
    if (!themes.some((t) => t.theme === theme)) themes.push({ theme, reason: 'general' })
  }
  themes.forEach((t, i) => items.push({ id: `theme:${t.theme}`, kind: 'theme', theme: t.theme, reason: t.reason, target: i === 0 ? 10 : 5, done: 0 }))

  items.push({ id: 'game', kind: 'game', target: 1, done: 0 })
  return { date: dayKey(now), items }
}

/** Today's plan: keep yesterday's progress only if it's still today. */
export function todaysPlan(saved: DailyPlan | null, input: PlanInput): DailyPlan {
  if (saved && saved.date === dayKey(input.now)) return saved
  return buildPlan(input)
}

export function markProgress(plan: DailyPlan, itemId: string, by = 1): DailyPlan {
  return { ...plan, items: plan.items.map((i) => (i.id === itemId ? { ...i, done: Math.min(i.target, i.done + by) } : i)) }
}

export const planDone = (plan: DailyPlan) => plan.items.every((i) => i.done >= i.target)
