import { describe, expect, it } from 'vitest'
import type { InfoLine } from './uci'
import { mulberry32, pickMove, strengthConfig } from './strength'
import { adjustmentFactor, nextRating } from './adaptive'

const line = (multipv: number, move: string, cp: number): InfoLine => ({ depth: 8, multipv, score: { type: 'cp', value: cp }, pv: [move] })
const lines = [line(1, 'e2e4', 50), line(2, 'd2d4', 40), line(3, 'g1f3', 30), line(4, 'a2a3', -150), line(5, 'g2g4', -400)]
const legal = ['e2e4', 'd2d4', 'g1f3', 'a2a3', 'g2g4', 'h2h3']

function freq(rating: number, n = 4000) {
  const cfg = strengthConfig(rating)
  const rng = mulberry32(42)
  const counts: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const m = pickMove(lines, legal, 'e2e4', cfg, rng)!
    counts[m] = (counts[m] ?? 0) + 1
  }
  return (m: string) => (counts[m] ?? 0) / n
}

describe('strengthConfig', () => {
  it('uses UCI_Elo at club level and above', () => {
    const c = strengthConfig(1800)
    expect(c.options).toMatchObject({ UCI_LimitStrength: true, UCI_Elo: 1800 })
    expect(c.temperature).toBe(0)
  })
  it('uses multi-line human-like picking below 1400', () => {
    const c = strengthConfig(600)
    expect(c.options).toMatchObject({ UCI_LimitStrength: false })
    expect(c.multipv).toBeGreaterThan(1)
    expect(c.temperature).toBeGreaterThan(strengthConfig(1200).temperature)
    expect(c.slipChance).toBeGreaterThan(strengthConfig(1200).slipChance)
  })
  it('clamps out-of-range ratings', () => {
    expect(strengthConfig(100)).toEqual(strengthConfig(400))
    expect(strengthConfig(9999).options.UCI_Elo).toBe(2500)
  })
})

describe('pickMove', () => {
  it('always plays the engine move at high level', () => {
    const f = freq(2000)
    expect(f('e2e4')).toBe(1)
  })
  it('beginner level spreads choices and sometimes blunders', () => {
    const f = freq(400)
    expect(f('e2e4')).toBeLessThan(0.5)
    expect(f('g2g4') + f('a2a3') + f('h2h3')).toBeGreaterThan(0.15)
  })
  it('1300 level mostly plays good moves but not always the best', () => {
    const f = freq(1300)
    expect(f('e2e4') + f('d2d4') + f('g1f3')).toBeGreaterThan(0.9)
    expect(f('e2e4')).toBeLessThan(0.8)
  })
  it('only returns legal moves', () => {
    const cfg = strengthConfig(400)
    const rng = mulberry32(1)
    for (let i = 0; i < 500; i++) expect(legal).toContain(pickMove([...lines, line(6, 'z9z9', 900)], legal, null, cfg, rng))
  })
  it('returns null with no legal moves', () => {
    expect(pickMove([], [], null, strengthConfig(800))).toBeNull()
  })
})

describe('adaptive difficulty', () => {
  it('moves up after a win, down after a loss, stays on a draw', () => {
    expect(nextRating(800, 1, 0)).toBe(860)
    expect(nextRating(800, 0, 0)).toBe(740)
    expect(nextRating(800, 0.5, 3)).toBe(800)
  })
  it('settles down with experience', () => {
    expect(adjustmentFactor(0)).toBe(120)
    expect(adjustmentFactor(20)).toBe(40)
  })
  it('stays within bounds', () => {
    expect(nextRating(420, 0, 0)).toBe(400)
    expect(nextRating(2490, 1, 0)).toBe(2500)
  })
})
