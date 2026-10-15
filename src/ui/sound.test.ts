import { describe, expect, it } from 'vitest'
import { read } from '@lichess-org/chessground/fen'
import { moveSound } from './sound'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

describe('moveSound', () => {
  it('a quiet move', () => expect(moveSound(read(START), 'e2', 'e4', false)).toBe('move'))
  it('a capture', () => expect(moveSound(read('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR'), 'e4', 'd5', false)).toBe('capture'))
  it('en passant counts as a capture', () =>
    expect(moveSound(read('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR'), 'e5', 'f6', false)).toBe('capture'))
  it('castling, either notation', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R'
    expect(moveSound(read(fen), 'e1', 'g1', false)).toBe('castle')
    expect(moveSound(read(fen), 'e1', 'h1', false)).toBe('castle')
  })
  it('check wins over capture', () => expect(moveSound(read('4k3/8/8/8/8/8/4q3/R3K3'), 'a1', 'a8', true)).toBe('check'))
  it('no sound when the move does not fit the previous position', () => expect(moveSound(read(START), 'e4', 'e5', false)).toBeNull())
})
