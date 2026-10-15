// Training progress, stored in this browser's IndexedDB (key-value store).
import { getKv, setKv } from '../storage/db'
import type { PuzzleResult } from '../coach/skills'
import { isClean, newCard, qualityOf, reviewCard, type Attempt, type Card } from './srs'
import { dayKey, markProgress, type DailyPlan } from './plan'
import { nextPuzzleRating, type TrainPuzzle } from './puzzles'

export interface SrsEntry extends Card {
  puzzle: TrainPuzzle
}

export interface TrainingState {
  cards: Record<string, SrsEntry>
  results: (PuzzleResult & { rating?: number })[]
  /** Puzzle rating; null until the first rated puzzle (then it starts from the play rating). */
  rating: number | null
  seen: string[]
  plan: DailyPlan | null
  /** Spaced-repetition cards for opening lines, keyed by line id. */
  openingCards: Record<string, Card>
  /** Lessons finished. */
  lessonsDone: string[]
  /** When each lesson was finished (added in M7; older lessons have no date). */
  lessonsAt: Record<string, number>
  /** Endgame drill results (added in M7). */
  drills: DrillResult[]
  /** Local days ("2026-10-15") with any training, for the day streak. Games count from their own dates. */
  activeDays: string[]
}

export interface DrillResult {
  id: string
  won: boolean
  /** The user delivered checkmate. */
  mate: boolean
  at: number
}

const KEY = 'training'
const MAX_RESULTS = 3000
const MAX_SEEN = 4000
const MAX_DRILLS = 500
const MAX_DAYS = 800

export const emptyTraining = (): TrainingState => ({
  cards: {},
  results: [],
  rating: null,
  seen: [],
  plan: null,
  openingCards: {},
  lessonsDone: [],
  lessonsAt: {},
  drills: [],
  activeDays: [],
})

/** Notes today as a training day. */
export function markActive(s: TrainingState, now: number): TrainingState {
  const day = dayKey(now)
  return s.activeDays.at(-1) === day || s.activeDays.includes(day) ? s : { ...s, activeDays: [...s.activeDays, day].slice(-MAX_DAYS) }
}

export async function loadTraining(): Promise<TrainingState> {
  return { ...emptyTraining(), ...(await getKv<Partial<TrainingState>>(KEY, {})) }
}

export const saveTraining = (s: TrainingState) => setKv(KEY, s)

/**
 * Pure state update after a puzzle: result log (feeds tactic scores), spaced-
 * repetition card (missed puzzles get one; due ones are rescheduled), puzzle
 * rating (Lichess puzzles only), seen list and plan progress.
 */
export function applyAttempt(s: TrainingState, p: TrainPuzzle, a: Attempt, now: number, startRating: number, planItem?: string): TrainingState {
  const clean = isClean(a)
  const results = [...s.results, { puzzleId: p.id, themes: p.themes, clean, at: now, rating: p.rating }].slice(-MAX_RESULTS)
  const cards = { ...s.cards }
  const existing = cards[p.id]
  if (existing) cards[p.id] = { ...reviewCard(existing, qualityOf(a), now), puzzle: p }
  else if (!clean) cards[p.id] = { ...reviewCard(newCard(p.id, now), qualityOf(a), now), puzzle: p }
  let rating = s.rating
  if (p.source === 'lichess' && p.rating != null) rating = nextPuzzleRating(rating ?? startRating, p.rating, clean)
  const seen = s.seen.includes(p.id) ? s.seen : [...s.seen, p.id].slice(-MAX_SEEN)
  const plan = s.plan && planItem ? markProgress(s.plan, planItem) : s.plan
  return markActive({ ...s, results, cards, rating, seen, plan }, now)
}

/** After drilling an opening line: schedule it (SM-2). No mistakes = 5, one = 2 (relearn), more = 1. */
export function applyOpeningDrill(s: TrainingState, lineId: string, mistakes: number, now: number): TrainingState {
  const card = s.openingCards[lineId] ?? newCard(lineId, now)
  const quality = mistakes === 0 ? 5 : mistakes === 1 ? 2 : 1
  const plan = s.plan ? markProgress(s.plan, 'openings') : s.plan
  return markActive({ ...s, openingCards: { ...s.openingCards, [lineId]: reviewCard(card, quality, now) }, plan }, now)
}

export function completeLesson(s: TrainingState, id: string, now = Date.now()): TrainingState {
  const done = s.lessonsDone.includes(id) ? s : { ...s, lessonsDone: [...s.lessonsDone, id], lessonsAt: { ...s.lessonsAt, [id]: now } }
  return markActive(done, now)
}

export function recordDrill(s: TrainingState, r: DrillResult): TrainingState {
  return markActive({ ...s, drills: [...s.drills, r].slice(-MAX_DRILLS) }, r.at)
}
