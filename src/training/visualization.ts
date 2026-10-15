// Visualization drills: name the square, and "blindfold-lite" (pieces hidden
// while moves are read out, then: where is that piece now?). Answers come from
// chess.js, never hand-written.
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { PIECE_NAME, SQUARES } from '../coach/board'
import { REPERTOIRES } from './repertoires'

export function squareQuiz(rng: () => number, count: number): Square[] {
  const out: Square[] = []
  while (out.length < count) {
    const s = SQUARES[Math.floor(rng() * 64)]
    if (out[out.length - 1] !== s) out.push(s)
  }
  return out
}

export const isLightSquare = (s: Square) => (s.charCodeAt(0) - 97 + Number(s[1])) % 2 === 0

export interface BlindfoldTask {
  /** Moves read out while the pieces are hidden (SAN, from the start position). */
  moves: string[]
  question: string
  answer: Square
  piece: PieceSymbol
  /** Final position, shown after answering. */
  fen: string
}

/**
 * Take `length` moves of a real opening line and ask where one of the pieces
 * that moved now stands (one that wasn't captured and didn't move again).
 */
export function blindfoldTask(rng: () => number, length: number): BlindfoldTask {
  const lines = REPERTOIRES.flatMap((r) => r.lines).filter((l) => l.moves.length >= length)
  const line = lines[Math.floor(rng() * lines.length)]
  const moves = line.moves.slice(0, length)
  const c = new Chess()
  const history = moves.map((san) => c.move(san))
  // Candidates: non-pawn pieces whose last move is this one and that are still on that square.
  const candidates = history
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => m.piece !== 'p' && !history.slice(i + 1).some((later) => later.from === m.to || later.to === m.to) && c.get(m.to)?.type === m.piece)
  const pick = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : { m: history[history.length - 1], i: history.length - 1 }
  const who = pick.m.color === 'w' ? 'White' : 'Black'
  const piece = pick.m.flags.includes('k') || pick.m.flags.includes('q') ? 'k' : pick.m.piece
  return {
    moves,
    question: `Where is ${who}’s ${PIECE_NAME[piece]} now? Tap its square.`,
    answer: piece === 'k' ? c.findPiece({ type: 'k', color: pick.m.color })[0] : pick.m.to,
    piece,
    fen: c.fen(),
  }
}
