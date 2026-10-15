// Tactic tags for the skill profile: did the user find a tactic the engine
// confirms, defend a real threat, miss a tactic, or fail to defend one?
// Everything here is checked on the board (and the engine's line), never guessed.
import { Chess, type Color, type Move, type Square } from 'chess.js'
import { forkAt, hangingPieces, materialBalance, other, VALUE, withTurn } from './board'
import { isError, type MoveClass } from './classify'

export type Motif = 'hanging' | 'fork' | 'pin' | 'discovered' | 'mate'
export type Outcome = 'found' | 'defended' | 'missed' | 'failed-defense'

export interface TacticTag {
  motif: Motif
  outcome: Outcome
}

export interface Threat {
  motif: 'hanging' | 'fork' | 'mate'
  /** Squares of the user's pieces under threat (or the king). */
  squares: Square[]
  /** The opponent's move that carries out the threat. */
  move: string
}

/** Material a threat must win to count (a minor piece or more, or the exchange). */
export const THREAT_MIN_GAIN = 200

/**
 * Threats against `me` in `pos`: what the opponent could do if it were their move.
 * Hanging pieces (by static exchange), a mate in one, and a safe fork that hits
 * the king or a piece worth a knight or more.
 */
export function threatsAgainst(pos: Chess, me: Color): Threat[] {
  const opp = other(me)
  const asOpp = withTurn(pos, opp)
  if (!asOpp) return [] // the user is in check: the check itself is the issue, not a threat
  const out: Threat[] = []
  for (const h of hangingPieces(pos, me)) {
    if (h.gain >= THREAT_MIN_GAIN) {
      const capture = asOpp.moves({ verbose: true }).find((m) => m.to === h.square && m.captured)
      if (capture) out.push({ motif: 'hanging', squares: [h.square], move: `${capture.from}${capture.to}` })
    }
  }
  for (const m of asOpp.moves({ verbose: true })) {
    const c = new Chess(asOpp.fen())
    c.move(m)
    if (c.isCheckmate()) {
      out.push({ motif: 'mate', squares: c.findPiece({ type: 'k', color: me }), move: `${m.from}${m.to}` })
      continue
    }
    const fork = forkAt(c, m.to)
    if (fork && fork.targets.some((t) => t.piece !== 'k' && VALUE[t.piece] >= 300)) {
      out.push({ motif: 'fork', squares: fork.targets.map((t) => t.square), move: `${m.from}${m.to}` })
    }
  }
  return out
}

const FOUND: Partial<Record<string, Motif>> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'pin',
  'discovered-attack': 'discovered',
  'won-material': 'hanging',
  checkmate: 'mate',
}
const MISSED: Partial<Record<string, Motif>> = {
  'missed-capture': 'hanging',
  'missed-fork': 'fork',
  'missed-pin': 'pin',
  'missed-mate': 'mate',
}
const FAILED: Partial<Record<string, Motif>> = {
  'hanging-piece': 'hanging',
  'missed-threat': 'hanging',
  'trapped-piece': 'hanging',
  fork: 'fork',
  pin: 'pin',
  skewer: 'pin',
  'discovered-attack': 'discovered',
  'allowed-mate': 'mate',
  'back-rank': 'mate',
}

/** Material `color` gains from `fen` over `uci`, measured once the line goes quiet (≥ 2 plies). */
export function lineGain(fen: string, uci: string[], color: Color): number {
  const c = new Chess(fen)
  const start = materialBalance(c, color)
  let gain = 0
  for (let i = 0; i < Math.min(uci.length, 10); i++) {
    try {
      c.move({ from: uci[i].slice(0, 2), to: uci[i].slice(2, 4), promotion: uci[i][4] })
    } catch {
      break
    }
    gain = materialBalance(c, color) - start
    const next = uci[i + 1]
    const nextCaptures = !!next && !!c.get(next.slice(2, 4) as Square)
    if (i >= 1 && !nextCaptures && !c.isCheck()) break
  }
  return gain
}

export interface TagInput {
  before: Chess
  move: Move
  after: Chess
  cls: MoveClass
  /** The played move is the engine's top move. */
  isTop: boolean
  /** Engine's best score before the move was a forced mate for the mover. */
  hadMate: boolean
  /** The played move followed by the engine's best continuation (UCI). */
  line: string[]
  /** Concept tags the explanation already found for this move. */
  concepts: string[]
}

export function tacticTags({ before, move, after, cls, isTop, hadMate, line, concepts }: TagInput): TacticTag[] {
  const me = move.color
  const tags = new Map<Motif, Outcome>()
  const put = (motif: Motif | undefined, outcome: Outcome) => {
    if (motif && !tags.has(motif)) tags.set(motif, outcome)
  }

  if (isError(cls)) {
    for (const c of concepts) put(MISSED[c], 'missed')
    for (const c of concepts) put(FAILED[c], 'failed-defense')
    return [...tags].map(([motif, outcome]) => ({ motif, outcome }))
  }

  // Found: the engine's own choice, a detected tactic, and the engine's line proves it wins.
  if (isTop || cls === 'best' || cls === 'brilliant') {
    const wins = after.isCheckmate() || hadMate || lineGain(before.fen(), line, me) >= THREAT_MIN_GAIN
    if (wins) for (const c of concepts) put(FOUND[c], 'found')
  }

  // Defended: a real threat before the move, the eval kept, and the threat gone afterwards.
  const threats = threatsAgainst(before, me)
  if (threats.length) {
    const remaining = threatsAgainst(after, me)
    for (const t of threats) {
      const stillThere = remaining.some((r) => r.motif === t.motif && (t.motif === 'mate' || r.squares.some((s) => t.squares.includes(s)) || (t.motif === 'hanging' && t.squares.includes(move.from) && r.squares.includes(move.to))))
      if (!stillThere) put(t.motif, 'defended')
    }
  }
  return [...tags].map(([motif, outcome]) => ({ motif, outcome }))
}
