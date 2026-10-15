// Builds the coach's feedback for a move from Stockfish lines plus verified
// board facts (coach/board). Text only ever states something one of those
// sources produced; when no detector fires, it falls back to the engine's numbers.
import { Chess, type Color, type Move, type Square } from 'chess.js'
import { formatScore, type InfoLine, type Score } from '../engine/uci'
import { classifyMove, isError, type MoveClass } from './classify'
import {
  backRankWeak,
  CENTER,
  COLOR_NAME,
  discoveredAttacks,
  fileStatus,
  forkAt,
  hangingPieces,
  lineTacticsFrom,
  materialBalance,
  other,
  passedPawns,
  PIECE_NAME,
  regionOf,
  regionSquares,
  see,
  trappedPieces,
  uciLineToSan,
  VALUE,
} from './board'

export type Brush = 'best' | 'threat' | 'good' | 'bad' | 'hint'

export interface Arrow {
  orig: Square
  dest?: Square
  brush: Brush
}

export interface Frame {
  label: string
  fen: string
  arrows: Arrow[]
  highlights: { square: Square; kind: 'weak' | 'target' | 'region' | 'piece' }[]
  lastMove?: [Square, Square]
}

export interface Line {
  label: string
  fen: string
  uci: string[]
  san: string[]
}

/** Concept tags feed the skill profile (M4). */
export type Concept =
  | 'allowed-mate'
  | 'missed-mate'
  | 'back-rank'
  | 'hanging-piece'
  | 'missed-threat'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered-attack'
  | 'trapped-piece'
  | 'missed-capture'
  | 'missed-fork'
  | 'missed-pin'
  | 'material-loss'
  | 'checkmate'
  | 'won-material'
  | 'castling'
  | 'development'
  | 'center'
  | 'open-file'
  | 'passed-pawn'
  | 'early-queen'
  | 'king-safety'
  | 'sacrifice'

export interface Explanation {
  ply: number
  uci: string
  san: string
  color: Color
  cls: MoveClass
  loss: number
  /** Engine best score before the move and score after it, both from the mover's point of view. */
  scoreBefore: Score
  scoreAfter: Score
  bestUci?: string
  bestSan?: string
  text: string
  concepts: Concept[]
  frames: Frame[]
  lines: Line[]
}

const sideName = (c: Color) => COLOR_NAME[c]
const pieceName = (p: keyof typeof PIECE_NAME) => PIECE_NAME[p]
const negate = (s: Score): Score => ({ type: s.type, value: -s.value })
const sqPair = (m: Move): [Square, Square] => [m.from, m.to]

function moveFromUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
}

/** Score after a move from the mover's view, given the engine's lines for the position after it. */
export function scoreAfterMove(after: Chess, afterLines: InfoLine[]): Score {
  if (after.isCheckmate()) return { type: 'mate', value: 1 }
  if (after.isDraw() || after.isStalemate()) return { type: 'cp', value: 0 }
  return afterLines[0] ? negate(afterLines[0].score) : { type: 'cp', value: 0 }
}

