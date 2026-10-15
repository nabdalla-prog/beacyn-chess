// Board colours and piece sets offered in Settings. The CSS lives in themes.css.
export const BOARD_THEMES = [
  { id: 'beacyn', label: 'Beacyn' },
  { id: 'brown', label: 'Wood' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Ice' },
] as const
export type BoardTheme = (typeof BOARD_THEMES)[number]['id']

export const PIECE_SETS = [
  { id: 'cburnett', label: 'Classic', credit: 'Colin M.L. Burnett, GPLv2+' },
  { id: 'merida', label: 'Merida', credit: 'Armando Hernandez Marroquin, GPLv2+' },
  { id: 'chessnut', label: 'Chessnut', credit: 'Alexis Luengas, Apache 2.0' },
] as const
export type PieceSet = (typeof PIECE_SETS)[number]['id']

/** Puts the chosen theme classes on <html>, so every board on every page follows them. */
export function applyBoardLook(board: BoardTheme, pieces: PieceSet) {
  const cl = document.documentElement.classList
  for (const t of BOARD_THEMES) cl.toggle(`board-${t.id}`, t.id === board)
  for (const p of PIECE_SETS) cl.toggle(`pieces-${p.id}`, p.id === pieces)
}
