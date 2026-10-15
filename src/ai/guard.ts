// The AI may only reword what the engine and board checks already said. These checks
// throw its answer away if it brings in any move, square, number or chess idea that
// wasn't in the coach's own note.
import type { AiFacts } from './types'

export const SYSTEM_PROMPT =
  'You reword chess coach notes for a beginner. Rewrite the note in at most two short, friendly sentences. ' +
  'Use only the facts in the note. Do not add moves, squares, numbers, evaluations, tactics or reasons that are not in the note. ' +
  'Keep move names exactly as written. Reply with the rewritten note only, as plain text.'

export function userPrompt(f: AiFacts): string {
  return `Move: ${f.san} (${f.verdict})\nNote: ${f.text}`
}

// SAN moves and bare squares: Nf3, exd5, e8=Q, O-O, Qxf7#, e4 …
const MOVE_RE = /\b(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)[+#]?/g
const NUM_RE = /[+-]?\d+(?:[.,]\d+)?/g
/** Chess ideas the AI must not bring in on its own. */
const CONCEPTS = [
  'fork', 'pin', 'pinned', 'skewer', 'discovered', 'mate', 'checkmate', 'stalemate', 'hanging', 'trapped', 'sacrifice',
  'gambit', 'promotion', 'promote', 'en passant', 'castle', 'castling', 'opposition', 'outpost', 'passed pawn', 'back rank',
  'zugzwang', 'overloaded', 'threat', 'attack', 'winning', 'losing', 'draw', 'blunder', 'mistake', 'inaccuracy', 'brilliant',
]

const strip = (s: string) => s.replace(/[+#]$/, '')

/** The cleaned rewrite, or null if it must not be shown. */
export function checkRewrite(f: AiFacts, output: string): string | null {
  const source = `${f.san} ${f.verdict} ${f.text}`
  const text = output
    .replace(/<[^>]*>/g, '') // never markup
    .replace(/^\s*#+\s*/, '') // a Markdown heading mark (but keep "#" for mate in moves)
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“]|["”]$/g, '')
  if (text.length < 8 || text.length > 400) return null
  const sourceMoves = new Set((source.match(MOVE_RE) ?? []).map(strip))
  for (const m of text.match(MOVE_RE) ?? []) if (!sourceMoves.has(strip(m))) return null
  const sourceNums = new Set(source.match(NUM_RE) ?? [])
  for (const n of text.match(NUM_RE) ?? []) if (!sourceNums.has(n)) return null
  const lowerSrc = source.toLowerCase()
  const lowerOut = text.toLowerCase()
  for (const c of CONCEPTS) {
    const re = new RegExp(`\\b${c}`, 'i')
    if (re.test(lowerOut) && !re.test(lowerSrc)) return null
  }
  return text
}
