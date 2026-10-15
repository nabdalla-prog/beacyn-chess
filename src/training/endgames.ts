// Endgame drills against the engine from fixed positions. Each drill's claimed
// result (win / draw with best play) is checked by Stockfish in e2e/content.spec.ts.
import type { Chess, Color } from 'chess.js'
import { scoreToCp, type Score } from '../engine/uci'

export type DrillGoal = 'mate' | 'promote' | 'draw'

export interface EndgameDrill {
  id: string
  group: 'Basic mates' | 'Pawn endings' | 'Rook endings'
  name: string
  fen: string
  /** The user plays this side (always the side to move at the start). */
  goal: DrillGoal
  /** Most user moves allowed for a win goal; moves to survive for a draw goal. */
  limit: number
  /** The principle the drill practises — standard endgame theory. */
  idea: string
}

export const DRILLS: EndgameDrill[] = [
  {
    id: 'kq-mate',
    group: 'Basic mates',
    name: 'Queen and king vs king',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    goal: 'mate',
    limit: 25,
    idea: 'Use the queen to shrink the king’s box a knight’s move away, then bring your king up to help. Watch out for stalemate: always leave the king a square until you can mate.',
  },
  {
    id: 'kr-mate',
    group: 'Basic mates',
    name: 'Rook and king vs king',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    goal: 'mate',
    limit: 35,
    idea: 'The rook cuts the king off along a rank or file; your king walks up to face the enemy king, then the rook checks to push it back one line at a time.',
  },
  {
    id: 'rr-ladder',
    group: 'Basic mates',
    name: 'Two rooks: the ladder',
    fen: '8/8/8/4k3/8/8/8/R5RK w - - 0 1',
    goal: 'mate',
    limit: 15,
    idea: 'The rooks take turns: one guards a line, the other checks on the next line, walking the king to the edge like climbing a ladder. Keep the rooks far from the king.',
  },
  {
    id: 'kp-sixth',
    group: 'Pawn endings',
    name: 'King in front of the pawn',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    goal: 'promote',
    limit: 15,
    idea: 'With your king on the sixth rank in front of the pawn you win whoever moves: use the opposition to shoulder the enemy king aside, then push.',
  },
  {
    id: 'kp-defend',
    group: 'Pawn endings',
    name: 'Defend: king in front',
    fen: '8/4k3/8/8/4P3/4K3/8/8 b - - 0 1',
    goal: 'draw',
    limit: 15,
    idea: 'Stay in front of the pawn and take the opposition when the enemy king comes close. If the pawn reaches your back rank side by side with its king, step straight back.',
  },
  {
    id: 'square',
    group: 'Pawn endings',
    name: 'Rule of the square',
    fen: '8/8/8/P3k3/8/8/8/7K b - - 0 1',
    goal: 'draw',
    limit: 8,
    idea: 'Draw a square from the pawn to its queening rank. If your king can step into that square, it catches the pawn — head straight for it.',
  },
  {
    id: 'lucena',
    group: 'Rook endings',
    name: 'Lucena: build a bridge',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    goal: 'promote',
    limit: 25,
    idea: 'Cut the enemy king off, bring your rook to the fourth rank, then walk your king out; when the checks come, your rook blocks them — the "bridge".',
  },
  {
    id: 'philidor',
    group: 'Rook endings',
    name: 'Philidor: hold the draw',
    fen: '4k3/1R6/r7/4PK2/8/8/8/8 b - - 0 1',
    goal: 'draw',
    limit: 15,
    idea: 'Keep your rook on your third rank so the enemy king can’t advance. Once the pawn steps onto that rank, drop the rook back and check from behind.',
  },
]

export type DrillStatus = { state: 'playing' } | { state: 'won' | 'failed'; reason: string }

/** Centipawns from the user's point of view below which a win is gone, or a draw is lost. */
export const WIN_FLOOR = 300
export const LOSS_FLOOR = -300

/**
 * Judge a drill after a move. `pos` is the position now; `score` the engine's
 * evaluation of it from the user's point of view (null when the game is over).
 */
export function judgeDrill(drill: EndgameDrill, user: Color, pos: Chess, score: Score | null, userMoves: number, promoted: boolean): DrillStatus {
  const userWin = drill.goal !== 'draw'
  if (pos.isCheckmate()) {
    const userMated = pos.turn() === user
    if (userMated) return { state: 'failed', reason: 'Checkmate — your king got caught.' }
    return { state: 'won', reason: drill.goal === 'mate' ? `Checkmate in ${userMoves} moves!` : 'Checkmate — even better!' }
  }
  if (pos.isDraw() || pos.isStalemate()) {
    const why = pos.isStalemate() ? 'Stalemate' : pos.isInsufficientMaterial() ? 'Not enough material left to mate' : 'The position was repeated'
    return userWin ? { state: 'failed', reason: `${why} — that’s a draw, so the win slipped.` } : { state: 'won', reason: `${why}: draw held!` }
  }
  const cp = score ? scoreToCp(score) : 0
  if (userWin) {
    if (drill.goal === 'promote' && promoted && cp >= 500) return { state: 'won', reason: `Pawn promoted and the engine says you’re winning.` }
    if (score && cp < WIN_FLOOR) return { state: 'failed', reason: 'The win slipped: the engine no longer sees a win.' }
    if (userMoves >= drill.limit) return { state: 'failed', reason: `Out of moves (${drill.limit}). Try a more direct plan.` }
    return { state: 'playing' }
  }
  if (score && cp <= LOSS_FLOOR) return { state: 'failed', reason: 'The engine now sees a win for your opponent.' }
  if (userMoves >= drill.limit) return { state: 'won', reason: `You held for ${drill.limit} moves — draw secured.` }
  return { state: 'playing' }
}
