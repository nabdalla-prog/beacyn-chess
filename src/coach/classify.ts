// Move quality from engine scores. All inputs come from Stockfish; nothing here guesses.
import { scoreToCp, type Score } from '../engine/uci'

export type MoveClass = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'missed-win'

/** Expected score (0–100) for the side whose point of view `score` is from (Lichess formula). */
export function winPercent(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : 0
  const cp = Math.max(-1000, Math.min(1000, score.value))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}

export interface ClassifyInput {
  /** Engine's best score in the position before the move, mover's point of view. */
  best: Score
  /** Score after the played move, mover's point of view. */
  played: Score
  /** The played move equals the engine's top move. */
  isTopMove: boolean
  /** Played move gives up material that the opponent can win (static exchange), see coach/board. */
  isSacrifice?: boolean
}

export interface Classification {
  cls: MoveClass
  /** Win-probability points lost (0–100), never negative. */
  loss: number
  winBefore: number
  winAfter: number
}

export function classifyMove({ best, played, isTopMove, isSacrifice }: ClassifyInput): Classification {
  const winBefore = winPercent(best)
  const winAfter = winPercent(played)
  // Different search depths can make the played move look slightly better than "best".
  const loss = Math.max(0, winBefore - winAfter)
  const base = { loss, winBefore, winAfter }

  const hadWin = winBefore >= 80 || (best.type === 'mate' && best.value > 0)
  if (hadWin && winAfter < 60) return { cls: 'missed-win', ...base }

  const nearBest = isTopMove || loss < 2 || scoreToCp(played) >= scoreToCp(best)
  // A sound sacrifice: gives material, stays (near) best, and the result isn't already trivially won.
  if (nearBest && isSacrifice && winAfter >= 50 && winBefore < 95) return { cls: 'brilliant', ...base }
  if (isTopMove || loss < 1) return { cls: 'best', ...base }
  if (loss < 5) return { cls: 'good', ...base }
  if (loss < 10) return { cls: 'inaccuracy', ...base }
  if (loss < 20) return { cls: 'mistake', ...base }
  return { cls: 'blunder', ...base }
}

export const CLASS_INFO: Record<MoveClass, { label: string; symbol: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!' },
  best: { label: 'Best', symbol: 'best' },
  good: { label: 'Good', symbol: 'good' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!' },
  mistake: { label: 'Mistake', symbol: '?' },
  blunder: { label: 'Blunder', symbol: '??' },
  'missed-win': { label: 'Missed win', symbol: '×' },
}

export function isError(cls: MoveClass): boolean {
  return cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder' || cls === 'missed-win'
}
