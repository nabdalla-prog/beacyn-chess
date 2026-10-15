import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { DRILLS, judgeDrill } from './endgames'

const cp = (value: number) => ({ type: 'cp' as const, value })
const drill = (id: string) => DRILLS.find((d) => d.id === id)!

describe('drill positions', () => {
  it('are legal, have the user to move, and look like what they claim', () => {
    for (const d of DRILLS) {
      const c = new Chess(d.fen)
      expect(c.moves().length, d.id).toBeGreaterThan(0)
      expect(c.isGameOver(), d.id).toBe(false)
      expect(d.idea.length, d.id).toBeLessThan(260)
    }
    // Lucena: white pawn on b7 with its king on b8; Philidor: black rook on the 6th rank.
    expect(new Chess(drill('lucena').fen).get('b7')).toEqual({ type: 'p', color: 'w' })
    expect(new Chess(drill('philidor').fen).get('a6')).toEqual({ type: 'r', color: 'b' })
  })
})

describe('judgeDrill', () => {
  const kq = drill('kq-mate')
  it('mate goal: checkmate wins, stalemate fails, the move limit fails', () => {
    expect(judgeDrill(kq, 'w', new Chess('k7/1Q6/1K6/8/8/8/8/8 b - - 0 1'), null, 9, false)).toEqual({ state: 'won', reason: 'Checkmate in 9 moves!' })
    expect(judgeDrill(kq, 'w', new Chess('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1'), null, 9, false).state).toBe('failed') // stalemate
    expect(judgeDrill(kq, 'w', new Chess('8/8/8/4k3/8/8/8/3QK3 b - - 0 1'), cp(900), 25, false).state).toBe('failed')
    expect(judgeDrill(kq, 'w', new Chess('8/8/8/4k3/8/8/8/3QK3 b - - 0 1'), cp(900), 5, false).state).toBe('playing')
  })
  it('win goals fail when the engine no longer sees a win', () => {
    expect(judgeDrill(drill('lucena'), 'w', new Chess(drill('lucena').fen), cp(50), 4, false)).toMatchObject({ state: 'failed', reason: expect.stringContaining('win slipped') })
  })
  it('promote goal: promotion with a winning eval wins', () => {
    expect(judgeDrill(drill('kp-sixth'), 'w', new Chess('3kQ3/8/3K4/8/8/8/8/8 b - - 0 1'), cp(1200), 6, true).state).toBe('won')
  })
  it('draw goal: surviving the limit or a drawn position wins; a lost eval fails', () => {
    const d = drill('philidor')
    expect(judgeDrill(d, 'b', new Chess(d.fen), cp(0), 15, false).state).toBe('won')
    expect(judgeDrill(d, 'b', new Chess(d.fen), cp(-600), 3, false).state).toBe('failed')
    expect(judgeDrill(d, 'b', new Chess('8/8/8/8/8/8/8/k1K5 w - - 0 1'), null, 3, false)).toMatchObject({ state: 'won', reason: expect.stringContaining('draw held') })
  })
})
