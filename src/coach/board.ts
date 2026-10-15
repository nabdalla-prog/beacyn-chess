// Verified board facts. Every function here inspects the actual position; the
// explanation builder may only describe what these functions (or Stockfish) return.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'

export const VALUE: Record<PieceSymbol, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 10000 }
export const PIECE_NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' }

const FILES = 'abcdefgh'
export const SQUARES: Square[] = [...'87654321'].flatMap((r) => [...FILES].map((f) => `${f}${r}` as Square))

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
const fileOf = (s: Square) => s.charCodeAt(0) - 97
const rankOf = (s: Square) => Number(s[1]) - 1
const sq = (f: number, r: number): Square | null => (f < 0 || f > 7 || r < 0 || r > 7 ? null : (`${FILES[f]}${r + 1}` as Square))

export function clone(chess: Chess): Chess {
  return new Chess(chess.fen(), { skipValidation: true })
}

/** Same position with the other side to move (en passant cleared). Null if that would be illegal. */
export function withTurn(chess: Chess, turn: Color): Chess | null {
  if (chess.turn() === turn) return clone(chess)
  const parts = chess.fen().split(' ')
  parts[1] = turn
  parts[3] = '-'
  const c = new Chess(parts.join(' '), { skipValidation: true })
  // The side not to move must not be in check.
  const king = c.findPiece({ type: 'k', color: other(turn) })[0]
  if (king && c.isAttacked(king, turn)) return null
  return c
}

export function material(chess: Chess, color: Color): number {
  let total = 0
  for (const p of chess.board().flat()) if (p && p.color === color && p.type !== 'k') total += VALUE[p.type]
  return total
}

/** Material balance from `color`'s point of view. */
export const materialBalance = (chess: Chess, color: Color) => material(chess, color) - material(chess, other(color))

function leastValuable(chess: Chess, squares: Square[]): Square {
  return squares.reduce((a, b) => (VALUE[chess.get(a)!.type] <= VALUE[chess.get(b)!.type] ? a : b))
}

/**
 * Static exchange evaluation: material `by` wins (in centipawns, ≥ 0) by starting
 * a capture sequence on `square`, both sides always recapturing with their least
 * valuable piece and stopping when it no longer pays. X-rays are handled because
 * pieces are physically moved onto the square as the sequence plays out.
 */
export function see(chess: Chess, square: Square, by: Color): number {
  const b = clone(chess)
  const target = b.get(square)
  if (!target || target.color === by) return 0
  const gains: number[] = []
  let side = by
  let onSquare = VALUE[target.type]
  let d = 0
  for (;;) {
    const atks = b.attackers(square, side)
    if (atks.length === 0) break
    const from = leastValuable(b, atks)
    const piece = b.get(from)!
    gains[d] = onSquare - (d > 0 ? gains[d - 1] : 0)
    onSquare = VALUE[piece.type]
    b.remove(from)
    b.remove(square)
    b.put(piece, square)
    side = other(side)
    d++
    if (d > 32) break
  }
  if (d === 0) return 0
  for (let i = d - 1; i > 0; i--) gains[i - 1] = -Math.max(-gains[i - 1], gains[i])
  return Math.max(0, gains[0])
}

export interface HangingPiece {
  square: Square
  piece: PieceSymbol
  color: Color
  /** Material the opponent wins by capturing (centipawns). */
  gain: number
  defended: boolean
}

/** Pieces of `color` the opponent can win by capturing now (opponent must have a legal capture). */
export function hangingPieces(chess: Chess, color: Color): HangingPiece[] {
  const opp = other(color)
  const pos = withTurn(chess, opp)
  if (!pos) return []
  const captures = new Set(pos.moves({ verbose: true }).filter((m) => m.captured).map((m) => m.to))
  const out: HangingPiece[] = []
  for (const s of SQUARES) {
    const p = chess.get(s)
    if (!p || p.color !== color || p.type === 'k' || !captures.has(s)) continue
    const gain = see(chess, s, opp)
    if (gain >= 100) out.push({ square: s, piece: p.type, color, gain, defended: chess.attackers(s, color).length > 0 })
  }
  return out.sort((a, b) => b.gain - a.gain)
}

export interface Fork {
  square: Square
  piece: PieceSymbol
  targets: { square: Square; piece: PieceSymbol }[]
}