/** Board facts about a move that would make it good: tactics it creates and principles it follows. */
function positiveFacts(before: Chess, move: Move, after: Chess): { text: string; concepts: Concept[]; arrows: Arrow[]; highlights: Frame['highlights'] } | null {
  const opp = other(move.color)
  if (after.isCheckmate()) return { text: 'Checkmate!', concepts: ['checkmate'], arrows: [], highlights: [] }

  const fork = forkAt(after, move.to)
  if (fork) {
    const names = fork.targets.slice(0, 2).map((t) => `${pieceName(t.piece)}`)
    return {
      text: `Forks the ${names.join(' and ')}!`,
      concepts: ['fork'],
      arrows: fork.targets.map((t) => ({ orig: move.to, dest: t.square, brush: 'good' as const })),
      highlights: fork.targets.map((t) => ({ square: t.square, kind: 'target' as const })),
    }
  }
  for (const t of lineTacticsFrom(after, move.to)) {
    const text =
      t.kind === 'pin'
        ? `Pins the ${pieceName(t.front.piece)} to the ${pieceName(t.back.piece)}${t.absolute ? ' — it can’t move' : ''}.`
        : `Skewers the ${pieceName(t.front.piece)}: when it moves, the ${pieceName(t.back.piece)} behind it falls.`
    return {
      text,
      concepts: [t.kind],
      arrows: [{ orig: move.to, dest: t.back.square, brush: 'good' }],
      highlights: [
        { square: t.front.square, kind: 'target' },
        { square: t.back.square, kind: 'target' },
      ],
    }
  }
  const disc = discoveredAttacks(after, move)[0]
  if (disc) {
    return {
      text: disc.check
        ? `Discovered check from your ${pieceName(disc.attacker)}!`
        : `Discovered attack: your ${pieceName(disc.attacker)} now hits the ${pieceName(disc.target.piece)}.`,
      concepts: ['discovered-attack'],
      arrows: [{ orig: disc.from, dest: disc.target.square, brush: 'good' }],
      highlights: [{ square: disc.target.square, kind: 'target' }],
    }
  }
  if (move.captured && hangingPieces(before, opp).some((h) => h.square === move.to)) {
    return { text: `Wins the ${pieceName(move.captured)} on ${move.to}.`, concepts: ['won-material'], arrows: [], highlights: [{ square: move.to, kind: 'target' }] }
  }
  if (move.flags.includes('k') || move.flags.includes('q')) {
    return { text: 'Castling tucks your king away and brings a rook toward the center.', concepts: ['castling'], arrows: [], highlights: [] }
  }
  const fullmove = Number(before.fen().split(' ')[5])
  const homeRank = move.color === 'w' ? '1' : '8'
  if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === homeRank && fullmove <= 12) {
    return { text: `Develops your ${pieceName(move.piece)} — one more piece in the game.`, concepts: ['development'], arrows: [], highlights: [] }
  }
  if (move.piece === 'p' && CENTER.includes(move.to) && fullmove <= 12) {
    return { text: 'Claims space in the center.', concepts: ['center'], arrows: [], highlights: CENTER.map((s) => ({ square: s, kind: 'region' as const })) }
  }
  if (move.piece === 'r' && move.from[0] !== move.to[0] && fileStatus(after, move.to[0], move.color) === 'open') {
    return { text: `Puts your rook on the open ${move.to[0]}-file.`, concepts: ['open-file'], arrows: [], highlights: [] }
  }
  const newPassed = passedPawns(after, move.color).filter((s) => !passedPawns(before, move.color).includes(s))
  if (newPassed.length) {
    return { text: `Creates a passed pawn on ${newPassed[0]}.`, concepts: ['passed-pawn'], arrows: [], highlights: [{ square: newPassed[0], kind: 'target' }] }
  }
  return null
}

/** Material change for `color` over the opening plies of `line`, measured at the first quiet point after ≥ 2 plies. */
function materialSwing(fen: string, uci: string[], color: Color): { swing: number; plies: number } {
  const c = new Chess(fen)
  const start = materialBalance(c, color)
  let best = { swing: 0, plies: 0 }
  for (let i = 0; i < Math.min(uci.length, 8); i++) {
    const m = moveFromUci(c, uci[i])
    if (!m) break
    const nextIsCapture = (() => {
      const u = uci[i + 1]
      return !!u && !!c.get(u.slice(2, 4) as Square)
    })()
    if (i >= 1 && !nextIsCapture && !c.isCheck()) {
      best = { swing: materialBalance(c, color) - start, plies: i + 1 }
      break
    }
  }
  return best
}

export interface ExplainInput {
  fenBefore: string
  uci: string
  ply: number
  /** Engine lines for the position before the move (side-to-move point of view), best first. */
  before: InfoLine[]
  /** Engine lines for the position after the move (opponent's point of view). */
  after: InfoLine[]
}

