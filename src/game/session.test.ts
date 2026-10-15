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

describe('importPgn', () => {
  const pgn = `[Event "Club night"]
[Date "2026.09.01"]
[White "Ana"]
[Black "Me"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`
  it('reads moves, sides, opponent and result', async () => {
    const { importPgn } = await import('./session')
    const g = importPgn(pgn, 'b', Date.UTC(2026, 9, 1))
    expect(g.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    expect(g.moves.map((m) => m.by)).toEqual(['engine', 'user', 'engine', 'user'])
    expect(g.opponentName).toBe('Ana')
    expect(g.result).toEqual({ winner: 'b', termination: 'checkmate' })
    expect(g.imported).toBe(true)
    expect(new Date(g.startedAt).getUTCFullYear()).toBe(2026)
    expect(describeResult(g)).toBe('You won by checkmate')
  })
  it('uses the PGN result when the board does not show the end', async () => {
    const { importPgn } = await import('./session')
    const g = importPgn('[White "Me"]\n[Black "Bo"]\n[Result "0-1"]\n\n1. e4 e5 0-1', 'w', 0)
    expect(describeResult(g)).toBe('Bo won')
  })
  it('rejects text that is not a game', async () => {
    const { importPgn } = await import('./session')
    expect(() => importPgn('hello there', 'w')).toThrow()
  })
})

describe('importPgn with untrusted input', () => {
  const load = () => import('./session')

  it('keeps names as plain text and strips control and bidi characters', async () => {
    const { importPgn } = await load()
    const evil = '<img src=x onerror=alert(1)>\u202eevil\u0007'
    const g = importPgn(`[White "Me"]\n[Black "${evil}"]\n[Result "*"]\n\n1. e4 e5 *`, 'w', 0)
    // The name is stored as text (angle brackets and all) but invisible tricks are gone.
    expect(g.opponentName).toBe('<img src=x onerror=alert(1)>evil')
    // eslint-disable-next-line no-control-regex
    expect(g.opponentName).not.toMatch(/[\u0000-\u001f\u202a-\u202e]/)
  })

  it('caps very long names', async () => {
    const { cleanPlayerName } = await load()
    expect(cleanPlayerName('A'.repeat(500))).toHaveLength(40)
    expect(cleanPlayerName('  ?  ')).toBeUndefined()
    expect(cleanPlayerName('  Magnus \n  C. ')).toBe('Magnus C.')
  })

  it('drops comments and unknown tags', async () => {
    const { importPgn } = await load()
    const g = importPgn('[White "Me"]\n[Black "B"]\n[Evil "<script>x</script>"]\n\n1. e4 {<script>alert(1)</script>} e5 *', 'w', 0)
    expect(JSON.stringify(g)).not.toContain('script')
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
  })

  it('rejects very large text quickly with a friendly message', async () => {
    const { importPgn, PgnImportError, MAX_PGN_CHARS } = await load()
    const huge = '1. e4 e5 '.repeat(Math.ceil((MAX_PGN_CHARS + 10) / 9))
    const t = performance.now()
    expect(() => importPgn(huge, 'w')).toThrow(PgnImportError)
    expect(() => importPgn(huge, 'w')).toThrow(/too much text/)
    expect(performance.now() - t).toBeLessThan(100)
  })

  it('rejects absurdly long games', async () => {
    const { importPgn, PgnImportError } = await load()
    // Knights shuffling back and forth: 700 legal plies, under the size limit.
    const shuffle = Array.from({ length: 175 }, (_, i) => `${2 * i + 1}. Nf3 Nf6 ${2 * i + 2}. Ng1 Ng8`).join(' ')
    expect(() => importPgn(shuffle, 'w')).toThrow(PgnImportError)
    expect(() => importPgn(shuffle, 'w')).toThrow(/too long/)
  })

  it('fails gracefully on malformed input', async () => {
    const { importPgn, PgnImportError } = await load()
    const bad = [
      '',
      '   \n  ',
      'hello there',
      '1. e4 e5 2. Qxz9 *', // impossible move
      '1. e4 e4 *', // illegal move
      '[White "Me"\n1. e4', // broken tag
      '[FEN "not a fen"]\n[SetUp "1"]\n\n1. e4 *',
      String.fromCharCode(...Array.from({ length: 2000 }, (_, i) => (i * 7919) % 65535)), // binary-ish junk
    ]
    for (const text of bad) {
      let err: unknown
      try {
        importPgn(text, 'w')
      } catch (e) {
        err = e
      }
      expect(err, JSON.stringify(text.slice(0, 30))).toBeInstanceOf(PgnImportError)
      expect((err as Error).message.length).toBeLessThan(160)
    }
  })

  it('uses the first game of a multi-game file', async () => {
    const { importPgn } = await load()
    const two = '[Event "A"]\n[White "Me"]\n[Black "One"]\n\n1. e4 e5 *\n\n[Event "B"]\n[White "Me"]\n[Black "Two"]\n\n1. d4 d5 *'
    const g = importPgn(two, 'w', 0)
    expect(g.opponentName).toBe('One')
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
  })

  it('ignores impossible dates', async () => {
    const { importPgn } = await load()
    const now = Date.UTC(2026, 0, 1)
    expect(importPgn('[Date "2999.01.01"]\n\n1. e4 *', 'w', now).startedAt).toBe(now)
    expect(importPgn('[Date "????.??.??"]\n\n1. e4 *', 'w', now).startedAt).toBe(now)
  })
})
