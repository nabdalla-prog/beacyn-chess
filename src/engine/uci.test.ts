import { describe, expect, it } from 'vitest'
import { formatScore, parseBestMove, parseInfo, scoreToCp, toWhitePov } from './uci'

describe('parseInfo', () => {
  it('parses a multipv cp line', () => {
    const l = parseInfo('info depth 10 seldepth 14 multipv 2 score cp -33 nodes 10052 nps 300000 time 33 pv e7e6 d2d4 d7d5')
    expect(l).toEqual({ depth: 10, multipv: 2, score: { type: 'cp', value: -33 }, bound: undefined, nodes: 10052, timeMs: 33, pv: ['e7e6', 'd2d4', 'd7d5'] })
  })
  it('parses mate scores and bounds', () => {
    const l = parseInfo('info depth 5 multipv 1 score mate -2 upperbound nodes 10 pv h7h8')
    expect(l?.score).toEqual({ type: 'mate', value: -2 })
    expect(l?.bound).toBe('upper')
  })
  it('ignores lines without a pv', () => {
    expect(parseInfo('info string NNUE evaluation enabled')).toBeNull()
    expect(parseInfo('info depth 1 currmove e2e4 currmovenumber 1')).toBeNull()
  })
})

describe('scores', () => {
  it('reads bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove (none)')).toBeNull()
  })
  it('flips to white point of view', () => {
    expect(toWhitePov({ type: 'cp', value: 50 }, 'b')).toEqual({ type: 'cp', value: -50 })
    expect(toWhitePov({ type: 'cp', value: 50 }, 'w')).toEqual({ type: 'cp', value: 50 })
  })
  it('orders mates above any cp and shorter mates higher', () => {
    expect(scoreToCp({ type: 'mate', value: 1 })).toBeGreaterThan(scoreToCp({ type: 'mate', value: 3 }))
    expect(scoreToCp({ type: 'mate', value: 3 })).toBeGreaterThan(scoreToCp({ type: 'cp', value: 5000 }))
    expect(scoreToCp({ type: 'mate', value: -1 })).toBeLessThan(scoreToCp({ type: 'cp', value: -5000 }))
  })
  it('formats', () => {
    expect(formatScore({ type: 'cp', value: 123 })).toBe('+1.2')
    expect(formatScore({ type: 'mate', value: -3 })).toBe('-M3')
  })
})