export function explainMove({ fenBefore, uci, ply, before, after }: ExplainInput): Explanation {
  const chessBefore = new Chess(fenBefore)
  const chessAfter = new Chess(fenBefore)
  const move = moveFromUci(chessAfter, uci)
  if (!move) throw new Error(`Illegal move ${uci} in ${fenBefore}`)
  const me = move.color
  const opp = other(me)
  const fenAfter = chessAfter.fen()

  const top = before[0]
  const bestUci = top?.pv[0]
  const bestScore = top ? top.score : scoreAfterMove(chessAfter, after)
  const played = scoreAfterMove(chessAfter, after)
  const isTop = bestUci === uci
  const given = see(chessAfter, move.to, opp) - (move.captured ? VALUE[move.captured] : 0)
  const isSacrifice = move.piece !== 'p' && given >= 200 && !chessAfter.isCheckmate()
  const { cls, loss } = classifyMove({ best: bestScore, played, isTopMove: isTop, isSacrifice })

  const bestLine = top ? uciLineToSan(fenBefore, top.pv) : null
  const bestSan = bestLine?.san[0]
  const bestMove = bestLine?.moves[0]
  const refutation = after[0] ? uciLineToSan(fenAfter, after[0].pv) : null
  const refMove = refutation?.moves[0]
  const refSan = refutation?.san[0]

  const lines: Line[] = []
  const frames: Frame[] = []
  const concepts: Concept[] = []
  const afterFrame: Frame = { label: 'Your move', fen: fenAfter, arrows: [], highlights: [], lastMove: sqPair(move) }
  const betterFrame: Frame | null =
    bestMove && !isTop
      ? { label: `Better: ${bestSan}`, fen: fenBefore, arrows: [{ orig: bestMove.from, dest: bestMove.to, brush: 'best' }], highlights: [] }
      : null
  let text = ''

  if (isError(cls)) {
    const hangsNow = hangingPieces(chessAfter, me)
    const hangingBefore = hangingPieces(chessBefore, me)
    const refTakes = refMove?.captured ? hangsNow.find((h) => h.square === refMove.to) : undefined

    if (played.type === 'mate' && played.value < 0) {
      const n = Math.abs(played.value)
      text = `This allows mate in ${n}${refSan ? `, starting with ${refSan}` : ''}.`
      concepts.push('allowed-mate')
      if (backRankWeak(chessAfter, me)) {
        text += ' Your back rank is weak: the king has no escape square.'
        concepts.push('back-rank')
      }
      const king = chessAfter.findPiece({ type: 'k', color: me })[0]
      if (king) afterFrame.highlights.push({ square: king, kind: 'weak' })
    } else if (bestScore.type === 'mate' && bestScore.value > 0 && bestSan) {
      text = `You had mate in ${bestScore.value}, starting with ${bestSan}.`
      concepts.push('missed-mate')
    } else if (refTakes && refMove) {
      const where = refTakes.square === move.to ? `Your ${pieceName(refTakes.piece)} on ${refTakes.square}` : `This leaves your ${pieceName(refTakes.piece)} on ${refTakes.square}`
      const wasHanging = hangingBefore.some((h) => h.square === refTakes.square)
      if (wasHanging && refTakes.square !== move.to) {
        text = `Your ${pieceName(refTakes.piece)} on ${refTakes.square} was under attack and still is — ${sideName(opp)} can take it with ${refSan}.`
        concepts.push('missed-threat')
      } else {
        text = `${where} ${refTakes.square === move.to ? 'can be taken' : 'open to capture'}: ${refSan}. ${refTakes.defended ? 'It isn’t defended enough.' : 'Nothing defends it.'}`
        concepts.push('hanging-piece')
      }
      afterFrame.highlights.push({ square: refTakes.square, kind: 'weak' })
    } else if (refMove && refutation) {
      const c2 = new Chess(refutation.fens[1])
      const fork = forkAt(c2, refMove.to)
      const lt = lineTacticsFrom(c2, refMove.to)[0]
      const disc = discoveredAttacks(c2, refMove)[0]
      const trapped = trappedPieces(chessAfter, me)[0]
      if (fork) {
        text = `${sideName(opp)} replies ${refSan}, forking your ${fork.targets
          .slice(0, 2)
          .map((t) => pieceName(t.piece))
          .join(' and ')}.`
        concepts.push('fork')
        for (const t of fork.targets) afterFrame.highlights.push({ square: t.square, kind: 'weak' })
      } else if (lt) {
        text =
          lt.kind === 'pin'
            ? `${sideName(opp)} replies ${refSan}, pinning your ${pieceName(lt.front.piece)} to your ${pieceName(lt.back.piece)}.`
            : `${sideName(opp)} replies ${refSan}, skewering your ${pieceName(lt.front.piece)} and ${pieceName(lt.back.piece)}.`
        concepts.push(lt.kind)
        afterFrame.highlights.push({ square: lt.front.square, kind: 'weak' }, { square: lt.back.square, kind: 'weak' })
      } else if (disc) {
        text = `${sideName(opp)} replies ${refSan} with a discovered ${disc.check ? 'check' : `attack on your ${pieceName(disc.target.piece)}`}.`
        concepts.push('discovered-attack')
        afterFrame.highlights.push({ square: disc.target.square, kind: 'weak' })
      } else if (trapped) {
        text = `Your ${pieceName(trapped.piece)} on ${trapped.square} is trapped: every square it can go to loses it.`
        concepts.push('trapped-piece')
        afterFrame.highlights.push({ square: trapped.square, kind: 'weak' })
      }
    }

    // What the better move would have done.
    if (!text && bestMove && bestLine) {
      const c3 = new Chess(bestLine.fens[1])
      const won = bestMove.captured && hangingPieces(chessBefore, opp).some((h) => h.square === bestMove.to)
      const fork = forkAt(c3, bestMove.to)
      const lt = lineTacticsFrom(c3, bestMove.to)[0]
      if (won && bestMove.captured) {
        text = `You could have won the ${pieceName(bestMove.captured)} on ${bestMove.to} with ${bestSan}.`
        concepts.push('missed-capture')
      } else if (fork) {
        text = `${bestSan} would have forked the ${fork.targets
          .slice(0, 2)
          .map((t) => pieceName(t.piece))
          .join(' and ')}.`
        concepts.push('missed-fork')
        betterFrame?.arrows.push(...fork.targets.map((t) => ({ orig: bestMove.to, dest: t.square, brush: 'good' as const })))
      } else if (lt && lt.kind === 'pin') {
        text = `${bestSan} would have pinned the ${pieceName(lt.front.piece)} to the ${pieceName(lt.back.piece)}.`
        concepts.push('missed-pin')
      }
    }

    if (!text && refutation) {
      const { swing } = materialSwing(fenAfter, after[0].pv, me)
      if (swing <= -200) {
        const seq = refutation.san.slice(0, 3).join(' ')
        text = `After ${seq}, you lose material (about ${Math.round(-swing / 100)} pawns’ worth).`
        concepts.push('material-loss')
      }
    }

    // Opening principles, only as a supporting note for an engine-confirmed error.
    const fullmove = Number(fenBefore.split(' ')[5])
    if (!text && move.piece === 'q' && fullmove <= 6) {
      text = 'Bringing the queen out this early lets the opponent gain time by attacking it.'
      concepts.push('early-queen')
    } else if (!text && move.piece === 'k' && !move.flags.includes('k') && !move.flags.includes('q') && /[KQkq]/.test(fenBefore.split(' ')[2]) && fullmove <= 20) {
      text = 'Moving the king gives up castling and keeps it in the center.'
      concepts.push('king-safety')
    }

    if (!text) text = `The engine prefers ${bestSan ?? 'another move'}: ${formatScore(bestScore)} → ${formatScore(played)} for you.`
    else if (bestSan && !text.includes(bestSan)) text += ` Better was ${bestSan}.`

    if (refMove) afterFrame.arrows.push({ orig: refMove.from, dest: refMove.to, brush: 'threat' })
    frames.push(afterFrame)
    if (betterFrame) frames.push(betterFrame)
    if (refutation && refutation.san.length) lines.push({ label: 'Why it’s a problem', fen: fenAfter, uci: refutation.moves.map(toUci), san: refutation.san })
    if (bestLine && bestLine.san.length && !isTop) lines.push({ label: `Best line: ${bestSan}`, fen: fenBefore, uci: bestLine.moves.map(toUci), san: bestLine.san })
  } else {
    const facts = positiveFacts(chessBefore, move, chessAfter)
    if (cls === 'brilliant') {
      text = `A real sacrifice — you give up material and the engine says it works.${facts ? ` ${facts.text}` : ''}`
      concepts.push('sacrifice')
    } else if (facts) text = facts.text
    else text = cls === 'best' ? 'The engine’s top choice.' : `A solid move. ${bestSan ? `${bestSan} was slightly better.` : ''}`.trim()
    if (facts) {
      concepts.push(...facts.concepts)
      afterFrame.arrows.push(...facts.arrows)
      afterFrame.highlights.push(...facts.highlights)
    }
    frames.push(afterFrame)
    if (betterFrame && cls === 'good') frames.push(betterFrame)
    // The plan behind the move: engine's continuation from here.
    if (refutation && refutation.san.length) lines.push({ label: 'Engine’s line from here', fen: fenAfter, uci: refutation.moves.map(toUci), san: refutation.san })
  }

  return {
    ply,
    uci,
    san: move.san,
    color: me,
    cls,
    loss,
    scoreBefore: bestScore,
    scoreAfter: played,
    bestUci,
    bestSan,
    text,
    concepts,
    frames,
    lines,
  }
}

