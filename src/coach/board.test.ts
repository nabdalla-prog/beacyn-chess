import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import {
  backRankWeak,
  discoveredAttacks,
  doubledFiles,
  forkAt,
  hangingPieces,
  isolatedPawns,
  lineTacticsFrom,
  passedPawns,
  see,
  trappedPieces,
  uciLineToSan,
} from './board'

const pos = (fen: string) => new Chess(fen, { skipValidation: true })

describe('static exchange evaluation', () => {
  it('wins an undefended piece', () => {
    expect(see(pos('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5', 'w')).toBe(300)
  })
  it('pawn takes a defended knight: still +2', () => {
    expect(see(pos('4k3/8/4p3/3n4/4P3/8/8/4K3 w - - 0 1'), 'd5', 'w')).toBe(200)
  })
  it('queen should not take a pawn-defended knight', () => {
    expect(see(pos('4k3/8/4p3/3n4/8/8/8/3QK3 w - - 0 1'), 'd5', 'w')).toBe(0)
  })
  it('counts x-ray recaptures', () => {
    expect(see(pos('3r1rk1/8/8/8/8/8/3R4/3RK3 w - - 0 1'), 'd8', 'w')).toBe(500)
  })
})

describe('tactical detectors', () => {
  it('finds a hanging knight', () => {
    const h = hangingPieces(pos('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'b')
    expect(h).toEqual([{ square: 'd5', piece: 'n', color: 'b', gain: 300, defended: false }])
  })
  it('a defended piece attacked by a bigger piece is not hanging', () => {
    expect(hangingPieces(pos('4k3/8/4p3/3n4/8/8/8/3QK3 w - - 0 1'), 'b')).toEqual([])
  })
  it('finds a knight fork of king and rook', () => {
    const f = forkAt(pos('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1'), 'c7')
    expect(f?.targets.map((t) => t.square).sort()).toEqual(['a8', 'e8'])
  })
  it('no fork when the forking piece is simply lost', () => {
    expect(forkAt(pos('r2qk3/2N5/8/8/8/8/8/4K3 b - - 0 1'), 'c7')).toBeNull() // queen d8 takes the knight
  })
  it('king plus a loose pawn is not a fork', () => {
    // Queen c2 checks the king on d1 and hits the pawn on b2.
    expect(forkAt(pos('4k3/8/8/8/8/8/1Pq5/3K4 w - - 0 1'), 'c2')).toBeNull()
  })
  it('finds an absolute pin', () => {
    const t = lineTacticsFrom(pos('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1'), 'b5')
    expect(t).toEqual([expect.objectContaining({ kind: 'pin', absolute: true, front: { square: 'c6', piece: 'n' }, back: { square: 'e8', piece: 'k' } })])
  })
  it('finds a skewer through the king', () => {
    const t = lineTacticsFrom(pos('7q/8/8/7k/8/8/8/4K2R b - - 0 1'), 'h1')
    expect(t).toEqual([expect.objectContaining({ kind: 'skewer', front: { square: 'h5', piece: 'k' }, back: { square: 'h8', piece: 'q' } })])
  })
  it('finds a discovered attack on the queen', () => {
    const c = new Chess('4k3/4q3/8/8/4N3/8/8/K3R3 w - - 0 1')
    const m = c.move('Nc5')
    expect(discoveredAttacks(c, m)).toEqual([{ from: 'e1', attacker: 'r', target: { square: 'e7', piece: 'q' }, check: false }])
  })
  it('detects a weak back rank', () => {
    const c = pos('6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1')
    expect(backRankWeak(c, 'b')).toBe(true)
    expect(backRankWeak(c, 'w')).toBe(false) // Black has no rook or queen
    expect(backRankWeak(pos('6k1/5pp1/7p/8/8/8/5PPP/3R2K1 b - - 0 1'), 'b')).toBe(false) // luft on h7
  })
  it('detects a trapped bishop', () => {
    expect(trappedPieces(pos('r3k3/B1p5/1p6/8/8/8/8/4K3 w - - 0 1'), 'w')).toEqual([{ square: 'a7', piece: 'b' }])
    expect(trappedPieces(pos('r3k3/B7/1p6/8/8/8/8/4K3 w - - 0 1'), 'w')).toEqual([]) // Bxb6 escapes
  })
})

describe('pawn structure', () => {
  const c = pos('4k3/p7/8/3P4/8/2P5/2P2PP1/4K3 w - - 0 1')
  it('doubled', () => expect(doubledFiles(c, 'w')).toEqual(['c']))
  it('isolated', () => expect(isolatedPawns(c, 'w').sort()).toEqual([]))
  it('isolated pawn on a', () => expect(isolatedPawns(c, 'b')).toEqual(['a7']))
  it('blocked by an enemy pawn on an adjacent file', () => expect(passedPawns(pos('4k3/1p6/8/2P5/8/8/8/4K3 w - - 0 1'), 'w')).toEqual([]))
  it('passed', () => expect(passedPawns(c, 'w').sort()).toEqual(['c2', 'c3', 'd5', 'f2', 'g2']))
})

describe('uciLineToSan', () => {
  it('converts and stops at illegal moves', () => {
    const r = uciLineToSan(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3', 'zzzz'])
    expect(r.san).toEqual(['e4', 'e5', 'Nf3'])
    expect(r.fens).toHaveLength(4)
  })
})

describe('endgame facts', () => {
  it('opposition: the side not to move has it', async () => {
    const { opposition } = await import('./board')
    expect(opposition(pos('4k3/8/4K3/8/8/8/8/8 b - - 0 1'))).toEqual({ kind: 'direct', holder: 'w' })
    expect(opposition(pos('4k3/8/4K3/8/8/8/8/8 w - - 0 1'))).toEqual({ kind: 'direct', holder: 'b' })
    expect(opposition(pos('4k3/8/8/8/4K3/8/8/8 b - - 0 1'))).toEqual({ kind: 'distant', holder: 'w' })
    expect(opposition(pos('4k3/8/8/4K3/8/8/8/8 b - - 0 1'))).toBeNull() // two squares between
    expect(opposition(pos('4k3/8/3K4/8/8/8/8/8 b - - 0 1'))).toBeNull() // not on a line
  })
  it('king centrality', async () => {
    const { kingCentrality } = await import('./board')
    expect(kingCentrality(pos('7k/8/8/8/4K3/8/8/8 w - - 0 1'), 'w')).toBe(0)
    expect(kingCentrality(pos('7k/8/8/8/4K3/8/8/8 w - - 0 1'), 'b')).toBe(3)
  })
  it('rook behind a passed pawn (own or enemy), not in front', async () => {
    const { rooksBehindPassedPawns } = await import('./board')
    expect(rooksBehindPassedPawns(pos('6k1/8/8/P7/8/8/8/R5K1 w - - 0 1'), 'w')).toEqual([{ rook: 'a1', pawn: 'a5' }])
    expect(rooksBehindPassedPawns(pos('R5k1/8/8/P7/8/8/8/6K1 w - - 0 1'), 'w')).toEqual([]) // in front
    expect(rooksBehindPassedPawns(pos('r5k1/8/8/P7/8/8/8/6K1 b - - 0 1'), 'b')).toEqual([]) // black rook in front of the white pawn
    expect(rooksBehindPassedPawns(pos('6k1/8/8/P7/8/8/8/r5K1 b - - 0 1'), 'b')).toEqual([{ rook: 'a1', pawn: 'a5' }]) // behind the enemy passer
    expect(rooksBehindPassedPawns(pos('6k1/8/8/P7/8/8/N7/R5K1 w - - 0 1'), 'w')).toEqual([]) // blocked
  })
  it('rule of the square', async () => {
    const { kingCatchesPawn } = await import('./board')
    // White pawn a5 needs 3 moves. Black king on d5 is inside the square.
    expect(kingCatchesPawn(pos('8/8/8/P2k4/8/8/8/7K w - - 0 1'), 'a5', 'b')).toBe(true)
    // e5 is just outside: catches only if Black moves first.
    expect(kingCatchesPawn(pos('8/8/8/P3k3/8/8/8/7K b - - 0 1'), 'a5', 'b')).toBe(true)
    expect(kingCatchesPawn(pos('8/8/8/P3k3/8/8/8/7K w - - 0 1'), 'a5', 'b')).toBe(false)
    // A pawn on its starting square can double-step: from a2 it needs 5 moves.
    expect(kingCatchesPawn(pos('8/8/8/8/5k2/8/P7/7K w - - 0 1'), 'a2', 'b')).toBe(true) // f4: ...Kb7 takes the new queen
    expect(kingCatchesPawn(pos('8/8/8/8/6k1/8/P7/7K w - - 0 1'), 'a2', 'b')).toBe(false) // g4 is one step too far
  })
})
