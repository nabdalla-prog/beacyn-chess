// SM-2 spaced repetition (the classic SuperMemo-2 algorithm) for missed puzzles
// and, later, opening lines.

export const DAY = 24 * 60 * 60 * 1000

export interface Card {
  id: string
  /** Ease factor, starts at 2.5, never below 1.3. */
  ease: number
  /** Days until the next review. */
  interval: number
  /** Successful reviews in a row. */
  reps: number
  lapses: number
  due: number
}

export function newCard(id: string, now: number): Card {
  return { id, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now }
}

/** Apply one review with quality 0–5 (≥ 3 = remembered). */
export function reviewCard(card: Card, quality: number, now: number): Card {
  const q = Math.max(0, Math.min(5, Math.round(quality)))
  const ease = Math.max(1.3, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (q < 3) return { ...card, ease, reps: 0, interval: 1, lapses: card.lapses + 1, due: now + DAY }
  const reps = card.reps + 1
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(card.interval * ease)
  return { ...card, ease, reps, interval, due: now + interval * DAY }
}

export function dueCards(cards: Card[], now: number): Card[] {
  return cards.filter((c) => c.due <= now).sort((a, b) => a.due - b.due)
}

export interface Attempt {
  solved: boolean
  wrongTries: number
  /** Highest hint level used (0 = none). Level 3 shows the move. */
  hintLevel: number
  revealed: boolean
}

/** SM-2 quality from how a puzzle went. */
export function qualityOf(a: Attempt): number {
  if (a.revealed || !a.solved) return 1
  // Any wrong move, or being shown the move, means it wasn't remembered (< 3 resets the card).
  if (a.hintLevel >= 3 || a.wrongTries >= 1) return 2
  if (a.hintLevel === 2) return 3
  if (a.hintLevel === 1) return 4
  return 5
}

/** Clean = solved first try with no hint: the only result that counts as a skill success. */
export const isClean = (a: Attempt) => a.solved && !a.revealed && a.wrongTries === 0 && a.hintLevel === 0