const toUci = (m: Move) => `${m.from}${m.to}${m.promotion ?? ''}`

// ---------- hints ----------

export interface Hint {
  level: 1 | 2 | 3 | 4
  text: string
  frame: Frame
  line?: Line
}

/** Hint ladder for the side to move, from least to most help. Built only from the engine's best line. */
export function hintFor(fen: string, lines: InfoLine[], level: 1 | 2 | 3 | 4): Hint | null {
  const top = lines[0]
  if (!top?.pv[0]) return null
  const line = uciLineToSan(fen, top.pv)
  const m = line.moves[0]
  if (!m) return null
  const before = new Chess(fen)
  const after = new Chess(line.fens[1])
  const frame: Frame = { label: 'Hint', fen, arrows: [], highlights: [] }

  if (level === 1) {
    const region = regionOf(m.to)
    const extra = after.isCheckmate() ? ' There’s a checkmate!' : m.captured ? ' Look for a capture.' : after.isCheck() ? ' Look for a check.' : ''
    frame.highlights = regionSquares(region).map((s) => ({ square: s, kind: 'region' }))
    return { level, text: `Look at the ${region === 'center' ? 'center' : region}.${extra}`, frame }
  }
  if (level === 2) {
    frame.highlights = [{ square: m.from, kind: 'piece' }]
    return { level, text: `Move your ${pieceName(m.piece)} on ${m.from}.`, frame }
  }
  if (level === 3) {
    frame.arrows = [{ orig: m.from, dest: m.to, brush: 'hint' }]
    return { level, text: `Try ${m.san}.`, frame }
  }
  const facts = positiveFacts(before, m, after)
  frame.arrows = [{ orig: m.from, dest: m.to, brush: 'hint' }, ...(facts?.arrows ?? [])]
  frame.highlights = facts?.highlights ?? []
  const mate = top.score.type === 'mate' && top.score.value > 0 ? ` It leads to mate in ${top.score.value}.` : ''
  return {
    level,
    text: `${m.san}: ${facts ? facts.text : `the engine’s top choice (${formatScore(top.score)} for you).`}${mate}`,
    frame,
    line: { label: `Best line: ${m.san}`, fen, uci: line.moves.map(toUci), san: line.san },
  }
}

// ---------- guided-mode warning ----------

export interface Warning {
  text: string
  frame: Frame
}

/** A pre-move warning for blunders, phrased as a nudge to look again. */
export function warningFor(e: Explanation): Warning | null {
  if (e.cls !== 'blunder' && e.cls !== 'missed-win') return null
  const frame = e.frames[0]
  let text: string
  if (e.concepts.includes('allowed-mate')) text = 'Wait — that move allows checkmate. Check your king’s safety.'
  else if (e.concepts.includes('hanging-piece') || e.concepts.includes('missed-threat')) text = 'Wait — check what that move leaves undefended.'
  else if (e.concepts.includes('missed-mate')) text = 'Wait — you have something much stronger here. Look for checks.'
  else {
    const threat = e.lines[0]?.san[0]
    text = threat ? `Wait — after that, your opponent has ${threat}. Take another look?` : 'Wait — that move gives away a lot. Take another look?'
  }
  return { text, frame }
}
