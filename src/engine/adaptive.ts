// Adaptive difficulty: nudge the opponent toward a ~50% score for the user.
import { clampRating } from './strength'

/** Score from the user's point of view: 1 win, 0.5 draw, 0 loss. */
export type UserScore = 0 | 0.5 | 1

export function adjustmentFactor(gamesPlayed: number): number {
  return Math.max(40, 120 - 10 * gamesPlayed)
}

export function nextRating(rating: number, score: UserScore, gamesPlayed: number): number {
  return clampRating(rating + adjustmentFactor(gamesPlayed) * (score - 0.5))
}
