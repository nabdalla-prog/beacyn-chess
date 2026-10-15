// Pure game-session logic: the record we store, replaying it with chess.js,
// game-over detection, takebacks and PGN export.
import { Chess, type Move, type Square } from 'chess.js'
import type { MoveClass } from '../coach/classify'
import type { StoredEval } from '../coach/review'

export type Color = 'w' | 'b'

export interface TimeControl {
  /** Initial time per side in seconds. */
  initial: number
  /** Increment per move in seconds. */
  increment: number
}

export const TIME_CONTROLS: { label: string; value: TimeControl | null }[] = [
  { label: 'Untimed', value: null },
  { label: '5 + 0', value: { initial: 300, increment: 0 } },
  { label: '10 + 0', value: { initial: 600, increment: 0 } },
  { label: '15 + 10', value: { initial: 900, increment: 10 } },
]

export interface MoveRecord {
  san: string
  uci: string
  by: 'user' | 'engine'
  /** Milliseconds spent on this move. */
  timeMs: number
  /** Mover's remaining clock after the move (timed games only). */
  clockMs?: number
  /** Coach's verdict on a user move (engine facts only). */
  review?: MoveReview
  /** Highest hint level used before this move (1–4). */
  hintLevel?: number
  /** The user saw a guided-mode blunder warning and played the move anyway. */
  warned?: boolean
}

export interface MoveReview {
  cls: MoveClass
  /** Win-probability points lost. */
  loss: number
  /** Engine's best move (UCI) in the position before. */
  best?: string
  concepts: string[]
}

export type CoachMode = 'silent' | 'hints' | 'guided'

export type Termination =
  | 'checkmate'
  | 'stalemate'
  | 'threefold'
  | 'fifty-move'
  | 'insufficient'
  | 'resign'
  | 'timeout'
  /** Imported game whose PGN only gives the result. */
  | 'unknown'

export interface GameResult {
  winner: Color | null
  termination: Termination
}

