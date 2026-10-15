import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { applyTakeback, describeResult, detectGameOver, newGame, parseUserMove, replay, takebackPlies, timeoutResult, toPgn, type GameRecord } from './session'
import { formatClock, pressClock, remaining, startClock } from './clock'

const mv = (uci: string, san: string, by: 'user' | 'engine') => ({ uci, san, by, timeMs: 1000 })

function sample(): GameRecord {
  const g = newGame({ userColor: 'w', rating: 800, timeControl: null, now: 0 })
  return { ...g, moves: [mv('e2e4', 'e4', 'user'), mv('e7e5', 'e5', 'engine'), mv('g1f3', 'Nf3', 'user'), mv('b8c6', 'Nc6', 'engine')] }
}

describe('session', () => {
  it('replays moves', () => {
    expect(replay(sample()).fen()).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')
  })
  it('takeback removes the engine reply and the user move', () => {
    const g = sample()
    expect(takebackPlies(g)).toBe(2)
    const t = applyTakeback(g)
    expect(t.moves).toHaveLength(2)
    expect(t.takebacks).toBe(1)
    expect(replay(t).turn()).toBe('w')
  })
  it('takeback when the user is black and engine moved first', () => {
    const g = { ...newGame({ userColor: 'b', rating: 800, timeControl: null }), moves: [mv('e2e4', 'e4', 'engine')] }
    expect(takebackPlies(g)).toBe(0)
  })
  it('detects checkmate', () => {
    const c = new Chess()
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) c.move(m)
    expect(detectGameOver(c)).toEqual({ winner: 'b', termination: 'checkmate' })
  })
  it('detects stalemate', () => {
    expect(detectGameOver(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({ winner: null, termination: 'stalemate' })
  })
  it('timeout against a bare king is a draw', () => {
    expect(timeoutResult(new Chess('7k/8/8/8/8/8/8/K6Q w - - 0 1'), 'w').winner).toBeNull()
    expect(timeoutResult(new Chess('7k/8/8/8/8/8/8/K6Q w - - 0 1'), 'b').winner).toBe('w')
  })
  it('parses typed moves in SAN and UCI', () => {
    const c = new Chess()
    expect(parseUserMove(c, 'e4')?.san).toBe('e4')
    expect(parseUserMove(c, 'nf3')?.san).toBe('Nf3')
    expect(parseUserMove(c, 'g1f3')?.san).toBe('Nf3')
    expect(parseUserMove(c, 'e2-e4')?.san).toBe('e4')
    expect(parseUserMove(c, 'Ke2')).toBeNull()
    // "b4" is a pawn move, not confused with a bishop move.
    expect(parseUserMove(c, 'b4')?.piece).toBe('p')
    const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(parseUserMove(castle, '0-0')?.san).toBe('O-O')
  })
  it('exports PGN with result', () => {
    const g: GameRecord = { ...sample(), result: { winner: 'w', termination: 'resign' } }
    const pgn = toPgn(g)
    expect(pgn).toContain('[White "You"]')
    expect(pgn).toContain('[Result "1-0"]')
    expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6')
    expect(describeResult(g)).toBe('You won by resignation')
  })
})

describe('clock', () => {
  const tc = { initial: 60, increment: 2 }
  it('runs, charges and adds increment', () => {
    let c = startClock(tc, 'w', 0)
    expect(remaining(c, 'w', 5000)).toBe(55000)
    c = pressClock(c, tc, 5000)
    expect(c.w).toBe(57000)
    expect(c.running).toBe('b')
    expect(remaining(c, 'b', 6000)).toBe(59000)
  })
  it('formats', () => {
    expect(formatClock(65000)).toBe('1:05')
    expect(formatClock(9450)).toBe('0:09.4')
  })
})
