import { winPercent } from '../coach/classify'
import { formatScore, type Score } from '../engine/uci'
import type { Color } from '../game/session'

/** Horizontal evaluation bar: the light part is White's share of the expected result. */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const white = score ? winPercent(score) : 50
  const label = score ? formatScore(score) : '…'
  const who = !score ? 'not yet known' : Math.abs(white - 50) < 5 ? 'about equal' : white > 50 ? 'White is better' : 'Black is better'
  // Put the user's color on the left so "more of my color" reads as good news.
  const leftIsWhite = orientation === 'w'
  const leftShare = leftIsWhite ? white : 100 - white
  return (
    <div className="eval-bar" role="img" aria-label={`Evaluation ${label}: ${who}`} data-testid="eval-bar">
      <div className={`eval-fill ${leftIsWhite ? 'white' : 'black'}`} style={{ width: `${leftShare}%` }} />
      <span className="eval-label">{label}</span>
    </div>
  )
}
