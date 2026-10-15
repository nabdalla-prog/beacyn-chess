import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { InfoLine } from '../engine/uci'
import { newGame, type GameRecord } from '../game/session'
import { buildReview, fromStored, moveAccuracy, toStored } from './review'
import { identifyOpening, makeBook } from './openings'

const L = (pv: string, cp: number | null, mate?: number): InfoLine[] => [
  { depth: 12, multipv: 1, score: mate != null ? { type: 'mate', value: mate } : { type: 'cp', value: cp! }, pv: pv.split(' ') },
]

function game(sans: [string, string][], userColor: 'w' | 'b' = 'w'): GameRecord {
  const g = newGame({ userColor, rating: 800, timeControl: null, now: 0 })
  return {
    ...g,
    moves: sans.map(([uci, san], i) => ({ uci, san, timeMs: 0, by: (i % 2 === 0) === (userColor === 'w') ? 'user' : 'engine' })),
  }
}

describe('moveAccuracy', () => {
  it('is 100 for no loss and falls with bigger losses', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0)
    expect(moveAccuracy(60, 50)).toBeLessThan(70)
    expect(moveAccuracy(80, 10)).toBeLessThan(10)
    expect(moveAccuracy(40, 45)).toBeCloseTo(100, 0) // gains count as no loss
  })
})

// 1.f3 e5 2.g4?? Qh4#  — user is White.
const foolsMate = game([
  ['f2f3', 'f3'],
  ['e7e5', 'e5'],
  ['g2g4', 'g4'],
  ['d8h4', 'Qh4#'],
])
const foolsEvals = [
  L('e2e4 e7e5', 30), // start, White to move
  L('e7e5 e2e4', 60), // after f3, Black to move (Black is better)
  L('e2e4 b8c6', -80), // after e5, White to move
  L('d8h4', null, 1), // after g4, Black mates in 1
  [], // final position: checkmate
]

describe('buildReview', () => {
  const r = buildReview(foolsMate, foolsEvals)
  it('reviews every move and is complete', () => {
    expect(r.complete).toBe(true)
    expect(r.moves.map((m) => m.cls)).toEqual(['inaccuracy', 'best', 'blunder', 'best'])
  })
  it('counts classes per side', () => {
    expect(r.counts.w.blunder).toBe(1)
    expect(r.counts.w.inaccuracy).toBe(1)
    expect(r.counts.b.best).toBe(2)
  })
  it('accuracy is high for the winner and low for the blunderer', () => {
    expect(r.accuracy.b!).toBeGreaterThan(95)
    expect(r.accuracy.w!).toBeLessThan(60)
  })
  it('builds the eval series from White’s view', () => {
    expect(r.series).toHaveLength(5)
    expect(r.series[0].white).toBeGreaterThan(50)
    expect(r.series[4].white).toBe(0) // White is mated
  })
  it('key moments include the blunder with a retry position', () => {
    const k = r.keyMoments.find((m) => m.ply === 2)!
    expect(k.kind).toBe('error')
    expect(k.playedSan).toBe('g4')
    expect(k.bestSan).toBe('e4')
    expect(k.fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2')
    expect(k.text).toContain('allows mate in 1')
  })
  it('stops at the first missing evaluation', () => {
    const partial = buildReview(foolsMate, foolsEvals.slice(0, 3))
    expect(partial.moves).toHaveLength(2)
    expect(partial.complete).toBe(false)
  })
  it('round-trips stored evals', () => {
    expect(fromStored(toStored(foolsEvals[0]))).toEqual(foolsEvals[0])
    expect(fromStored(toStored([]))).toEqual([])
    expect(fromStored(undefined)).toBeNull()
  })
})

describe('openings', () => {
  const data = JSON.parse(readFileSync(new URL('../../public/openings.json', import.meta.url), 'utf8'))
  const book = makeBook(data)
  it('names the Italian Game and finds where theory ended', () => {
    const g = game([
      ['e2e4', 'e4'],
      ['e7e5', 'e5'],
      ['g1f3', 'Nf3'],
      ['b8c6', 'Nc6'],
      ['f1c4', 'Bc4'],
      ['a7a5', 'a5'],
      ['h2h3', 'h3'],
    ])
    const o = identifyOpening(g, book)!
    expect(o).toEqual({ eco: 'C50', name: 'Italian Game', theoryPlies: 5, leftBy: 'engine', leftSan: 'a5', leftMoveNumber: 3 })
  })
  it('recognises a transposition', () => {
    // 1.Nf3 Nc6 2.e4 e5 reaches the same position as 1.e4 e5 2.Nf3 Nc6.
    const g = game([
      ['g1f3', 'Nf3'],
      ['b8c6', 'Nc6'],
      ['e2e4', 'e4'],
      ['e7e5', 'e5'],
    ])
    expect(identifyOpening(g, book)?.name).toBe("King's Knight Opening: Normal Variation")
  })
  it('fool’s mate is a named line', () => {
    expect(identifyOpening(foolsMate, book)).toMatchObject({ eco: 'A00', name: "Barnes Opening: Fool's Mate", theoryPlies: 4, leftBy: null })
  })
})
