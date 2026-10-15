import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { newGame, type GameRecord, type MoveRecord, type MoveReview } from '../game/session'
import { eventsFromGame, eventsFromPuzzles, isSharp, phaseOf, RECENCY, scoreSkills, skillTrend, weakestSkills, weaknessSentence, type SkillEvent } from './skills'

const rv = (cls: MoveReview['cls'], concepts: string[] = [], loss = cls === 'blunder' ? 30 : cls === 'mistake' ? 15 : 0, best?: string): MoveReview => ({ cls, loss, concepts, best, text: `${cls} text` })

function game(id: string, at: number, moves: [string, string, 'user' | 'engine', MoveReview?, Partial<MoveRecord>?][]): GameRecord {
  return {
    ...newGame({ userColor: 'w', rating: 800, timeControl: null, now: at }),
    id,
    moves: moves.map(([uci, san, by, review, extra]) => ({ uci, san, by, timeMs: 10_000, review, ...extra })),
  }
}

describe('phases and sharp positions', () => {
  it('detects opening, middlegame and endgame', () => {
    expect(phaseOf(new Chess())).toBe('opening')
    expect(phaseOf(new Chess('r1bq1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 15'))).toBe('middlegame')
    expect(phaseOf(new Chess('8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40'))).toBe('endgame')
    // Queens traded but rooks and minors left: endgame only when little is left.
    expect(phaseOf(new Chess('r3r1k1/pp3ppp/2n2n2/8/8/2N2N2/PP3PPP/R3R1K1 w - - 0 20'))).toBe('endgame')
  })
  it('a capture or check as the best move makes a position sharp', () => {
    const c = new Chess('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1')
    expect(isSharp(c, 'e4d5')).toBe(true)
    expect(isSharp(c, 'e1d2')).toBe(false)
  })
})

describe('eventsFromGame', () => {
  const g = game('g1', 1000, [
    ['e2e4', 'e4', 'user', rv('best', ['center'])],
    ['e7e5', 'e5', 'engine'],
    ['g1f3', 'Nf3', 'user', rv('good', ['development'])],
    ['b8c6', 'Nc6', 'engine'],
    ['f3g5', 'Ng5', 'user', rv('blunder', ['hanging-piece'], 30, 'f1b5'), { timeMs: 1500 }],
    ['d8g5', 'Qxg5', 'engine'],
    ['d2d4', 'd4', 'user', rv('good'), { hintLevel: 3 }], // played with the answer shown: skipped
  ])
  const ev = eventsFromGame(g)
  const of = (skill: string) => ev.filter((e) => e.skill === skill)
  it('makes one phase event per own move', () => {
    expect(of('openings').map((e) => e.ok)).toEqual([true, true, false])
  })
  it('turns detector concepts into motif and tactics events', () => {
    expect(of('motif:hanging')).toHaveLength(1)
    expect(of('motif:hanging')[0]).toMatchObject({ ok: false, san: 'Ng5', ply: 4 })
    expect(of('tactics')).toHaveLength(1)
  })
  it('counts blunders and rushed errors', () => {
    expect(of('blunders').map((e) => e.ok)).toEqual([true, true, false])
    expect(of('time').map((e) => e.ok)).toEqual([true, true, false])
  })
  it('skips moves played after seeing the answer', () => {
    expect(ev.some((e) => e.ply === 6)).toBe(false)
  })
  it('imported games have no time events', () => {
    expect(eventsFromGame({ ...g, imported: true }).some((e) => e.skill === 'time')).toBe(false)
  })
})

const E = (skill: SkillEvent['skill'], ok: boolean, gameId: string, at: number, loss = ok ? 0 : 20): SkillEvent => ({ skill, ok, gameId, at, ply: 0, san: 'x', cls: ok ? 'good' : 'mistake', loss, source: 'game' })

