import { describe, expect, it } from 'vitest'
import { computeBadges, computeStreak, newlyEarned } from './progress'
import { emptyTraining, recordDrill, completeLesson, markActive } from './store'
import { newGame, type GameRecord } from '../game/session'
import { LESSONS } from './lessons'

const at = (d: string) => new Date(`${d}T15:00:00`).getTime()
const NOW = at('2026-10-15')

describe('computeStreak', () => {
  it('counts consecutive days including today', () => {
    expect(computeStreak(['2026-10-13', '2026-10-14', '2026-10-15'], NOW)).toMatchObject({ days: 3, activeToday: true, frozen: 0 })
  })
  it('today not done yet keeps yesterday’s streak', () => {
    expect(computeStreak(['2026-10-13', '2026-10-14'], NOW)).toMatchObject({ days: 2, activeToday: false })
  })
  it('one missed day freezes the streak instead of resetting it', () => {
    expect(computeStreak(['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-15'], NOW)).toMatchObject({ days: 4, frozen: 1 })
  })
  it('missing yesterday with today still open is a freeze too', () => {
    expect(computeStreak(['2026-10-12', '2026-10-13'], NOW)).toMatchObject({ days: 2, frozen: 1 })
  })
  it('two missed days in a row end it', () => {
    expect(computeStreak(['2026-10-10', '2026-10-11', '2026-10-14', '2026-10-15'], NOW)).toMatchObject({ days: 2 })
    expect(computeStreak(['2026-10-11', '2026-10-12'], NOW).days).toBe(0)
  })
  it('no activity, no streak', () => {
    expect(computeStreak([], NOW)).toMatchObject({ days: 0, best: 0 })
  })
  it('remembers the best streak', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-15']
    expect(computeStreak(days, NOW)).toMatchObject({ days: 1, best: 4 })
  })
})

function game(over: Partial<GameRecord>, endedAt: number): GameRecord {
  return { ...newGame({ userColor: 'w', rating: 800, timeControl: null, now: endedAt - 1000 }), endedAt, ...over }
}

describe('computeBadges', () => {
  const base = { games: [], training: emptyTraining(), scores: {}, earned: {}, now: NOW }
  const earnedIds = (b: ReturnType<typeof computeBadges>) => b.filter((x) => x.earned).map((x) => x.id)

  it('nothing is earned with no data', () => {
    expect(earnedIds(computeBadges(base))).toEqual([])
  })

  it('a win by checkmate earns first game, first win and checkmate — with the game’s date', () => {
    const g = game({ result: { winner: 'w', termination: 'checkmate' } }, at('2026-10-02'))
    const b = computeBadges({ ...base, games: [g] })
    expect(earnedIds(b)).toEqual(expect.arrayContaining(['first-game', 'first-win', 'first-mate']))
    expect(b.find((x) => x.id === 'first-win')!.at).toBe(at('2026-10-02'))
  })

  it('a loss earns only "first game"; imported games earn nothing', () => {
    const loss = game({ result: { winner: 'b', termination: 'resign' } }, at('2026-10-02'))
    const imported = game({ result: { winner: 'w', termination: 'checkmate' }, imported: true }, at('2026-10-03'))
    expect(earnedIds(computeBadges({ ...base, games: [loss, imported] }))).toEqual(['first-game'])
  })

  it('drill checkmate and held draws come from saved drill results', () => {
    let t = recordDrill(emptyTraining(), { id: 'kr-mate', won: false, mate: false, at: at('2026-10-01') })
    expect(earnedIds(computeBadges({ ...base, training: t }))).toEqual([])
    t = recordDrill(t, { id: 'kq-mate', won: true, mate: true, at: at('2026-10-02') })
    t = recordDrill(t, { id: 'philidor', won: true, mate: false, at: at('2026-10-03') })
    expect(earnedIds(computeBadges({ ...base, training: t }))).toEqual(expect.arrayContaining(['drill-mate', 'drill-draw']))
  })

  it('puzzle counts show progress until reached', () => {
    const t = { ...emptyTraining(), results: Array.from({ length: 37 }, (_, i) => ({ puzzleId: `p${i}`, themes: [], clean: i % 2 === 0, at: NOW - i })) }
    const b = computeBadges({ ...base, training: t })
    expect(b.find((x) => x.id === 'puzzles-10')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'puzzles-100')!.progress).toEqual({ have: 37, need: 100 })
    expect(b.find((x) => x.id === 'clean-10')!.earned).toBe(false) // never 10 clean in a row
  })

  it('skill badges need a real score', () => {
    const scores = { openings: { skill: 'openings' as const, score: 64, n: 10, bad: 3, example: null, mistakes: [] } }
    const b = computeBadges({ ...base, scores })
    expect(b.find((x) => x.id === 'skill-60')!.earned).toBe(true)
    expect(b.find((x) => x.id === 'skill-80')!.progress).toEqual({ have: 64, need: 80 })
  })

  it('7-day streak from training days', () => {
    let t = emptyTraining()
    for (let d = 9; d <= 15; d++) t = markActive(t, at(`2026-10-${String(d).padStart(2, '0')}`))
    expect(earnedIds(computeBadges({ ...base, training: t }))).toEqual(expect.arrayContaining(['streak-3', 'streak-7']))
  })

  it('lessons', () => {
    let t = completeLesson(emptyTraining(), LESSONS[0].id, at('2026-10-05'))
    expect(computeBadges({ ...base, training: t }).find((x) => x.id === 'first-lesson')).toMatchObject({ earned: true, at: at('2026-10-05') })
    for (const l of LESSONS) t = completeLesson(t, l.id, NOW)
    expect(earnedIds(computeBadges({ ...base, training: t }))).toContain('all-lessons')
  })

  it('earned badges are never taken away, and only new ones are celebrated', () => {
    const b = computeBadges({ ...base, earned: { 'skill-60': at('2026-10-01') } })
    expect(b.find((x) => x.id === 'skill-60')).toMatchObject({ earned: true, at: at('2026-10-01') })
    const g = game({ result: { winner: 'w', termination: 'resign' } }, at('2026-10-02'))
    const b2 = computeBadges({ ...base, games: [g], earned: { 'first-game': 1 } })
    expect(newlyEarned(b2, { 'first-game': 1 }).map((x) => x.id)).toEqual(['first-win'])
  })
})
