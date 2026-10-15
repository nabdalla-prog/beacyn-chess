// Export / import of everything this browser has saved, as one versioned JSON file.
// An imported file is untrusted: it is size-limited, every record is rebuilt field by
// field from a whitelist (unknown keys are dropped), games are replayed with chess.js,
// bad records are skipped with a count, and nothing is ever rendered as HTML.
import { Chess } from 'chess.js'
import type { GameRecord, MoveRecord, MoveReview, Termination } from '../game/session'
import type { StoredEval } from '../coach/review'
import type { TacticTag } from '../coach/tactics'
import type { Card } from '../training/srs'
import type { DrillResult, SrsEntry, TrainingState } from '../training/store'
import type { TrainPuzzle } from '../training/puzzles'
import type { PlanItem } from '../training/plan'
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type Profile, type Settings } from './db'
import { BOARD_THEMES, PIECE_SETS } from '../ui/themes'

export const BACKUP_APP = 'beacyn-chess'
export const BACKUP_VERSION = 1
/** Bigger files are refused before they are read. */
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024
const MAX_GAMES = 5000
const MAX_MOVES = 600

export interface BackupData {
  games: GameRecord[]
  profile: Profile
  settings: Settings
  training: TrainingState
  /** Badges earned, with the date. */
  badges: Record<string, number>
  currentGame: GameRecord | null
  onboarded: boolean
}

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  data: BackupData
}

export type ParseResult = { ok: true; data: BackupData; skipped: string[] } | { ok: false; error: string }

export function makeBackup(data: BackupData, now = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data }
}

// ---------- tiny validation kit ----------