describe('scoreSkills', () => {
  it('needs enough events before giving a score', () => {
    const s = scoreSkills([E('openings', true, 'a', 1), E('openings', false, 'a', 1)])
    expect(s.openings.score).toBeNull()
    expect(s.openings.n).toBe(2)
  })
  it('is the share of good outcomes, weighting recent games more', () => {
    const old = Array.from({ length: 5 }, () => E('openings', false, 'old', 1))
    const recent = Array.from({ length: 5 }, () => E('openings', true, 'new', 2))
    const s = scoreSkills([...old, ...recent]).openings
    // recent weight 1, old weight RECENCY: good share = 1 / (1 + RECENCY)
    expect(s.score).toBe(Math.round(100 / (1 + RECENCY)))
    expect(s.score!).toBeGreaterThan(50)
  })
  it('picks the most costly mistake as the example', () => {
    const s = scoreSkills([...Array.from({ length: 4 }, () => E('endgames', true, 'a', 1)), E('endgames', false, 'a', 1, 12), E('endgames', false, 'b', 2, 40)]).endgames
    expect(s.example?.gameId).toBe('b')
    expect(s.bad).toBe(2)
  })
})

describe('weakestSkills', () => {
  const events = [
    ...Array.from({ length: 10 }, (_, i) => E('openings', i < 9, 'a', 1)), // 90
    ...Array.from({ length: 10 }, (_, i) => E('endgames', i < 4, 'a', 1)), // 40
    ...Array.from({ length: 4 }, (_, i) => E('motif:fork', i < 1, 'a', 1)), // 25
    ...Array.from({ length: 10 }, (_, i) => E('middlegame', i < 7, 'a', 1)), // 70
    ...Array.from({ length: 10 }, () => E('blunders', true, 'a', 1)), // 100, no mistakes
  ]
  const weak = weakestSkills(scoreSkills(events))
  it('ranks the weakest three, motifs included, worst first', () => {
    expect(weak.map((w) => w.skill)).toEqual(['motif:fork', 'endgames', 'middlegame'])
  })
  it('never lists a skill without a real mistake to show', () => {
    expect(weak.every((w) => w.example && !w.example.ok)).toBe(true)
  })
  it('uses a different example position for each weak skill when it can', () => {
    // One costly move (ply 7) counts for both skills; openings also has a smaller mistake (ply 3).
    const at = (skill: SkillEvent['skill'], ply: number, loss: number) => ({ ...E(skill, false, 'g', 1, loss), ply })
    const ev = [
      ...Array.from({ length: 4 }, () => E('blunders', true, 'g', 1)),
      at('blunders', 7, 50), // blunders: 4/5 = 80, weakest
      ...Array.from({ length: 9 }, () => E('openings', true, 'g', 1)),
      at('openings', 7, 50),
      at('openings', 3, 10), // openings: 9/11 = 82
    ]
    const w = weakestSkills(scoreSkills(ev))
    expect(w.map((x) => x.skill)).toEqual(['blunders', 'openings'])
    expect(w.map((x) => x.example!.ply)).toEqual([7, 3])
  })

  it('writes one sentence with the example', () => {
    expect(weaknessSentence(weak[0], 'Black replies Nc2+, forking your king and rook.', 'move 14 (Oct 12)')).toBe(
      '3 of your 4 fork moments went wrong. For example, move 14 (Oct 12): Black replies Nc2+, forking your king and rook.',
    )
  })
})

describe('skillTrend', () => {
  it('reports the score after each game once there is enough data', () => {
    const games = [
      { gameId: 'a', at: 1, events: Array.from({ length: 5 }, () => E('openings', false, 'a', 1)) },
      { gameId: 'b', at: 2, events: Array.from({ length: 5 }, () => E('openings', true, 'b', 2)) },
    ]
    const t = skillTrend(games, 'openings')
    expect(t.map((p) => p.at)).toEqual([1, 2])
    expect(t[0].score).toBe(0)
    expect(t[1].score).toBeGreaterThan(50)
  })
})

