// Short sound effects (CC0, by Kenney — see README credits). Files load only when first played.
import type { Key, Pieces } from '@lichess-org/chessground/types'

export type SoundName = 'move' | 'capture' | 'check' | 'castle' | 'end' | 'right' | 'wrong'

let enabled = false
const cache = new Map<SoundName, HTMLAudioElement>()

/** Sound is on unless the user turned it off; when they never chose, it starts off for reduced-motion users. */
export function soundDefault(): boolean {
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
}

export function setSoundEnabled(on: boolean) {
  enabled = on
  // Where supported (Safari 17+), "ambient" audio obeys the phone's silent switch and doesn't stop the user's music.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (on && session) session.type = 'ambient'
}

export function playSound(name: SoundName) {
  if (!enabled || typeof Audio === 'undefined') return
  let a = cache.get(name)
  if (!a) {
    a = new Audio(`${import.meta.env.BASE_URL}sounds/${name}.mp3`)
    a.volume = 0.6
    cache.set(name, a)
  }
  a.currentTime = 0
  // Browsers block sound until the user has interacted with the page; that's fine to ignore.
  void a.play().catch(() => {})
}

/** Which sound a move makes, judged from the pieces before the move (chessground's board map). */
export function moveSound(before: Pieces, orig: Key, dest: Key, check: boolean): SoundName | null {
  const piece = before.get(orig)
  if (!piece) return null // not a move from this position (e.g. a jump to another position)
  if (check) return 'check'
  if (piece.role === 'king' && Math.abs(orig.charCodeAt(0) - dest.charCodeAt(0)) > 1) return 'castle'
  const target = before.get(dest)
  if (target && target.color === piece.color) return piece.role === 'king' ? 'castle' : null // king takes own rook = castling
  if (target || (piece.role === 'pawn' && orig[0] !== dest[0])) return 'capture' // includes en passant
  return 'move'
}
