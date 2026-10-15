import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { LESSONS, nextLesson, passes } from './lessons'
import { DRILLS } from './endgames'

describe('lessons', () => {
  it('have unique ids, short text and valid quizzes', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
    for (const l of LESSONS) {
      for (const p of l.concept) expect(p.length, l.id).toBeLessThan(300)
      expect(l.quiz.answer).toBeGreaterThanOrEqual(0)
      expect(l.quiz.answer).toBeLessThan(l.quiz.options.length)
      if (l.drill) expect(DRILLS.some((d) => d.id === l.drill), `${l.id} drill`).toBe(true)
    }
  })

  for (const l of LESSONS) {
    l.exercises.forEach((ex, i) => {
      it(`${l.id} #${i + 1}: solvable, and not every move passes`, () => {
        const before = new Chess(ex.fen)
        // The side to move must not already be in check (an illegal-looking start).
        expect(before.isCheck(), `${l.id} #${i + 1} starts in check`).toBe(false)
        const results = before.moves({ verbose: true }).map((m) => {
          const after = new Chess(ex.fen)
          after.move(m)
          return { san: m.san, ok: passes(ex.check, before, m, after) }
        })
        const good = results.filter((r) => r.ok).map((r) => r.san)
        expect(good.length, `${l.id} #${i + 1} has no solution`).toBeGreaterThan(0)
        expect(results.some((r) => !r.ok), `${l.id} #${i + 1}: every move passes`).toBe(true)
      })
    })
  }

  it('specific answers are what the theory says', () => {
    const sols = (id: string, n = 0) => {
      const ex = LESSONS.find((l) => l.id === id)!.exercises[n]
      const b = new Chess(ex.fen)
      return b
        .moves({ verbose: true })
        .filter((m) => {
          const a = new Chess(ex.fen)
          a.move(m)
          return passes(ex.check, b, m, a)
        })
        .map((m) => m.san)
        .sort()
    }
    expect(sols('back-rank')).toEqual(['Rd8#'])
    expect(sols('forks')).toEqual(['Nc7+'])
    expect(sols('forks', 1)).toEqual(['d4'])
    expect(sols('pins')).toEqual(['Bb5'])
    expect(sols('pins', 1)).toEqual(['Rh8+'])
    expect(sols('opposition')).toEqual(['Ke4'])
    expect(sols('square')).toEqual(['Kd5', 'Kd6'])
    expect(sols('rook-behind')).toEqual(['Ra1'])
    expect(sols('passed')).toEqual(['b5', 'bxc5', 'd5', 'dxc5']) // pushing past the c5 pawn works too
    expect(sols('castle')).toEqual(['O-O'])
    expect(sols('ladder')).toEqual(['Ra8#'])
    expect(sols('queen-mate')).toEqual(['Qa8#', 'Qg7#']) // Qg7 is protected by the king
  })

  it('recommends the first unfinished lesson', () => {
    expect(nextLesson([])?.id).toBe('pieces')
    expect(nextLesson(['pieces', 'check-mate'])?.id).toBe('back-rank')
    expect(nextLesson(LESSONS.map((l) => l.id))).toBeNull()
  })
})
