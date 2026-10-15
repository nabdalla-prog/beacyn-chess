import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { DAY, dueCards, isClean, newCard, qualityOf, reviewCard } from './srs'
import { bandOf, checkMove, fromLichess, nextPuzzleRating, ownMistakePuzzles, pickPuzzles, startPosition, type TrainPuzzle } from './puzzles'
import { buildPlan, dayKey, markProgress, planDone, todaysPlan } from './plan'
import { importPgn } from '../game/session'
import type { SkillScore } from '../coach/skills'

const now = Date.UTC(2026, 9, 15, 12)

describe('SM-2', () => {
  it('first reviews go 1 day, then 6 days, then grow by the ease', () => {
    let c = newCard('a', now)
    c = reviewCard(c, 5, now)
    expect(c.interval).toBe(1)
    c = reviewCard(c, 5, now)
    expect(c.interval).toBe(6)
    c = reviewCard(c, 5, now)
    expect(c.interval).toBe(Math.round(6 * c.ease))
    expect(c.due).toBe(now + c.interval * DAY)
  })
  it('a failed review resets and lowers the ease, never below 1.3', () => {
    let c = newCard('a', now)
    for (let i = 0; i < 3; i++) c = reviewCard(c, 5, now)
    c = reviewCard(c, 1, now)
    expect(c.reps).toBe(0)
    expect(c.interval).toBe(1)
    expect(c.lapses).toBe(1)
    for (let i = 0; i < 20; i++) c = reviewCard(c, 0, now)
    expect(c.ease).toBe(1.3)
  })
  it('lists due cards, oldest first', () => {
    const cards = [{ ...newCard('late', now), due: now + DAY }, { ...newCard('b', now), due: now - 2 * DAY }, { ...newCard('a', now), due: now - DAY }]
    expect(dueCards(cards, now).map((c) => c.id)).toEqual(['b', 'a'])
  })
  it('grades attempts', () => {
    const a = { solved: true, wrongTries: 0, hintLevel: 0, revealed: false }
    expect(qualityOf(a)).toBe(5)
    expect(isClean(a)).toBe(true)
    expect(qualityOf({ ...a, hintLevel: 1 })).toBe(4)
    expect(isClean({ ...a, hintLevel: 1 })).toBe(false)
    expect(qualityOf({ ...a, hintLevel: 2 })).toBe(3)
    expect(qualityOf({ ...a, wrongTries: 1 })).toBe(2) // a wrong move = not remembered
    expect(qualityOf({ ...a, hintLevel: 3 })).toBe(2)
    expect(qualityOf({ ...a, revealed: true })).toBe(1)
  })
})

describe('puzzles', () => {
  // Lichess style: opponent plays the first move, then the user finds the reply.
  const fool = fromLichess({ id: 'fool1', fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2', moves: 'g2g4 d8h4', rating: 600, themes: ['mateIn1'] })
  it('plays the setup move and puts the user to move', () => {
    expect(fool.setup).toBe('g2g4')
    expect(fool.solution).toEqual(['d8h4'])
    expect(startPosition(fool).turn()).toBe('b')
  })
  it('accepts the stored move or any checkmate, rejects others', () => {
    const pos = startPosition(fool)
    expect(checkMove(fool, pos, 0, 'd8h4')).toBe('solved')
    expect(checkMove(fool, pos, 0, 'e8e7')).toBe('wrong')
    expect(checkMove(fool, pos, 0, 'zzzz')).toBe('wrong')
  })
  it('multi-move puzzles go step by step', () => {
    const p: TrainPuzzle = { id: 'x', source: 'lichess', fen: new Chess().fen(), solution: ['e2e4', 'e7e5', 'g1f3'], themes: [] }
    const pos = new Chess()
    expect(checkMove(p, pos, 0, 'e2e4')).toBe('correct')
    pos.move('e4')
    pos.move('e5')
    expect(checkMove(p, pos, 2, 'g1f3')).toBe('solved')
  })
  it('puzzle rating moves toward results', () => {
    expect(nextPuzzleRating(1000, 1000, true)).toBe(1016)
    expect(nextPuzzleRating(1000, 1000, false)).toBe(984)
    expect(nextPuzzleRating(1000, 1400, true)).toBeGreaterThan(1025)
  })
  it('picks unseen puzzles nearest the user’s rating', () => {
    const pool = [600, 900, 1000, 1100, 1500].map((r, i) => ({ ...fool, id: `p${i}`, rating: r }))
    expect(pickPuzzles(pool, 1000, new Set(['p2']), 2).map((p) => p.rating)).toEqual([900, 1100])
    expect(bandOf(1000)).toBe(1)
    expect(bandOf(5000)).toBe(0)
  })
  it('turns the user’s own reviewed mistakes into puzzles', () => {
    const g = importPgn('1. f3 e5 2. g4 Qh4# 0-1', 'w', 0)
    g.moves[2].review = { cls: 'blunder', loss: 50, best: 'e2e4', concepts: ['allowed-mate'] }
    g.moves[0].review = { cls: 'inaccuracy', loss: 6, best: 'e2e4', concepts: [] } // too small to drill
    const own = ownMistakePuzzles([g])
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ id: `own:${g.id}:2`, solution: ['e2e4'], playedSan: 'g4', ply: 2 })
    expect(startPosition(own[0]).turn()).toBe('w')
  })
})

