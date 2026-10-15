// Words for screen readers: moves and squares said the way a person would say them.
import type { Chess, Move, PieceSymbol, Square } from 'chess.js'

export const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const COLOR = { w: 'White', b: 'Black' } as const

/** "White knight to f3, check", "Black pawn takes d5", "White castles kingside, checkmate". */
export function describeMove(mv: Pick<Move, 'color' | 'piece' | 'from' | 'to' | 'san' | 'captured' | 'promotion'>): string {
  const who = COLOR[mv.color]
  let text: string
  if (mv.san.startsWith('O-O-O')) text = `${who} castles queenside`
  else if (mv.san.startsWith('O-O')) text = `${who} castles kingside`
  else {
    const piece = PIECE_NAMES[mv.piece]
    text = mv.captured ? `${who} ${piece} takes ${PIECE_NAMES[mv.captured]} on ${mv.to}` : `${who} ${piece} to ${mv.to}`
    if (mv.promotion) text += `, promotes to ${PIECE_NAMES[mv.promotion]}`
  }
  if (mv.san.endsWith('#')) text += ', checkmate'
  else if (mv.san.endsWith('+')) text += ', check'
  return text
}

/** "e4, white pawn" or "e4, empty". */
export function describeSquare(chess: Chess, sq: Square): string {
  const p = chess.get(sq)
  return p ? `${sq}, ${COLOR[p.color].toLowerCase()} ${PIECE_NAMES[p.type]}` : `${sq}, empty`
}