export interface GameRecord {
  id: string
  startedAt: number
  endedAt?: number
  userColor: Color
  /** Opponent strength (estimated rating) used for this game. */
  rating: number
  timeControl: TimeControl | null
  startFen: string
  moves: MoveRecord[]
  /** Number of takebacks used (logged, never penalised). */
  takebacks: number
  coachMode?: CoachMode
  /** Post-game engine review: top line per position (index i = before move i). */
  analysis?: { depth: number; evals: (StoredEval | null | undefined)[] }
  /** "Retry this position" attempts from the review. */
  retries?: { ply: number; solved: boolean; tries: number; at: number }[]
  /** Imported from PGN: not played against the coach, never affects the rating. */
  imported?: boolean
  opponentName?: string
  result?: GameResult
  /** Opponent rating after the adaptive adjustment, once finished. */
  ratingAfter?: number
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function newGame(opts: {
  userColor: Color
  rating: number
  timeControl: TimeControl | null
  startFen?: string
  now?: number
}): GameRecord {
  const now = opts.now ?? Date.now()
  return {
    id: `g${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: now,
    userColor: opts.userColor,
    rating: opts.rating,
    timeControl: opts.timeControl,
    startFen: opts.startFen ?? START_FEN,
    moves: [],
    takebacks: 0,
  }
}

export function replay(game: Pick<GameRecord, 'startFen' | 'moves'>, upTo = game.moves.length): Chess {
  const chess = new Chess(game.startFen)
  for (const m of game.moves.slice(0, upTo)) {
    if (!tryUci(chess, m.uci)) throw new Error(`Illegal stored move ${m.uci}`)
  }
  return chess
}

export function moveToUci(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`
}

/** Try a move given in UCI; returns the chess.js move or null if illegal. */
export function tryUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
}

/** Accepts SAN ("Nf3", "exd5", "O-O", "e8=Q") or UCI ("g1f3"); case-tolerant for piece letters. */
export function parseUserMove(chess: Chess, text: string): Move | null {
  const s = text.trim().replace(/0/g, 'O')
  if (!s) return null
  const legal = chess.moves({ verbose: true })
  const norm = (x: string) => x.replace(/[+#!?]/g, '').toLowerCase()
  const exact = legal.find((m) => m.san === s || norm(m.san) === norm(s) && /^[a-h]/.test(s) === /^[a-h]/.test(m.san))
  if (exact) return exact
  const caseless = legal.filter((m) => norm(m.san) === norm(s))
  if (caseless.length === 1) return caseless[0]
  const uci = s.toLowerCase().replace(/[-x\s]/g, '')
  return legal.find((m) => moveToUci(m) === uci || (m.promotion === 'q' && `${m.from}${m.to}` === uci)) ?? null
}

export function legalDests(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>()
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from)
    if (list) {
      if (!list.includes(m.to)) list.push(m.to)
    } else dests.set(m.from, [m.to])
  }
  return dests
}

export function detectGameOver(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) return { winner: chess.turn() === 'w' ? 'b' : 'w', termination: 'checkmate' }
  if (chess.isStalemate()) return { winner: null, termination: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { winner: null, termination: 'insufficient' }
  if (chess.isThreefoldRepetition()) return { winner: null, termination: 'threefold' }
  if (chess.isDraw()) return { winner: null, termination: 'fifty-move' }
  return null
}

/** Result when `flagged` runs out of time: loss, unless the opponent has only a king. */
export function timeoutResult(chess: Chess, flagged: Color): GameResult {
  const other: Color = flagged === 'w' ? 'b' : 'w'
  const otherHasMaterial = chess
    .board()
    .flat()
    .some((p) => p && p.color === other && p.type !== 'k')
  return { winner: otherHasMaterial ? other : null, termination: 'timeout' }
}

export function userScore(game: GameRecord): 0 | 0.5 | 1 | null {
  if (!game.result) return null
  if (game.result.winner === null) return 0.5
  return game.result.winner === game.userColor ? 1 : 0
}

/**
 * Number of plies to remove so it is the user's turn again with their last
 * move undone. Returns 0 when there is nothing to take back.
 */
export function takebackPlies(game: GameRecord): number {
  const n = game.moves.length
  if (n === 0) return 0
  const last = game.moves[n - 1]
  if (last.by === 'user') return 1
  // Engine replied: undo the reply and the user's move before it (if any).
  return n >= 2 && game.moves[n - 2].by === 'user' ? 2 : 0
}

export function applyTakeback(game: GameRecord): GameRecord {
  const k = takebackPlies(game)
  if (k === 0 || game.result) return game
  return { ...game, moves: game.moves.slice(0, -k), takebacks: game.takebacks + 1 }
}

const TERMINATION_TEXT: Record<Termination, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  threefold: 'threefold repetition',
  'fifty-move': 'the fifty-move rule',
  insufficient: 'insufficient material',
  resign: 'resignation',
  timeout: 'time',
  unknown: '',
}

export function describeResult(game: GameRecord): string {
  const r = game.result
  if (!r) return ''
  const how = TERMINATION_TEXT[r.termination]
  const by = how ? ` by ${how}` : ''
  if (r.winner === null) return `Draw${by}`
  const you = r.winner === game.userColor
  return `${you ? 'You won' : `${opponentLabel(game)} won`}${by}`
}

export function opponentLabel(game: Pick<GameRecord, 'imported' | 'opponentName' | 'rating'>): string {
  if (game.imported) return game.opponentName || 'Opponent'
  return 'Coach'
}

/** Limits for pasted or uploaded PGN text. One real game is a few KB. */
export const MAX_PGN_CHARS = 100_000
export const MAX_PGN_PLIES = 600

/** An import problem with a message that is safe and friendly to show the user. */
export class PgnImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PgnImportError'
  }
}

