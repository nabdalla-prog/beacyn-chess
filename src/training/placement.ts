// Two-minute placement: a self-rating question, then a few puzzles that adapt
// up or down. Sets the coach's starting strength and the puzzle rating.

export const EXPERIENCE = [
  { id: 'new', label: 'I’m new to chess', prior: 400 },
  { id: 'rules', label: 'I know the rules', prior: 700 },
  { id: 'casual', label: 'I play casually', prior: 1100 },
  { id: 'club', label: 'I play in a club or online a lot', prior: 1500 },
] as const

export type ExperienceId = (typeof EXPERIENCE)[number]['id']

export const PLACEMENT_PUZZLES = 5
/** Big steps first, smaller later, so 5 puzzles move the estimate a long way. */
const K = [280, 220, 170, 130, 100]

export function placementRating(prior: number, results: { rating: number; clean: boolean }[]): number {
  let r = prior
  results.forEach((p, i) => {
    const expected = 1 / (1 + Math.pow(10, (p.rating - r) / 400))
    r += (K[i] ?? 60) * ((p.clean ? 1 : 0) - expected)
  })
  return Math.round(Math.max(400, Math.min(2200, r)))
}

/** Coach strength from the estimate: round to 50, kept within the slider range. */
export const coachStrengthFrom = (estimate: number) => Math.max(400, Math.min(2000, Math.round(estimate / 50) * 50))
