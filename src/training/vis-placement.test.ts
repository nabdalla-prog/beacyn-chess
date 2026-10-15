import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { mulberry32 } from '../engine/strength'
import { blindfoldTask, isLightSquare, squareQuiz } from './visualization'
import { coachStrengthFrom, EXPERIENCE, placementRating } from './placement'

describe('visualization', () => {
  it('square quiz gives valid squares without immediate repeats', () => {
    const q = squareQuiz(mulberry32(3), 30)
    expect(q).toHaveLength(30)
    expect(q.every((s, i) => /^[a-h][1-8]$/.test(s) && s !== q[i - 1])).toBe(true)
  })
  it('knows square colours', () => {
    expect(isLightSquare('a1')).toBe(false)
    expect(isLightSquare('h1')).toBe(true)
    expect(isLightSquare('e4')).toBe(true)
    expect(isLightSquare('d4')).toBe(false)
  })
  it('blindfold answers match the real final position', () => {
    const rng = mulberry32(11)
    for (let t = 0; t < 40; t++) {
      const task = blindfoldTask(rng, 4 + (t % 5))
      const c = new Chess()
      for (const m of task.moves) c.move(m)
      expect(c.fen()).toBe(task.fen)
      expect(c.get(task.answer)?.type, task.question).toBe(task.piece)
      expect(task.question).toMatch(/^Where is (White|Black)’s \w+ now\?/)
    }
  })
})

describe('placement', () => {
  it('solving harder and harder puzzles raises the estimate a lot', () => {
    const r = placementRating(700, [700, 900, 1100, 1300, 1500].map((rating) => ({ rating, clean: true })))
    expect(r).toBeGreaterThan(1200)
  })
  it('a mixed run settles near the puzzles’ level', () => {
    const r = placementRating(1100, [
      { rating: 1100, clean: true },
      { rating: 1300, clean: false },
      { rating: 1200, clean: true },
      { rating: 1350, clean: false },
      { rating: 1250, clean: true },
    ])
    expect(r).toBeGreaterThan(1150)
    expect(r).toBeLessThan(1350)
  })
  it('missing easy puzzles lowers it', () => {
    expect(placementRating(1100, [900, 700, 600].map((rating) => ({ rating, clean: false })))).toBeLessThan(800)
  })
  it('stays in range and maps to a coach strength', () => {
    expect(placementRating(400, Array.from({ length: 5 }, () => ({ rating: 400, clean: false })))).toBe(400)
    expect(coachStrengthFrom(1234)).toBe(1250)
    expect(coachStrengthFrom(3000)).toBe(2000)
    expect(EXPERIENCE.map((e) => e.prior)).toEqual([400, 700, 1100, 1500])
  })
})
