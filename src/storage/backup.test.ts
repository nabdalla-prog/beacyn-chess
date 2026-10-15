import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, MAX_BACKUP_BYTES, makeBackup, mergeBackup, parseBackup, type BackupData } from './backup'
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './db'
import { emptyTraining } from '../training/store'
import { newGame, type GameRecord } from '../game/session'

function game(id: string, moves: [string, string][] = [['e2e4', 'e4'], ['e7e5', 'e5']]): GameRecord {
  return {
    ...newGame({ userColor: 'w', rating: 800, timeControl: null, now: 1_760_000_000_000 }),
    id,
    endedAt: 1_760_000_100_000,
    result: { winner: 'w', termination: 'resign' },
    moves: moves.map(([uci, san], i) => ({ uci, san, by: i % 2 ? 'engine' : 'user', timeMs: 1000 })),
  }
}

function data(over: Partial<BackupData> = {}): BackupData {
  return {
    games: [game('g1')],
    profile: { ...DEFAULT_PROFILE, rating: 950, gamesPlayed: 3 },
    settings: { ...DEFAULT_SETTINGS, boardTheme: 'green' },
    training: { ...emptyTraining(), lessonsDone: ['forks'], activeDays: ['2026-10-14'] },
    badges: { 'first-game': 1_760_000_100_000 },
    currentGame: null,
    onboarded: true,
    ...over,
  }
}

const file = (d: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ app: 'beacyn-chess', version: BACKUP_VERSION, exportedAt: 'x', data: d, ...extra })