/**
 * Player names come from untrusted files: keep printable text only (no control
 * or bidi-override characters), collapse whitespace and cap the length. React
 * renders it as plain text, never as HTML.
 */
export function cleanPlayerName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const name = raw
    // Intentionally matches control characters: they are what we strip.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim()
  return name && name !== '?' ? name : undefined
}

/**
 * Read a PGN into a game record. `userColor` says which side the user played.
 * Only the moves (checked by chess.js), the result, the date and the opponent's
 * cleaned name are kept; comments and other tags are dropped. If the text holds
 * several games, the first one is used. Throws PgnImportError with a friendly message.
 */
export function importPgn(pgn: string, userColor: Color, now = Date.now()): GameRecord {
  if (pgn.length > MAX_PGN_CHARS) {
    throw new PgnImportError(`That’s too much text for one game (limit ${Math.round(MAX_PGN_CHARS / 1000)} KB). Paste or choose a single game.`)
  }
  let text = pgn.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n').trim()
  if (!text) throw new PgnImportError('Paste a game first.')
  // Several games in one file: keep the first.
  const second = text.slice(1).search(/^\[Event /m)
  if (second >= 0) text = text.slice(0, second + 1).trim()

  const chess = new Chess()
  try {
    chess.loadPgn(text)
  } catch {
    throw new PgnImportError('We couldn’t read that as a chess game. Check that it is PGN text with the moves of one game.')
  }
  const history = chess.history({ verbose: true })
  if (history.length === 0) throw new PgnImportError('No moves found in that PGN.')
  if (history.length > MAX_PGN_PLIES) throw new PgnImportError(`That game is too long to review (over ${MAX_PGN_PLIES / 2} moves).`)
  const headers = chess.getHeaders()
  const startFen = history[0].before
  const moves: MoveRecord[] = history.map((m) => ({
    san: m.san,
    uci: moveToUci(m),
    by: m.color === userColor ? 'user' : 'engine',
    timeMs: 0,
  }))
  const end = new Chess(startFen)
  for (const m of moves) tryUci(end, m.uci)
  const r = headers.Result
  const result: GameResult | undefined =
    detectGameOver(end) ??
    (r === '1-0' ? { winner: 'w', termination: 'unknown' } : r === '0-1' ? { winner: 'b', termination: 'unknown' } : r === '1/2-1/2' ? { winner: null, termination: 'unknown' } : undefined)
  const date = /^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date ?? '') ? Date.parse(headers.Date.replace(/\./g, '-')) : NaN
  const started = Number.isFinite(date) && date > 0 && date <= now ? date : now
  return {
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: started,
    endedAt: started,
    userColor,
    rating: 0,
    timeControl: null,
    startFen,
    moves,
    takebacks: 0,
    result: result ?? { winner: null, termination: 'unknown' },
    imported: true,
    opponentName: cleanPlayerName(userColor === 'w' ? headers.Black : headers.White),
  }
}

function pgnDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function toPgn(game: GameRecord): string {
  const chess = replay(game)
  const coach = `Coach (≈${game.rating})`
  chess.setHeader('Event', 'Beacyn Chess game')
  chess.setHeader('Site', 'https://nabdalla-prog.github.io/beacyn-chess/')
  chess.setHeader('Date', pgnDate(game.startedAt))
  chess.setHeader('White', game.userColor === 'w' ? 'You' : coach)
  chess.setHeader('Black', game.userColor === 'b' ? 'You' : coach)
  const r = game.result
  chess.setHeader('Result', !r ? '*' : r.winner === null ? '1/2-1/2' : r.winner === 'w' ? '1-0' : '0-1')
  if (game.timeControl) chess.setHeader('TimeControl', `${game.timeControl.initial}+${game.timeControl.increment}`)
  if (game.startFen !== START_FEN) {
    chess.setHeader('SetUp', '1')
    chess.setHeader('FEN', game.startFen)
  }
  return chess.pgn()
}
