import type { Color, Key } from '@lichess-org/chessground/types'

const FILES = 'abcdefgh'

/** Moves a square by one step as seen on screen: "up" is towards the top edge whichever way the board is turned. */
export function stepSquare(key: Key, dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', orientation: Color): Key {
  const flip = orientation === 'white' ? 1 : -1
  let f = FILES.indexOf(key[0])
  let r = Number(key[1]) - 1
  if (dir === 'ArrowUp') r += flip
  else if (dir === 'ArrowDown') r -= flip
  else if (dir === 'ArrowRight') f += flip
  else f -= flip
  f = Math.min(7, Math.max(0, f))
  r = Math.min(7, Math.max(0, r))
  return `${FILES[f]}${r + 1}` as Key
}
