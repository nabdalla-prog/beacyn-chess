import { describe, expect, it } from 'vitest'
import type { InfoLine } from '../engine/uci'
import { importPgn } from '../game/session'
import { hasUntaggedVerdicts, initialEvals, isAnalysed, withAnalysis } from './gameAnalysis'

const L = (pv: string, cp: number | null, mate?: number): InfoLine[] => [
  { depth: 12, multipv: 1, score: mate != null ? { type: 'mate', value: mate } : { type: 'cp', value: cp! }, pv: pv.split(' ') },
]

describe('withAnalysis', () => {
  const g = importPgn('1. f3 e5 2. g4 Qh4# 0-1', 'w', 0)
  const evals = [L('e2e4 e7e5', 30), L('e7e5 e2e4', 60), L('e2e4 b8c6', -80), L('d8h4', null, 1), []]

  it('stores progress without touching moves until complete', () => {
    const partial = withAnalysis(g, [evals[0], evals[1], null, null, null])
    expect(partial.moves.every((m) => !m.review)).toBe(true)
    expect(isAnalysed(partial)).toBe(false)
    expect(initialEvals(partial).slice(0, 2)).toEqual(evals.slice(0, 2))
  })

  it('when complete, gives every user move a verdict (and only user moves)', () => {
    const done = withAnalysis(g, evals)
    expect(isAnalysed(done)).toBe(true)
    expect(done.moves.map((m) => m.review?.cls ?? null)).toEqual(['inaccuracy', null, 'blunder', null])
    expect(done.moves[2].review?.concepts).toContain('allowed-mate')
    expect(done.moves[2].review?.text).toContain('allows mate in 1')
  })

  it('keeps tagged verdicts the user already saw during the game', () => {
    const seen = { ...g, moves: g.moves.map((m, i) => (i === 0 ? { ...m, review: { cls: 'good' as const, loss: 3, concepts: [], tags: [] } } : m)) }
    expect(withAnalysis(seen, evals).moves[0].review?.cls).toBe('good')
  })

  it('re-judges verdicts from before tactic tags existed', () => {
    const old = { ...g, moves: g.moves.map((m, i) => (i === 2 ? { ...m, review: { cls: 'blunder' as const, loss: 40, concepts: ['allowed-mate'] } } : m)) }
    expect(hasUntaggedVerdicts(old)).toBe(true)
    const updated = withAnalysis(old, evals)
    expect(hasUntaggedVerdicts(updated)).toBe(false)
    expect(updated.moves[2].review?.tags).toEqual([{ motif: 'mate', outcome: 'failed-defense' }])
  })
})
