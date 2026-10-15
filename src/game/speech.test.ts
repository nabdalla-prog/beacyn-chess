import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { describeMove, describeSquare } from './speech'

const say = (fen: string | undefined, san: string) => describeMove(new Chess(fen).move(san))

describe('describeMove', () => {
  it('names the piece and square', () => {
    expect(say(undefined, 'Nf3')).toBe('White knight to f3')
    expect(say(undefined, 'e4')).toBe('White pawn to e4')
  })
  it('says what was taken', () => {
    expect(say('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'exd5')).toBe('White pawn takes pawn on d5')
  })
  it('adds check and checkmate', () => {
    expect(say('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8+')).toBe('White rook to a8, check')
    expect(say('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'Qh4#')).toBe('Black queen to h4, checkmate')
  })
  it('castling both ways', () => {
    expect(say('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')).toBe('White castles kingside')
    expect(say('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O-O')).toBe('Black castles queenside')
  })
  it('promotion', () => {
    expect(say('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e8=N')).toBe('White pawn to e8, promotes to knight')
  })
})

describe('describeSquare', () => {
  it('names pieces and empty squares', () => {
    const c = new Chess()
    expect(describeSquare(c, 'e2')).toBe('e2, white pawn')
    expect(describeSquare(c, 'e4')).toBe('e4, empty')
    expect(describeSquare(c, 'd8')).toBe('d8, black queen')
  })
})