describe('parseBackup: good files', () => {
  it('round-trips an export', () => {
    const d = data()
    const r = parseBackup(JSON.stringify(makeBackup(d)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toEqual([])
    expect(r.data.games).toEqual(d.games)
    expect(r.data.profile).toEqual(d.profile)
    expect(r.data.training.lessonsDone).toEqual(['forks'])
    expect(r.data.settings.boardTheme).toBe('green')
    expect(r.data.badges).toEqual(d.badges)
  })
  it('a backup from before M7 (no drills, dates or badges) still loads', () => {
    const t = { cards: {}, results: [], rating: null, seen: [], plan: null, openingCards: {}, lessonsDone: [] }
    const r = parseBackup(file({ games: [], profile: DEFAULT_PROFILE, settings: {}, training: t }))
    expect(r.ok && r.data.training.drills).toEqual([])
  })
})

describe('parseBackup: malformed, oversized, wrong version', () => {
  it('not JSON', () => expect(parseBackup('{"app": "beacyn-chess", ')).toEqual({ ok: false, error: expect.stringContaining('isn’t valid JSON') }))
  it('JSON but not ours', () => {
    expect(parseBackup('[]').ok).toBe(false)
    expect(parseBackup('null').ok).toBe(false)
    expect(parseBackup('{"app":"other","version":1,"data":{}}')).toEqual({ ok: false, error: 'That file isn’t a Beacyn Chess backup.' })
  })
  it('oversized text is refused before parsing', () => {
    const big = ' '.repeat(MAX_BACKUP_BYTES + 1)
    expect(parseBackup(big)).toEqual({ ok: false, error: expect.stringContaining('too big') })
  })
  it('newer and unknown versions', () => {
    expect(parseBackup(file(data(), { version: BACKUP_VERSION + 1 }))).toEqual({ ok: false, error: expect.stringContaining('newer version') })
    expect(parseBackup(file(data(), { version: '1' })).ok).toBe(false)
    expect(parseBackup(file(data(), { version: 0 })).ok).toBe(false)
  })
  it('wrong top-level shapes reject the whole file', () => {
    expect(parseBackup(file('nope'))).toEqual({ ok: false, error: 'That backup is damaged, so nothing was imported.' })
    expect(parseBackup(file({ ...data(), games: 'lots' })).ok).toBe(false)
    expect(parseBackup(file({ ...data(), training: { results: 5 } })).ok).toBe(false)
  })
  it('too many records is refused', () => {
    expect(parseBackup(file({ ...data(), games: Array(5001).fill(0) })).ok).toBe(false)
  })
})

describe('parseBackup: bad records are skipped, not fatal', () => {
  it('skips a game with an illegal move or wrong notation and says so', () => {
    const illegal = game('bad1', [['e2e5', 'e5']])
    const lying = game('bad2', [['e2e4', 'd4']])
    const r = parseBackup(file({ ...data(), games: [game('ok'), illegal, lying, { id: 7 }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.games.map((g) => g.id)).toEqual(['ok'])
    expect(r.skipped).toEqual(['3 games'])
  })
  it('wrong types inside a game skip it', () => {
    const g = { ...game('x'), rating: 'high' }
    const g2 = { ...game('y'), startFen: 'not a fen' }
    const g3 = { ...game('z'), moves: [{ uci: 'e2e4', san: 'e4', by: 'user', timeMs: -5 }] }
    const r = parseBackup(file({ ...data(), games: [g, g2, g3] }))
    expect(r.ok && r.data.games).toEqual([])
  })
  it('bad settings fall back to defaults', () => {
    const r = parseBackup(file({ ...data(), settings: { theme: 'neon', boardTheme: 42, coachMode: 'guided' } }))
    expect(r.ok && r.data.settings).toMatchObject({ theme: 'system', boardTheme: 'beacyn', coachMode: 'guided' })
  })
})

describe('parseBackup: hostile files', () => {
  it('drops unknown fields everywhere', () => {
    const g = { ...game('g1'), evil: '<img src=x onerror=alert(1)>', moves: [{ uci: 'e2e4', san: 'e4', by: 'user', timeMs: 1, onclick: 'x' }] }
    const r = parseBackup(file({ ...data(), games: [g], extra: 1 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(JSON.stringify(r.data)).not.toContain('onerror')
    expect(JSON.stringify(r.data)).not.toContain('onclick')
  })
  it('HTML in text fields stays plain text (and long strings are refused)', () => {
    const g = { ...game('g1'), opponentName: '<script>alert(1)</script>' }
    const r = parseBackup(file({ ...data(), games: [g] }))
    expect(r.ok && r.data.games[0].opponentName).toBe('<script>alert(1)</script>') // React renders it as text, never HTML
    const long = { ...game('g2'), opponentName: 'x'.repeat(10_000) }
    expect(parseBackup(file({ ...data(), games: [long] })).ok && parseBackup(file({ ...data(), games: [long] }))).toMatchObject({ skipped: ['1 games'] })
  })
  it('prototype pollution keys are ignored', () => {
    const text = file({ ...data(), badges: JSON.parse('{"__proto__": {"polluted": 1}, "constructor": 5, "first-win": 1}') }).replace(
      '"cards":{}',
      '"cards":{"__proto__":{"polluted":true}}',
    )
    const r = parseBackup(text)
    expect(r.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    if (r.ok) {
      expect(Object.keys(r.data.badges)).toEqual(['first-win'])
      expect(Object.getPrototypeOf(r.data.training.cards)).toBe(Object.prototype)
    }
  })
  it('AI settings in a file are never imported', () => {
    const r = parseBackup(file({ ...data(), settings: { ...DEFAULT_SETTINGS, ai: { provider: 'ollama', ollamaUrl: 'http://evil.example' } } }))
    expect(r.ok && r.data.settings.ai).toEqual({ provider: 'off' })
  })
  it('deeply nested junk does not crash', () => {
    // Built as text: JSON.stringify itself would overflow on nesting this deep.
    const deep = (n: number) => '['.repeat(n) + '1' + ']'.repeat(n)
    const inGame = file({ ...data(), games: [{ ...game('g'), analysis: { depth: 12, evals: 'DEEP' } }] }).replace('"DEEP"', deep(5000))
    const r = parseBackup(inGame)
    expect(r.ok && r.skipped).toEqual(['1 games'])
    // Far deeper still: whatever the JSON parser does with it, nothing throws and no game gets in.
    const huge = file({ ...data(), games: 'DEEP' }).replace('"DEEP"', deep(200_000))
    expect(() => parseBackup(huge)).not.toThrow()
    const h = parseBackup(huge)
    expect(h.ok ? h.data.games : []).toEqual([])
  })
  it('numbers outside sane ranges are refused', () => {
    const r = parseBackup(file({ ...data(), profile: { rating: 1e9, gamesPlayed: 1, ratingHistory: [] } }))
    expect(r.ok && r.data.profile).toEqual(DEFAULT_PROFILE)
    expect(r.ok && r.skipped).toEqual(['1 rating history'])
  })
})

describe('mergeBackup', () => {
  it('keeps everything from both, this browser’s settings and copies win', () => {
    const mine = data({ games: [game('a'), game('shared')] })
    const theirs = data({
      games: [game('b'), { ...game('shared'), rating: 1234 }],
      settings: { ...DEFAULT_SETTINGS, boardTheme: 'blue' },
      training: { ...emptyTraining(), lessonsDone: ['pins'], activeDays: ['2026-10-01'] },
      badges: { 'first-game': 5, 'first-win': 9 },
    })
    const m = mergeBackup(mine, theirs)
    expect(m.games.map((g) => g.id).sort()).toEqual(['a', 'b', 'shared'])
    expect(m.games.find((g) => g.id === 'shared')!.rating).toBe(800)
    expect(m.settings.boardTheme).toBe('green')
    expect(m.training.lessonsDone.sort()).toEqual(['forks', 'pins'])
    expect(m.training.activeDays).toEqual(['2026-10-01', '2026-10-14'])
    expect(m.badges).toEqual({ 'first-game': 5, 'first-win': 9 })
  })
})