class Bad extends Error {}
const fail = (what: string): never => {
  throw new Bad(what)
}
type U = unknown
const isObj = (v: U): v is Record<string, U> => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: U, what: string) => (isObj(v) ? v : fail(what))
const arr = (v: U, what: string, max: number) => (Array.isArray(v) ? (v.length <= max ? v : fail(`${what}: too many`)) : fail(what))
const num = (v: U, what: string, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail(what)
const int = (v: U, what: string, min = -Infinity, max = Infinity) => (Number.isInteger(v) ? num(v, what, min, max) : fail(what))
const str = (v: U, what: string, max = 200, re?: RegExp) =>
  typeof v === 'string' && v.length <= max && (!re || re.test(v)) ? v : fail(what)
const bool = (v: U, what: string) => (typeof v === 'boolean' ? v : fail(what))
const oneOf = <T extends string>(v: U, options: readonly T[], what: string): T => (options.includes(v as T) ? (v as T) : fail(what))
const opt = <T>(v: U, f: (v: U) => T): T | undefined => (v === undefined ? undefined : f(v))
/** Record keys from the file: plain ids only, never prototype names. */
const KEY_RE = /^[\w:.-]{1,80}$/
const safeKey = (k: string) => KEY_RE.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype'

const TIME = (v: U, what: string) => num(v, what, 0, 8.64e15) // a valid Date range
const ID_RE = /^[\w-]{1,64}$/
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const COLORS = ['w', 'b'] as const
const CLASSES = ['brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder', 'missed-win'] as const
const TERMINATIONS: readonly Termination[] = ['checkmate', 'stalemate', 'threefold', 'fifty-move', 'insufficient', 'resign', 'timeout', 'unknown']
const MOTIFS = ['hanging', 'fork', 'pin', 'discovered', 'mate'] as const
const OUTCOMES = ['found', 'defended', 'missed', 'failed-defense'] as const
const THEME_RE = /^[a-zA-Z0-9]{1,40}$/

function fen(v: U, what: string): string {
  const f = str(v, what, 100)
  try {
    new Chess(f)
  } catch {
    fail(what)
  }
  return f
}

/** Collects good records and counts bad ones, so one damaged record doesn't sink the file. */
function each<T>(list: U[], parse: (v: U) => T, label: string, skipped: Map<string, number>): T[] {
  const out: T[] = []
  for (const v of list) {
    try {
      out.push(parse(v))
    } catch (e) {
      if (!(e instanceof Bad)) throw e
      skipped.set(label, (skipped.get(label) ?? 0) + 1)
    }
  }
  return out
}

// ---------- records ----------

function review(v: U): MoveReview {
  const o = obj(v, 'review')
  return {
    cls: oneOf(o.cls, CLASSES, 'review.cls'),
    loss: num(o.loss, 'review.loss', -100, 100),
    best: opt(o.best, (x) => str(x, 'review.best', 5, UCI_RE)),
    concepts: arr(o.concepts, 'review.concepts', 30).map((c) => str(c, 'concept', 40, /^[\w-]+$/)),
    text: opt(o.text, (x) => str(x, 'review.text', 1000)),
    tags: opt(o.tags, (x) =>
      arr(x, 'tags', 20).map((t): TacticTag => {
        const to = obj(t, 'tag')
        return { motif: oneOf(to.motif, MOTIFS, 'tag.motif'), outcome: oneOf(to.outcome, OUTCOMES, 'tag.outcome') }
      }),
    ),
  }
}

function storedEval(v: U): StoredEval | null | undefined {
  if (v === null || v === undefined) return v
  const o = obj(v, 'eval')
  const s = obj(o.s, 'eval.s')
  return {
    s: { type: oneOf(s.type, ['cp', 'mate'] as const, 'score.type'), value: int(s.value, 'score.value', -100000, 100000) },
    pv: arr(o.pv, 'pv', 20).map((m) => str(m, 'pv move', 5, UCI_RE)),
  }
}

export function parseGame(v: U): GameRecord {
  const o = obj(v, 'game')
  const startFen = fen(o.startFen, 'startFen')
  const moves = arr(o.moves, 'moves', MAX_MOVES).map((m): MoveRecord => {
    const mo = obj(m, 'move')
    return {
      san: str(mo.san, 'san', 10),
      uci: str(mo.uci, 'uci', 5, UCI_RE),
      by: oneOf(mo.by, ['user', 'engine'] as const, 'move.by'),
      timeMs: num(mo.timeMs, 'timeMs', 0, 1e10),
      clockMs: opt(mo.clockMs, (x) => num(x, 'clockMs', -1e7, 1e10)),
      review: opt(mo.review, review),
      hintLevel: opt(mo.hintLevel, (x) => int(x, 'hintLevel', 0, 4)),
      warned: opt(mo.warned, (x) => bool(x, 'warned')),
    }
  })
  // Every move must be legal and match its notation.
  const c = new Chess(startFen)
  for (const m of moves) {
    let played
    try {
      played = c.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
    } catch {
      fail('illegal move')
    }
    if (played!.san !== m.san) fail('move notation')
  }
  const tc = o.timeControl === null || o.timeControl === undefined ? null : obj(o.timeControl, 'timeControl')
  const result = opt(o.result, (x) => {
    const r = obj(x, 'result')
    return { winner: r.winner === null ? null : oneOf(r.winner, COLORS, 'winner'), termination: oneOf(r.termination, TERMINATIONS, 'termination') }
  })
  const analysis = opt(o.analysis, (x) => {
    const a = obj(x, 'analysis')
    return { depth: int(a.depth, 'depth', 1, 60), evals: arr(a.evals, 'evals', MAX_MOVES + 1).map(storedEval) }
  })
  return {
    id: str(o.id, 'id', 64, ID_RE),
    startedAt: TIME(o.startedAt, 'startedAt'),
    endedAt: opt(o.endedAt, (x) => TIME(x, 'endedAt')),
    userColor: oneOf(o.userColor, COLORS, 'userColor'),
    rating: int(o.rating, 'rating', 0, 4000),
    timeControl: tc ? { initial: int(tc.initial, 'initial', 0, 86400), increment: int(tc.increment, 'increment', 0, 600) } : null,
    startFen,
    moves,
    takebacks: int(o.takebacks, 'takebacks', 0, 10000),
    coachMode: opt(o.coachMode, (x) => oneOf(x, ['silent', 'hints', 'guided'] as const, 'coachMode')),
    analysis,
    retries: opt(o.retries, (x) =>
      arr(x, 'retries', 100).map((r) => {
        const ro = obj(r, 'retry')
        return { ply: int(ro.ply, 'ply', 0, MAX_MOVES), solved: bool(ro.solved, 'solved'), tries: int(ro.tries, 'tries', 0, 1000), at: TIME(ro.at, 'at') }
      }),
    ),
    imported: opt(o.imported, (x) => bool(x, 'imported')),
    opponentName: opt(o.opponentName, (x) => str(x, 'opponentName', 60)),
    result,
    ratingAfter: opt(o.ratingAfter, (x) => int(x, 'ratingAfter', 0, 4000)),
  }
}

function parseProfile(v: U): Profile {
  const o = obj(v, 'profile')
  return {
    rating: int(o.rating, 'rating', 100, 4000),
    gamesPlayed: int(o.gamesPlayed, 'gamesPlayed', 0, 1e6),
    ratingHistory: arr(o.ratingHistory, 'ratingHistory', 20000).map((h) => {
      const ho = obj(h, 'history')
      return { at: TIME(ho.at, 'at'), rating: int(ho.rating, 'rating', 0, 4000), gameId: str(ho.gameId, 'gameId', 64, ID_RE) }
    }),
  }
}

function parseSettings(v: U): Settings {
  const o = obj(v, 'settings')
  // Settings are forgiving: a bad value falls back to the default instead of failing.
  const pick = <T>(f: () => T, d: T): T => {
    try {
      return f()
    } catch (e) {
      if (e instanceof Bad) return d
      throw e
    }
  }
  const D = DEFAULT_SETTINGS
  return {
    theme: pick(() => oneOf(o.theme, ['system', 'light', 'dark'] as const, 'theme'), D.theme),
    userColor: pick(() => oneOf(o.userColor, ['w', 'b', 'random'] as const, 'userColor'), D.userColor),
    timeControl: pick(() => int(o.timeControl, 'timeControl', 0, 3), D.timeControl),
    adaptive: pick(() => bool(o.adaptive, 'adaptive'), D.adaptive),
    coachMode: pick(() => oneOf(o.coachMode, ['silent', 'hints', 'guided'] as const, 'coachMode'), D.coachMode),
    sound: pick(() => opt(o.sound, (x) => bool(x, 'sound')), undefined),
    boardTheme: pick(() => oneOf(o.boardTheme, BOARD_THEMES.map((t) => t.id), 'boardTheme'), D.boardTheme),
    pieceSet: pick(() => oneOf(o.pieceSet, PIECE_SETS.map((t) => t.id), 'pieceSet'), D.pieceSet),
    // AI settings are never imported: a file must not point this browser at a server. Importing keeps the current ones.
    ai: { provider: 'off' },
  }
}

function card(v: U): Card {
  const o = obj(v, 'card')
  return {
    id: str(o.id, 'card.id', 80),
    ease: num(o.ease, 'ease', 1.3, 10),
    interval: num(o.interval, 'interval', 0, 36500),
    reps: int(o.reps, 'reps', 0, 1e5),
    lapses: int(o.lapses, 'lapses', 0, 1e5),
    due: TIME(o.due, 'due'),
  }
}

function puzzle(v: U): TrainPuzzle {
  const o = obj(v, 'puzzle')
  return {
    id: str(o.id, 'puzzle.id', 80, /^[\w:-]+$/),
    source: oneOf(o.source, ['lichess', 'own'] as const, 'source'),
    fen: fen(o.fen, 'puzzle.fen'),
    setup: opt(o.setup, (x) => str(x, 'setup', 5, UCI_RE)),
    solution: arr(o.solution, 'solution', 30).map((m) => str(m, 'solution', 5, UCI_RE)),
    themes: arr(o.themes, 'themes', 20).map((t) => str(t, 'theme', 40, THEME_RE)),
    rating: opt(o.rating, (x) => int(x, 'rating', 0, 4000)),
    gameId: opt(o.gameId, (x) => str(x, 'gameId', 64, ID_RE)),
    ply: opt(o.ply, (x) => int(x, 'ply', 0, MAX_MOVES)),
    playedSan: opt(o.playedSan, (x) => str(x, 'playedSan', 10)),
  }
}

/** A keyed record, e.g. cards by id; bad keys or values are skipped. */
function keyed<T>(v: U, what: string, max: number, parse: (v: U) => T, skipped: Map<string, number>): Record<string, T> {
  const o = obj(v, what)
  const keys = Object.keys(o)
  if (keys.length > max) fail(`${what}: too many`)
  const out: Record<string, T> = {}
  for (const k of keys) {
    try {
      if (!safeKey(k)) fail('key')
      out[k] = parse(o[k])
    } catch (e) {
      if (!(e instanceof Bad)) throw e
      skipped.set(what, (skipped.get(what) ?? 0) + 1)
    }
  }
  return out
}

function planItem(v: U): PlanItem {
  const o = obj(v, 'plan item')
  const base = { id: str(o.id, 'id', 40, /^[\w:-]+$/), target: int(o.target, 'target', 0, 1000), done: int(o.done, 'done', 0, 1000) }
  const kind = oneOf(o.kind, ['review', 'own', 'theme', 'openings', 'game'] as const, 'kind')
  if (kind === 'theme') return { ...base, kind, theme: str(o.theme, 'theme', 40, THEME_RE) as never, reason: str(o.reason, 'reason', 300) }
  return { ...base, kind }
}

function parseTraining(v: U, skipped: Map<string, number>): TrainingState {
  const o = obj(v, 'training')
  const plan = o.plan == null ? null : (() => {
    try {
      const p = obj(o.plan, 'plan')
      return { date: str(p.date, 'date', 10, DAY_RE), items: arr(p.items, 'items', 20).map(planItem) }
    } catch (e) {
      if (e instanceof Bad) return null // a plan is rebuilt every day anyway
      throw e
    }
  })()
  return {
    cards: keyed(o.cards, 'puzzle reviews', 5000, (c): SrsEntry => ({ ...card(c), puzzle: puzzle(obj(c, 'card').puzzle) }), skipped),
    results: each(
      arr(o.results, 'results', 3000),
      (r) => {
        const ro = obj(r, 'result')
        return {
          puzzleId: str(ro.puzzleId, 'puzzleId', 80),
          themes: arr(ro.themes, 'themes', 20).map((t) => str(t, 'theme', 40, THEME_RE)),
          clean: bool(ro.clean, 'clean'),
          at: TIME(ro.at, 'at'),
          rating: opt(ro.rating, (x) => int(x, 'rating', 0, 4000)),
        }
      },
      'puzzle results',
      skipped,
    ),
    rating: o.rating === null || o.rating === undefined ? null : int(o.rating, 'puzzle rating', 0, 4000),
    seen: each(arr(o.seen ?? [], 'seen', 4000), (s) => str(s, 'seen', 80), 'seen puzzles', skipped),
    plan,
    openingCards: keyed(o.openingCards ?? {}, 'opening reviews', 1000, card, skipped),
    lessonsDone: each(arr(o.lessonsDone ?? [], 'lessonsDone', 200), (s) => str(s, 'lesson', 40, /^[\w-]+$/), 'lessons', skipped),
    lessonsAt: keyed(o.lessonsAt ?? {}, 'lesson dates', 200, (x) => TIME(x, 'lesson date'), skipped),
    drills: each(
      arr(o.drills ?? [], 'drills', 500),
      (d): DrillResult => {
        const dd = obj(d, 'drill')
        return { id: str(dd.id, 'drill id', 40, /^[\w-]+$/), won: bool(dd.won, 'won'), mate: bool(dd.mate, 'mate'), at: TIME(dd.at, 'at') }
      },
      'drill results',
      skipped,
    ),
    activeDays: each(arr(o.activeDays ?? [], 'activeDays', 800), (s) => str(s, 'day', 10, DAY_RE), 'active days', skipped),
  }
}

// ---------- the file ----------

/** Reads a backup file's text. Never throws: problems come back as a friendly message. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'That file is too big to be a Beacyn Chess backup (the limit is 25 MB).' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file isn’t a Beacyn Chess backup (it isn’t valid JSON).' }
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) return { ok: false, error: 'That file isn’t a Beacyn Chess backup.' }
  if (raw.version !== BACKUP_VERSION) {
    return typeof raw.version === 'number' && raw.version > BACKUP_VERSION
      ? { ok: false, error: 'This backup was made by a newer version of Beacyn Chess. Reload the page to update, then try again.' }
      : { ok: false, error: 'This backup’s version isn’t one we can read.' }
  }
  const skipped = new Map<string, number>()
  try {
    const d = obj(raw.data, 'data')
    const games = each(arr(d.games, 'games', MAX_GAMES), parseGame, 'games', skipped)
    // Keep one copy of each game id.
    const unique = [...new Map(games.map((g) => [g.id, g])).values()]
    let currentGame: GameRecord | null = null
    if (d.currentGame != null) {
      try {
        currentGame = parseGame(d.currentGame)
        if (currentGame.result) currentGame = null
      } catch (e) {
        if (!(e instanceof Bad)) throw e
        skipped.set('unfinished game', 1)
      }
    }
    let profile = DEFAULT_PROFILE
    try {
      profile = parseProfile(d.profile)
    } catch (e) {
      if (!(e instanceof Bad)) throw e
      skipped.set('rating history', 1)
    }
    const data: BackupData = {
      games: unique,
      profile,
      settings: parseSettings(d.settings ?? {}),
      training: parseTraining(d.training ?? {}, skipped),
      badges: keyed(d.badges ?? {}, 'badges', 200, (x) => TIME(x, 'badge date'), skipped),
      currentGame,
      onboarded: d.onboarded === true,
    }
    return { ok: true, data, skipped: [...skipped].map(([what, n]) => `${n} ${what}`) }
  } catch (e) {
    if (e instanceof Bad) return { ok: false, error: 'That backup is damaged, so nothing was imported.' }
    return { ok: false, error: 'Something went wrong reading that file, so nothing was imported.' }
  }
}

// ---------- merging ----------

const reviewedMore = (a: Card, b: Card) => (a.reps + a.lapses >= b.reps + b.lapses ? a : b)

function mergeKeyed<T>(a: Record<string, T>, b: Record<string, T>, pick: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...a }
  for (const [k, v] of Object.entries(b)) if (safeKey(k)) out[k] = out[k] ? pick(out[k], v) : v
  return out
}

/**
 * Merge keeps everything from both: games by id (this browser's copy wins), puzzle
 * history and drills by time, the more-reviewed card, the earliest badge date.
 * This browser's settings, rating and today's plan stay as they are.
 */
export function mergeBackup(mine: BackupData, theirs: BackupData): BackupData {
  const games = new Map(theirs.games.map((g) => [g.id, g]))
  for (const g of mine.games) games.set(g.id, g)
  const byKey = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()]
  const t = mine.training
  const u = theirs.training
  const history = byKey([...theirs.profile.ratingHistory, ...mine.profile.ratingHistory], (h) => h.gameId).sort((a, b) => a.at - b.at)
  return {
    games: [...games.values()],
    profile: { ...mine.profile, gamesPlayed: Math.max(mine.profile.gamesPlayed, theirs.profile.gamesPlayed), ratingHistory: history },
    settings: mine.settings,
    training: {
      ...t,
      cards: mergeKeyed(t.cards, u.cards, (a, b) => ({ ...reviewedMore(a, b), puzzle: a.puzzle })),
      results: byKey([...u.results, ...t.results], (r) => `${r.puzzleId}@${r.at}`).sort((a, b) => a.at - b.at).slice(-3000),
      rating: t.rating ?? u.rating,
      seen: [...new Set([...u.seen, ...t.seen])].slice(-4000),
      openingCards: mergeKeyed(t.openingCards, u.openingCards, reviewedMore),
      lessonsDone: [...new Set([...t.lessonsDone, ...u.lessonsDone])],
      lessonsAt: mergeKeyed(t.lessonsAt, u.lessonsAt, Math.min),
      drills: byKey([...u.drills, ...t.drills], (d) => `${d.id}@${d.at}`).sort((a, b) => a.at - b.at).slice(-500),
      activeDays: [...new Set([...u.activeDays, ...t.activeDays])].sort().slice(-800),
    },
    badges: mergeKeyed(mine.badges, theirs.badges, Math.min),
    currentGame: mine.currentGame ?? theirs.currentGame,
    onboarded: mine.onboarded || theirs.onboarded,
  }
}
