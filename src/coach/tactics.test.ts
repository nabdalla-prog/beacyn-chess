import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { lineGain, tacticTags, threatsAgainst, type TagInput } from './tactics'

const KNIGHT_HANGS = '4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1' // d6 pawn attacks the e5 knight
const BACK_RANK = 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1' // ...Ra1 is mate
const FORK_THREAT = '4k3/8/8/8/3n4/8/8/R3K3 w - - 0 1' // ...Nc2+ forks king and rook
const FORK_FOR_WHITE = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1' // Nc7+ forks king and rook

function tags(fen: string, uci: string, over: Partial<TagInput> = {}) {
  const before = new Chess(fen)
  const after = new Chess(fen)
  const move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) })
  return tacticTags({ before, move, after, cls: 'best', isTop: true, hadMate: false, line: [uci], concepts: [], ...over })
}

describe('threatsAgainst', () => {
  it('sees a piece the opponent can win', () => {
    expect(threatsAgainst(new Chess(KNIGHT_HANGS), 'w')).toEqual([{ motif: 'hanging', squares: ['e5'], move: 'd6e5' }])
  })
  it('sees a mate in one', () => {
    expect(threatsAgainst(new Chess(BACK_RANK), 'w')).toContainEqual({ motif: 'mate', squares: ['g1'], move: 'a8a1' })
  })
  it('sees a safe fork of king and rook', () => {
    expect(threatsAgainst(new Chess(FORK_THREAT), 'w')).toContainEqual({ motif: 'fork', squares: ['a1', 'e1'], move: 'd4c2' })
  })
  it('a quiet position has no threats', () => {
    expect(threatsAgainst(new Chess(), 'w')).toEqual([])
  })
})

describe('lineGain', () => {
  it('measures material once the line goes quiet', () => {
    expect(lineGain(FORK_FOR_WHITE, ['b5c7', 'e8d7', 'c7a8'], 'w')).toBe(500)
    expect(lineGain(FORK_FOR_WHITE, ['b5c7', 'e8d7'], 'w')).toBe(0)
  })
})

describe('found tactics', () => {
  const fork = { concepts: ['fork'], line: ['b5c7', 'e8d7', 'c7a8'] }
  it('counts the engine’s fork when the line wins material', () => {
    expect(tags(FORK_FOR_WHITE, 'b5c7', fork)).toEqual([{ motif: 'fork', outcome: 'found' }])
  })
  it('does not count a fork that is not the engine’s choice', () => {
    expect(tags(FORK_FOR_WHITE, 'b5c7', { ...fork, isTop: false, cls: 'good' })).toEqual([])
  })
  it('does not count a "fork" the engine line shows wins nothing', () => {
    expect(tags(FORK_FOR_WHITE, 'b5c7', { concepts: ['fork'], line: ['b5c7', 'e8d7'] })).toEqual([])
  })
  it('counts checkmate as a found mating pattern', () => {
    // 1.f3 e5 2.g4 — Black plays Qh4#.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2'
    expect(tags(fen, 'd8h4', { concepts: ['checkmate'] })).toEqual([{ motif: 'mate', outcome: 'found' }])
  })
})

describe('defended threats', () => {
  it('moving the attacked knight to safety is a defense', () => {
    expect(tags(KNIGHT_HANGS, 'e5f3', { cls: 'good', isTop: false })).toEqual([{ motif: 'hanging', outcome: 'defended' }])
  })
  it('no credit when the threat is still there afterwards', () => {
    expect(tags(KNIGHT_HANGS, 'e1d1', { cls: 'good', isTop: false })).toEqual([])
  })
  it('making luft against a back-rank mate is a defense', () => {
    expect(tags(BACK_RANK, 'h2h3', { cls: 'good', isTop: false })).toContainEqual({ motif: 'mate', outcome: 'defended' })
  })
  it('stepping out of a fork threat is a defense', () => {
    expect(tags(FORK_THREAT, 'a1a8', { cls: 'best' })).toContainEqual({ motif: 'fork', outcome: 'defended' })
  })
})

describe('errors', () => {
  it('a hanging piece is a failed defense, a missed fork is a miss', () => {
    expect(tags(KNIGHT_HANGS, 'e1d1', { cls: 'blunder', isTop: false, concepts: ['hanging-piece', 'missed-fork'] })).toEqual([
      { motif: 'fork', outcome: 'missed' },
      { motif: 'hanging', outcome: 'failed-defense' },
    ])
  })
  it('errors never count as found or defended, even with a threat around', () => {
    const t = tags(KNIGHT_HANGS, 'e1d1', { cls: 'mistake', isTop: false })
    expect(t.some((x) => x.outcome === 'found' || x.outcome === 'defended')).toBe(false)
  })
})