describe('tactic successes count', () => {
  const tagged = (tags: MoveReview['tags']): MoveReview => ({ cls: 'best', loss: 0, concepts: [], tags })
  it('a found tactic and a defended threat are successes; a failed defense is not', () => {
    const g = game('t', 1, [
      ['e2e4', 'e4', 'user', tagged([{ motif: 'fork', outcome: 'found' }])],
      ['e7e5', 'e5', 'engine'],
      ['g1f3', 'Nf3', 'user', tagged([{ motif: 'hanging', outcome: 'defended' }])],
      ['b8c6', 'Nc6', 'engine'],
      ['f3g5', 'Ng5', 'user', { ...tagged([{ motif: 'hanging', outcome: 'failed-defense' }]), cls: 'blunder', loss: 30 }],
    ])
    const ev = eventsFromGame(g)
    expect(ev.filter((e) => e.skill === 'motif:fork').map((e) => [e.ok, e.outcome])).toEqual([[true, 'found']])
    expect(ev.filter((e) => e.skill === 'motif:hanging').map((e) => [e.ok, e.outcome])).toEqual([
      [true, 'defended'],
      [false, 'failed-defense'],
    ])
    expect(ev.filter((e) => e.skill === 'tactics').map((e) => e.ok)).toEqual([true, true, false])
  })
  it('older verdicts without tags still use the concept mapping', () => {
    const g = game('o', 1, [['e2e4', 'e4', 'user', rv('blunder', ['hanging-piece'])]])
    expect(eventsFromGame(g).filter((e) => e.skill === 'motif:hanging').map((e) => e.ok)).toEqual([false])
  })
  it('with successes counted, a mostly-careful player scores well on a motif', () => {
    const moves: [string, string, 'user' | 'engine', MoveReview?][] = []
    // 4 defended threats and 1 failure over a game: score should be 80, not 0.
    const seq = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5', 'c2c3', 'd7d6']
    seq.forEach((u, i) => moves.push([u, u, i % 2 ? 'engine' : 'user', i % 2 ? undefined : tagged([{ motif: 'hanging', outcome: i === 8 ? 'failed-defense' : 'defended' }])]))
    expect(scoreSkills(eventsFromGame(game('m', 1, moves)))['motif:hanging'].score).toBe(80)
  })
})

describe('puzzles feed tactic scores', () => {
  const day = Date.UTC(2026, 9, 15)
  it('maps Lichess themes to motifs; clean solves are successes', () => {
    const ev = eventsFromPuzzles([
      { puzzleId: 'a', themes: ['fork', 'middlegame', 'short'], clean: true, at: day },
      { puzzleId: 'b', themes: ['backRankMate', 'mateIn2'], clean: false, at: day },
    ])
    expect(ev.filter((e) => e.skill === 'motif:fork').map((e) => e.ok)).toEqual([true])
    expect(ev.filter((e) => e.skill === 'motif:mate').map((e) => e.ok)).toEqual([false])
    expect(ev.filter((e) => e.skill === 'tactics')).toHaveLength(2)
    expect(ev.every((e) => e.source === 'puzzle' && e.gameId === 'puzzles:2026-10-15')).toBe(true)
  })
  it('solved puzzles raise the motif score', () => {
    const fromGames = Array.from({ length: 3 }, () => E('motif:fork', false, 'g', 1))
    const before = scoreSkills(fromGames)['motif:fork'].score
    const puzzles = eventsFromPuzzles(Array.from({ length: 6 }, (_, i) => ({ puzzleId: `p${i}`, themes: ['fork'], clean: true, at: day })))
    const after = scoreSkills([...fromGames, ...puzzles])['motif:fork'].score
    expect(before).toBe(0)
    expect(after!).toBeGreaterThan(50)
  })
  it('puzzle misses are never used as an example position', () => {
    const puzzles = eventsFromPuzzles(Array.from({ length: 5 }, (_, i) => ({ puzzleId: `p${i}`, themes: ['pin'], clean: false, at: day })))
    const s = scoreSkills(puzzles)['motif:pin']
    expect(s.score).toBe(0)
    expect(s.example).toBeNull()
    expect(weakestSkills(scoreSkills(puzzles))).toEqual([])
  })
})