/** The piece on `square` attacks two or more worthwhile enemy targets and can't simply be taken for free. */
export function forkAt(chess: Chess, square: Square): Fork | null {
  const p = chess.get(square)
  if (!p || p.type === 'k') return null
  const enemy = other(p.color)
  const targets: Fork['targets'] = []
  for (const s of SQUARES) {
    const t = chess.get(s)
    if (!t || t.color !== enemy) continue
    if (!chess.attackers(s, p.color).includes(square)) continue
    // Pawns don't count: "forking the king and a pawn" is just winning a pawn with check.
    if (t.type === 'p') continue
    const worthwhile = t.type === 'k' || VALUE[t.type] > VALUE[p.type] || chess.attackers(s, enemy).length === 0
    if (worthwhile) targets.push({ square: s, piece: t.type })
  }
  if (targets.length < 2) return null
  if (see(chess, square, enemy) > 0) return null
  return { square, piece: p.type, targets }
}

const DIRS = {
  diag: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  orth: [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
}

function slideDirs(type: PieceSymbol): number[][] {
  if (type === 'b') return DIRS.diag
  if (type === 'r') return DIRS.orth
  if (type === 'q') return [...DIRS.diag, ...DIRS.orth]
  return []
}

export interface LineTactic {
  kind: 'pin' | 'skewer'
  /** The attacking slider. */
  from: Square
  attacker: PieceSymbol
  /** Front piece (pinned, or skewered piece that must move). */
  front: { square: Square; piece: PieceSymbol }
  /** Piece behind it. */
  back: { square: Square; piece: PieceSymbol }
  /** A pin against the king: the front piece may not move off the line at all. */
  absolute: boolean
}

/** Pins and skewers made by the slider on `square`. */
export function lineTacticsFrom(chess: Chess, square: Square): LineTactic[] {
  const p = chess.get(square)
  if (!p) return []
  const out: LineTactic[] = []
  for (const [df, dr] of slideDirs(p.type)) {
    const found: { square: Square; piece: PieceSymbol; color: Color }[] = []
    let f = fileOf(square) + df
    let r = rankOf(square) + dr
    for (let s = sq(f, r); s && found.length < 2; f += df, r += dr, s = sq(f, r)) {
      const q = chess.get(s)
      if (q) found.push({ square: s, piece: q.type, color: q.color })
    }
    if (found.length < 2 || found[0].color === p.color || found[1].color === p.color) continue
    const [front, back] = found.map(({ square, piece }) => ({ square, piece }))
    if (front.piece !== 'k' && (back.piece === 'k' || VALUE[back.piece] > VALUE[front.piece]) && front.piece !== 'p') {
      out.push({ kind: 'pin', from: square, attacker: p.type, front, back, absolute: back.piece === 'k' })
    } else if (
      (front.piece === 'k' || VALUE[front.piece] > VALUE[back.piece]) &&
      back.piece !== 'p' &&
      (VALUE[back.piece] >= VALUE[p.type] || chess.attackers(back.square, other(p.color)).length === 0)
    ) {
      out.push({ kind: 'skewer', from: square, attacker: p.type, front, back, absolute: false })
    }
  }
  return out
}

export interface DiscoveredAttack {
  /** The piece that was uncovered. */
  from: Square
  attacker: PieceSymbol
  target: { square: Square; piece: PieceSymbol }
  check: boolean
}

/** After `move` (already played on `after`), a line piece behind `move.from` now attacks something valuable. */
export function discoveredAttacks(after: Chess, move: Move): DiscoveredAttack[] {
  const out: DiscoveredAttack[] = []
  const me = move.color
  for (const s of SQUARES) {
    const p = after.get(s)
    if (!p || p.color !== me || s === move.to) continue
    for (const [df, dr] of slideDirs(p.type)) {
      let f = fileOf(s) + df
      let r = rankOf(s) + dr
      let passedFrom = false
      for (let t = sq(f, r); t; f += df, r += dr, t = sq(f, r)) {
        if (t === move.from) passedFrom = true
        const q = after.get(t)
        if (!q) continue
        if (passedFrom && q.color !== me && t !== move.to) {
          const valuable = q.type === 'k' || VALUE[q.type] > VALUE[p.type] || after.attackers(t, q.color).length === 0
          if (valuable && q.type !== 'p') out.push({ from: s, attacker: p.type, target: { square: t, piece: q.type }, check: q.type === 'k' })
        }
        break
      }
    }
  }
  return out
}

/** King on its back rank, boxed in by its own pieces or attacked squares, with enemy heavy pieces on the board. */
export function backRankWeak(chess: Chess, color: Color): boolean {
  const king = chess.findPiece({ type: 'k', color })[0]
  if (!king) return false
  const home = color === 'w' ? 0 : 7
  if (rankOf(king) !== home) return false
  const enemy = other(color)
  const heavy = chess.board().flat().some((p) => p && p.color === enemy && (p.type === 'r' || p.type === 'q'))
  if (!heavy) return false
  const fwd = color === 'w' ? 1 : -1
  for (let df = -1; df <= 1; df++) {
    const s = sq(fileOf(king) + df, home + fwd)
    if (!s) continue
    const q = chess.get(s)
    const blocked = (q && q.color === color) || chess.isAttacked(s, enemy)
    if (!blocked) return false
  }
  return true
}

/** Attacked pieces of `color` that would be lost on every square they can move to. */
export function trappedPieces(chess: Chess, color: Color): { square: Square; piece: PieceSymbol }[] {
  const hanging = hangingPieces(chess, color).filter((h) => h.piece !== 'p')
  const pos = withTurn(chess, color)
  if (!pos || hanging.length === 0) return []
  const out: { square: Square; piece: PieceSymbol }[] = []
  for (const h of hanging) {
    const moves = pos.moves({ square: h.square, verbose: true })
    const escapes = moves.some((m) => {
      if (m.captured && VALUE[m.captured] >= VALUE[h.piece]) return true
      const c = clone(pos)
      c.move(m)
      return see(c, m.to, other(color)) < VALUE[h.piece] / 2
    })
    if (!escapes) out.push({ square: h.square, piece: h.piece })
  }
  return out
}

// ---------- pawn structure ----------

function pawnFiles(chess: Chess, color: Color): number[] {
  const files = new Array(8).fill(0)
  for (const s of SQUARES) {
    const p = chess.get(s)
    if (p && p.type === 'p' && p.color === color) files[fileOf(s)]++
  }
  return files
}

/** Files (a–h) where `color` has two or more pawns. */
export function doubledFiles(chess: Chess, color: Color): string[] {
  return pawnFiles(chess, color).flatMap((n, i) => (n > 1 ? [FILES[i]] : []))
}

export function isolatedPawns(chess: Chess, color: Color): Square[] {
  const files = pawnFiles(chess, color)
  return SQUARES.filter((s) => {
    const p = chess.get(s)
    if (!p || p.type !== 'p' || p.color !== color) return false
    const f = fileOf(s)
    return (files[f - 1] ?? 0) === 0 && (files[f + 1] ?? 0) === 0
  })
}

export function passedPawns(chess: Chess, color: Color): Square[] {
  const fwd = color === 'w' ? 1 : -1
  return SQUARES.filter((s) => {
    const p = chess.get(s)
    if (!p || p.type !== 'p' || p.color !== color) return false
    for (let df = -1; df <= 1; df++) {
      for (let r = rankOf(s) + fwd; r >= 0 && r <= 7; r += fwd) {
        const t = sq(fileOf(s) + df, r)
        const q = t && chess.get(t)
        if (q && q.type === 'p' && q.color !== color) return false
      }
    }
    return true
  })
}

/** "open" = no pawns on the file, "semi-open" = only the opponent's pawns. */
export function fileStatus(chess: Chess, file: string, color: Color): 'open' | 'semi-open' | 'closed' {
  const f = FILES.indexOf(file)
  const mine = pawnFiles(chess, color)[f]
  const theirs = pawnFiles(chess, other(color))[f]
  if (!mine && !theirs) return 'open'
  if (!mine) return 'semi-open'
  return 'closed'
}

export const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5']

export function regionOf(square: Square): 'queenside' | 'center' | 'kingside' {
  const f = fileOf(square)
  return f <= 2 ? 'queenside' : f >= 5 ? 'kingside' : 'center'
}

export function regionSquares(region: 'queenside' | 'center' | 'kingside'): Square[] {
  const files = region === 'queenside' ? [0, 1, 2] : region === 'center' ? [3, 4] : [5, 6, 7]
  return SQUARES.filter((s) => files.includes(fileOf(s)))
}

/** Convert a UCI line to SAN starting from `fen`; stops at the first illegal move. */
export function uciLineToSan(fen: string, uci: string[]): { san: string[]; moves: Move[]; fens: string[] } {
  const c = new Chess(fen)
  const san: string[] = []
  const moves: Move[] = []
  const fens: string[] = [fen]
  for (const u of uci) {
    let m: Move
    try {
      m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      break
    }
    san.push(m.san)
    moves.push(m)
    fens.push(c.fen())
  }
  return { san, moves, fens }
}

// ---------- endgame facts ----------

/**
 * Kings facing each other on a file or rank with an odd number of squares
 * between them. The side NOT to move "has the opposition". 1 square = direct,
 * 3 or 5 = distant.
 */
export function opposition(chess: Chess): { kind: 'direct' | 'distant'; holder: Color } | null {
  const w = chess.findPiece({ type: 'k', color: 'w' })[0]
  const b = chess.findPiece({ type: 'k', color: 'b' })[0]
  if (!w || !b) return null
  const df = Math.abs(fileOf(w) - fileOf(b))
  const dr = Math.abs(rankOf(w) - rankOf(b))
  const gap = df === 0 ? dr - 1 : dr === 0 ? df - 1 : -1
  if (gap < 1 || gap % 2 === 0) return null
  return { kind: gap === 1 ? 'direct' : 'distant', holder: other(chess.turn()) }
}

/** King distance (in king moves) to the nearest centre square: 0 = centralised, 3 = on the edge. */
export function kingCentrality(chess: Chess, color: Color): number {
  const k = chess.findPiece({ type: 'k', color })[0]
  if (!k) return 99
  return Math.min(...CENTER.map((c) => Math.max(Math.abs(fileOf(k) - fileOf(c)), Math.abs(rankOf(k) - rankOf(c)))))
}

/** `color`'s rooks standing behind a passed pawn (either side's) on the same file. */
export function rooksBehindPassedPawns(chess: Chess, color: Color): { rook: Square; pawn: Square }[] {
  const out: { rook: Square; pawn: Square }[] = []
  const passers = [...passedPawns(chess, 'w').map((s) => ({ s, c: 'w' as Color })), ...passedPawns(chess, 'b').map((s) => ({ s, c: 'b' as Color }))]
  for (const r of chess.findPiece({ type: 'r', color })) {
    for (const p of passers) {
      if (fileOf(r) !== fileOf(p.s)) continue
      // "Behind" = on the side the pawn came from.
      const behind = p.c === 'w' ? rankOf(r) < rankOf(p.s) : rankOf(r) > rankOf(p.s)
      if (!behind) continue
      // Nothing in between.
      const lo = Math.min(rankOf(r), rankOf(p.s))
      const hi = Math.max(rankOf(r), rankOf(p.s))
      let clear = true
      for (let k = lo + 1; k < hi; k++) if (chess.get(sq(fileOf(r), k)!)) clear = false
      if (clear) out.push({ rook: r, pawn: p.s })
    }
  }
  return out
}

/**
 * Rule of the square: can the lone king catch this pawn before it queens?
 * (Ignores other pieces; a pawn on its starting rank counts its double step.)
 */
export function kingCatchesPawn(chess: Chess, pawn: Square, defender: Color): boolean {
  const p = chess.get(pawn)
  const k = chess.findPiece({ type: 'k', color: defender })[0]
  if (!p || p.type !== 'p' || !k) return false
  const promoRank = p.color === 'w' ? 7 : 0
  const startRank = p.color === 'w' ? 1 : 6
  let pawnMoves = Math.abs(promoRank - rankOf(pawn))
  if (rankOf(pawn) === startRank) pawnMoves--
  const promo = sq(fileOf(pawn), promoRank)!
  const kingMoves = Math.max(Math.abs(fileOf(k) - fileOf(promo)), Math.abs(rankOf(k) - rankOf(promo)))
  // The king must stand on (or next to, to take the new queen) the queening square
  // by the time the pawn gets there; moving first buys it one extra step.
  return kingMoves <= pawnMoves + (chess.turn() === defender ? 1 : 0)
}