describe('daily plan', () => {
  const weak = (skill: string, score: number): SkillScore => ({ skill: skill as SkillScore['skill'], score, n: 10, bad: 3, example: null, mistakes: [] })
  it('starts with reviews and own mistakes, then the weakest tactics, then a game', () => {
    const p = buildPlan({ now, dueReviews: 14, ownMistakes: 3, weakest: [weak('motif:fork', 40), weak('openings', 45), weak('motif:mate', 48)] })
    expect(p.items.map((i) => i.id)).toEqual(['review', 'own', 'theme:fork', 'theme:mateIn1', 'game'])
    expect(p.items.filter((i) => i.kind === 'theme').map((i) => (i as { reason: string }).reason)).toEqual(['motif:fork', 'motif:mate'])
    expect(p.items[0].target).toBe(10)
    expect(p.items[1].target).toBe(3)
  })
  it('a new player gets a general plan', () => {
    const p = buildPlan({ now, dueReviews: 0, ownMistakes: 0, weakest: [] })
    expect(p.items.map((i) => i.id)).toEqual(['theme:mateIn1', 'theme:hangingPiece', 'game'])
  })
  it('never claims puzzles train a skill they don’t (openings, endgames)', () => {
    const p = buildPlan({ now, dueReviews: 0, ownMistakes: 0, weakest: [weak('openings', 30), weak('endgames', 35), weak('blunders', 40)] })
    const themed = p.items.filter((i) => i.kind === 'theme') as { theme: string; reason: string }[]
    expect(themed.map((t) => [t.theme, t.reason])).toEqual([
      ['hangingPiece', 'blunders'],
      ['mateIn1', 'general'],
    ])
  })
  it('keeps today’s progress and starts fresh tomorrow', () => {
    const input = { now, dueReviews: 0, ownMistakes: 0, weakest: [] }
    let p = markProgress(buildPlan(input), 'game')
    expect(todaysPlan(p, input).items.find((i) => i.id === 'game')!.done).toBe(1)
    expect(todaysPlan(p, { ...input, now: now + DAY }).items.find((i) => i.id === 'game')!.done).toBe(0)
    expect(todaysPlan(p, input).date).toBe(dayKey(now))
    for (const i of p.items) p = markProgress(p, i.id, 99)
    expect(planDone(p)).toBe(true)
  })
})

describe('training progress', () => {
  it('a miss creates a review card, logs the result and lowers the rating', async () => {
    const { applyAttempt, emptyTraining } = await import('./store')
    const p = { ...fromLichess({ id: 'zz1', fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2', moves: 'g2g4 d8h4', rating: 1000, themes: ['mateIn1'] }) }
    const miss = { solved: true, wrongTries: 1, hintLevel: 0, revealed: false }
    const s = applyAttempt(emptyTraining(), p, miss, now, 1000)
    expect(s.cards['l:zz1']).toMatchObject({ reps: 0, interval: 1, lapses: 1, due: now + DAY })
    expect(s.results).toEqual([{ puzzleId: 'l:zz1', themes: ['mateIn1'], clean: false, at: now, rating: 1000 }])
    expect(s.rating).toBe(984)
    expect(s.seen).toEqual(['l:zz1'])
    // Solving it cleanly later reschedules the card further out.
    const clean = { solved: true, wrongTries: 0, hintLevel: 0, revealed: false }
    const s2 = applyAttempt(s, p, clean, now + DAY, 1000)
    expect(s2.cards['l:zz1'].reps).toBe(1)
    expect(s2.results.at(-1)!.clean).toBe(true)
  })
  it('a clean first solve needs no card', async () => {
    const { applyAttempt, emptyTraining } = await import('./store')
    const p = fromLichess({ id: 'zz2', fen: new Chess().fen(), moves: 'e2e4 e7e5', rating: 900, themes: ['fork'] })
    const s = applyAttempt(emptyTraining(), p, { solved: true, wrongTries: 0, hintLevel: 0, revealed: false }, now, 800)
    expect(s.cards).toEqual({})
    expect(s.rating).toBeGreaterThan(800)
  })
})
