import { describe, expect, it } from 'vitest'
import type { InfoLine } from '../engine/uci'
import { classifyMove, winPercent } from './classify'
import { explainMove, hintFor, warningFor } from './explain'

const L = (pv: string, score: InfoLine['score'], multipv = 1): InfoLine => ({ depth: 12, multipv, score, pv: pv.split(' ') })
const cp = (value: number) => ({ type: 'cp' as const, value })
const mate = (value: number) => ({ type: 'mate' as const, value })

describe('classifyMove', () => {
  it('win percent is symmetric and bounded', () => {
    expect(winPercent(cp(0))).toBeCloseTo(50)
    expect(winPercent(cp(300)) + winPercent(cp(-300))).toBeCloseTo(100)
    expect(winPercent(mate(3))).toBe(100)
    expect(winPercent(mate(-1))).toBe(0)
  })
  it('grades by win-probability loss', () => {
    expect(classifyMove({ best: cp(30), played: cp(30), isTopMove: true }).cls).toBe('best')
    expect(classifyMove({ best: cp(30), played: cp(0), isTopMove: false }).cls).toBe('good')
    expect(classifyMove({ best: cp(50), played: cp(-50), isTopMove: false }).cls).toBe('inaccuracy')
    expect(classifyMove({ best: cp(50), played: cp(-150), isTopMove: false }).cls).toBe('mistake')
    expect(classifyMove({ best: cp(50), played: cp(-400), isTopMove: false }).cls).toBe('blunder')
  })
  it('missed win when a winning position is thrown away', () => {
    expect(classifyMove({ best: mate(2), played: cp(0), isTopMove: false }).cls).toBe('missed-win')
    expect(classifyMove({ best: cp(600), played: cp(50), isTopMove: false }).cls).toBe('missed-win')
  })
  it('brilliant only for a sound sacrifice', () => {
    expect(classifyMove({ best: cp(100), played: cp(100), isTopMove: true, isSacrifice: true }).cls).toBe('brilliant')
    expect(classifyMove({ best: cp(100), played: cp(-300), isTopMove: false, isSacrifice: true }).cls).toBe('blunder')
    expect(classifyMove({ best: cp(1500), played: cp(1500), isTopMove: true, isSacrifice: true }).cls).toBe('best')
  })
  it('never reports negative loss when depth noise makes the move look better', () => {
    expect(classifyMove({ best: cp(20), played: cp(40), isTopMove: false }).loss).toBe(0)
  })
})

describe('explainMove', () => {
  it('explains a hanging piece with the capturing reply', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Ng5?? puts the knight where the queen takes it for free.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const e = explainMove({
      fenBefore: fen,
      uci: 'f3g5',
      ply: 4,
      before: [L('f1b5 a7a6', cp(40))],
      after: [L('d8g5 d2d4', cp(450))],
    })
    expect(e.cls).toBe('blunder')
    expect(e.text).toContain('Your knight on g5 can be taken: Qxg5')
    expect(e.text).toContain('Nothing defends it')
    expect(e.text).toContain('Better was Bb5')
    expect(e.concepts).toContain('hanging-piece')
    expect(e.frames[0].arrows).toContainEqual({ orig: 'd8', dest: 'g5', brush: 'threat' })
    expect(e.frames[1].arrows).toContainEqual({ orig: 'f1', dest: 'b5', brush: 'best' })
    expect(warningFor(e)?.text).toBe('Wait — check what that move leaves undefended.')
  })

  it('explains allowing mate', () => {
    // 1.f3 e5 2.g4?? Qh4#
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'
    const e = explainMove({ fenBefore: fen, uci: 'g2g4', ply: 2, before: [L('e2e4 d7d5', cp(-60))], after: [L('d8h4', mate(1))] })
    expect(e.cls).toBe('blunder')
    expect(e.text).toContain('This allows mate in 1, starting with Qh4#')
    expect(e.concepts).toContain('allowed-mate')
    expect(warningFor(e)?.text).toContain('allows checkmate')
  })

  it('praises a fork', () => {
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'
    const e = explainMove({ fenBefore: fen, uci: 'b5c7', ply: 0, before: [L('b5c7 e8d7', cp(500))], after: [L('e8d7 c7a8', cp(-500))] })
    expect(e.cls).toBe('best')
    expect(e.text).toBe('Forks the rook and king!')
    expect(e.concepts).toEqual(['fork'])
    expect(warningFor(e)).toBeNull()
  })

  it('names the capture the user missed', () => {
    // Black knight on d5 hangs to the e4 pawn; White plays h3 instead.
    const fen = '4k3/8/8/3n4/4P3/8/7P/4K3 w - - 0 1'
    const e = explainMove({ fenBefore: fen, uci: 'h2h3', ply: 0, before: [L('e4d5 e8d7', cp(350))], after: [L('d5f4 e1f2', cp(0))] })
    expect(['mistake', 'blunder']).toContain(e.cls)
    expect(e.text).toBe('You could have won the knight on d5 with exd5.')
  })

  it('a missed free piece beats describing the opponent’s reply', () => {
    // White's queen can take Black's undefended queen on f2; White plays d3 instead.
    const fen = '1nb1k2r/pp2bQpp/8/3p4/8/P7/1P1P1qPP/n1BK3R w k - 0 15'
    const e = explainMove({ fenBefore: fen, uci: 'd2d3', ply: 28, before: [L('f7f2 e8d8', cp(900))], after: [L('f2c2 d1e1', cp(400))] })
    expect(e.text).toBe('You could have won the queen on f2 with Qxf2.')
  })

  it('falls back to the engine numbers when no detector applies', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const e = explainMove({ fenBefore: fen, uci: 'g2g4', ply: 0, before: [L('e2e4 e7e5', cp(30))], after: [L('d7d5 h2h3', cp(70))] })
    expect(e.cls).toBe('inaccuracy')
    expect(e.text).toBe('The engine prefers e4: +0.3 → -0.7 for you.')
  })
})

describe('hint ladder', () => {
  const fen = '4k3/8/8/3n4/4P3/8/7P/4K3 w - - 0 1'
  const lines = [L('e4d5 e8d7', cp(350))]
  it('goes from region to piece to arrow to explanation', () => {
    expect(hintFor(fen, lines, 1)?.text).toBe('Look at the center. Look for a capture.')
    expect(hintFor(fen, lines, 2)?.frame.highlights).toEqual([{ square: 'e4', kind: 'piece' }])
    expect(hintFor(fen, lines, 3)?.frame.arrows).toEqual([{ orig: 'e4', dest: 'd5', brush: 'hint' }])
    const h4 = hintFor(fen, lines, 4)!
    expect(h4.text).toBe('exd5: Wins the knight on d5.')
    expect(h4.line?.san).toEqual(['exd5', 'Kd7'])
  })
})
