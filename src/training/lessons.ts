// Structured lessons: a short concept, interactive board exercises and a quick
// check. Exercises are judged by rules built on the verified board detectors
// (any move that mates, forks, takes the opposition…), not by a single
// hard-coded answer. lessons.test.ts proves every exercise is solvable and
// that wrong moves exist.
import { Chess, type Move, type Square } from 'chess.js'
import {
  CENTER,
  discoveredAttacks,
  fileStatus,
  forkAt,
  hangingPieces,
  kingCatchesPawn,
  lineTacticsFrom,
  opposition,
  other,
  passedPawns,
  rooksBehindPassedPawns,
} from '../coach/board'
import { threatsAgainst } from '../coach/tactics'

export type Check =
  | { kind: 'moves'; uci: string[] }
  | { kind: 'mate' }
  | { kind: 'fork' }
  | { kind: 'pin' }
  | { kind: 'skewer' }
  | { kind: 'discovered' }
  | { kind: 'win-piece' }
  | { kind: 'stop-mate' }
  | { kind: 'castle' }
  | { kind: 'center-pawn' }
  | { kind: 'develop' }
  | { kind: 'open-file' }
  | { kind: 'passed-pawn' }
  | { kind: 'opposition' }
  | { kind: 'catch-pawn'; pawn: Square }
  | { kind: 'rook-behind' }

export interface Exercise {
  prompt: string
  fen: string
  check: Check
  /** Shown after a correct move: why it works. */
  success: string
  hint: string
}

export interface Quiz {
  question: string
  options: string[]
  answer: number
  why: string
}

export interface Lesson {
  id: string
  unit: 'Basics' | 'Checkmate patterns' | 'Opening principles' | 'Tactics' | 'Strategy' | 'Endgames'
  title: string
  concept: string[]
  exercises: Exercise[]
  quiz: Quiz
  /** An endgame drill to practise next. */
  drill?: string
}

/** Does `move` (already played on `after`) satisfy the exercise rule? */
export function passes(check: Check, before: Chess, move: Move, after: Chess): boolean {
  const me = move.color
  switch (check.kind) {
    case 'moves':
      return check.uci.includes(`${move.from}${move.to}${move.promotion ?? ''}`)
    case 'mate':
      return after.isCheckmate()
    case 'fork':
      return !!forkAt(after, move.to)
    case 'pin':
      return lineTacticsFrom(after, move.to).some((t) => t.kind === 'pin')
    case 'skewer':
      return lineTacticsFrom(after, move.to).some((t) => t.kind === 'skewer')
    case 'discovered':
      return discoveredAttacks(after, move).length > 0
    case 'win-piece':
      return !!move.captured && hangingPieces(before, other(me)).some((h) => h.square === move.to)
    case 'stop-mate':
      return !after.isCheckmate() && !threatsAgainst(after, me).some((t) => t.motif === 'mate')
    case 'castle':
      return move.flags.includes('k') || move.flags.includes('q')
    case 'center-pawn':
      return move.piece === 'p' && CENTER.includes(move.to)
    case 'develop':
      return (move.piece === 'n' || move.piece === 'b') && move.from[1] === (me === 'w' ? '1' : '8')
    case 'open-file':
      return move.piece === 'r' && move.from[0] !== move.to[0] && fileStatus(after, move.to[0], me) === 'open'
    case 'passed-pawn':
      return passedPawns(after, me).length > passedPawns(before, me).length
    case 'opposition': {
      const o = opposition(after)
      return move.piece === 'k' && !!o && o.kind === 'direct' && o.holder === me
    }
    case 'catch-pawn':
      return move.piece === 'k' && kingCatchesPawn(after, check.pawn, me)
    case 'rook-behind':
      return move.piece === 'r' && rooksBehindPassedPawns(after, me).some((r) => r.rook === move.to)
  }
}

export const LESSONS: Lesson[] = [
  {
    id: 'pieces',
    unit: 'Basics',
    title: 'How the pieces move',
    concept: [
      'Rooks move in straight lines, bishops along diagonals, and the queen does both. The king moves one square in any direction.',
      'Knights jump in an L shape — two squares one way, one square to the side — and are the only pieces that can jump over others.',
    ],
    exercises: [
      { prompt: 'Jump your knight from g1 to f3.', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', check: { kind: 'moves', uci: ['g1f3'] }, success: 'Two squares up, one to the side: an L.', hint: 'The knight is next to the bishop on g1.' },
      { prompt: 'Bishops move diagonally. Capture the black rook with your bishop.', fen: '4k3/8/8/8/8/2r5/8/K3B3 w - - 0 1', check: { kind: 'moves', uci: ['e1c3'] }, success: 'Along the diagonal e1–d2–c3.', hint: 'Follow the diagonal from e1 up and to the left.' },
    ],
    quiz: { question: 'Which piece can jump over other pieces?', options: ['Bishop', 'Knight', 'Rook', 'Queen'], answer: 1, why: 'Only the knight jumps; every other piece is blocked by anything in its way.' },
  },
  {
    id: 'check-mate',
    unit: 'Basics',
    title: 'Check and checkmate',
    concept: [
      'Check means the king is attacked. You must get out of check right away: move the king, block, or capture the attacker.',
      'Checkmate is a check with no way out — the game ends. If the side to move has no legal move but is not in check, it is stalemate: a draw.',
    ],
    exercises: [
      { prompt: 'Checkmate in one move with the queen.', fen: '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1', check: { kind: 'mate' }, success: 'The king’s own pawns block its escape squares.', hint: 'Look at the back rank.' },
      { prompt: 'Checkmate in one move with the rook.', fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1', check: { kind: 'mate' }, success: 'Your king covers a7 and b7; the rook covers the whole 8th rank.', hint: 'Your king already guards the escape squares.' },
    ],
    quiz: {
      question: 'What is stalemate?',
      options: ['The side to move has no legal move and is not in check — a draw', 'A check that can’t be escaped', 'Running out of time', 'Only the two kings are left'],
      answer: 0,
      why: 'Stalemate is a draw, so when you are winning, always leave the enemy king a move until you can mate.',
    },
  },
  {
    id: 'back-rank',
    unit: 'Checkmate patterns',
    title: 'Back-rank mate',
    concept: ['A king stuck behind its own pawns on the back rank can be mated by a rook or queen arriving on that rank.', 'Defend in time by making an escape square — moving a pawn in front of the king (“luft”).'],
    exercises: [
      { prompt: 'Deliver a back-rank mate.', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', check: { kind: 'mate' }, success: 'Rd8# — the pawns on f7, g7 and h7 trap their own king.', hint: 'Your rook can reach the 8th rank.' },
      { prompt: 'Black threatens Ra1 mate. Stop it.', fen: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', check: { kind: 'stop-mate' }, success: 'Your king now has somewhere to go when the rook checks.', hint: 'Give your king an escape square.' },
    ],
    quiz: { question: 'Why are back-rank mates so common?', options: ['Kings can’t move backwards', 'The king’s own pawns block its escape', 'Rooks are stronger on the back rank', 'Castling is illegal after a check'], answer: 1, why: 'After castling, the pawns in front of the king are a shield — and a cage if no escape square is made.' },
  },
  {
    id: 'queen-mate',
    unit: 'Checkmate patterns',
    title: 'Mating with the queen',
    concept: ['Queen and king beat a lone king. Use the queen to push the king to the edge, then bring your own king close to help.', 'Careful: if the enemy king has no moves and isn’t in check, it’s stalemate.'],
    exercises: [{ prompt: 'Finish it: checkmate in one.', fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', check: { kind: 'mate' }, success: 'Your king guards g7 and h7; the queen covers the 8th rank.', hint: 'Check along the 8th rank.' }],
    quiz: { question: 'What must you watch out for when mating with a queen?', options: ['Losing on time', 'Stalemate', 'Promoting a pawn', 'Castling'], answer: 1, why: 'A queen controls so many squares that it’s easy to leave the king with no moves and no check — a draw.' },
    drill: 'kq-mate',
  },
  {
    id: 'ladder',
    unit: 'Checkmate patterns',
    title: 'The ladder mate',
    concept: ['Two rooks mate without help from the king: one guards a rank, the other checks on the next, and they walk the king to the edge.'],
    exercises: [{ prompt: 'Complete the ladder: checkmate in one.', fen: '6k1/1R6/8/8/8/8/8/R5K1 w - - 0 1', check: { kind: 'mate' }, success: 'One rook holds the 7th rank, the other checks on the 8th.', hint: 'The rook on b7 already guards the 7th rank.' }],
    quiz: { question: 'In the ladder mate, what does the second rook do while the first one checks?', options: ['Guards the next rank', 'Protects your king', 'Attacks pawns', 'Waits on the first rank'], answer: 0, why: 'Each rook stops the king from stepping back, so it is pushed one rank at a time.' },
    drill: 'rr-ladder',
  },
  {
    id: 'center',
    unit: 'Opening principles',
    title: 'Fight for the centre',
    concept: ['Pieces in the centre reach more squares. Start with a central pawn (e4 or d4), then develop knights and bishops toward the middle.'],
    exercises: [
      { prompt: 'Make a first move that claims the centre with a pawn.', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', check: { kind: 'center-pawn' }, success: 'A pawn on d4 or e4 controls key central squares and frees your pieces.', hint: 'The e- or d-pawn.' },
      { prompt: 'Develop a minor piece (a knight or bishop).', fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', check: { kind: 'develop' }, success: 'Every developed piece is one more piece in the fight.', hint: 'Knights before bishops is a good habit.' },
    ],
    quiz: { question: 'Why do pieces belong near the centre?', options: ['They are safer from pawns', 'They control more squares', 'It is a rule of chess', 'They can’t be captured there'], answer: 1, why: 'A knight in the centre attacks up to 8 squares; on the edge only 2–4.' },
  },
  {
    id: 'castle',
    unit: 'Opening principles',
    title: 'Castle early',
    concept: ['Castling tucks the king behind pawns and brings a rook toward the centre — two jobs in one move. Aim to castle within the first 10 moves.'],
    exercises: [{ prompt: 'Your pieces are out. Castle!', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', check: { kind: 'castle' }, success: 'King safe, rook ready for the centre.', hint: 'Move the king two squares toward the rook.' }],
    quiz: { question: 'What does castling do?', options: ['Wins a pawn', 'Makes the king safer and develops a rook', 'Lets the king move twice', 'Starts an attack on the queen'], answer: 1, why: 'The king hides behind pawns and the rook leaves the corner.' },
  },
  {
    id: 'loose',
    unit: 'Tactics',
    title: 'Loose pieces',
    concept: ['A piece that is attacked and not defended enough is “hanging” — you can win it. Before every move, ask: what is unprotected, mine and theirs?'],
    exercises: [{ prompt: 'Win the undefended piece.', fen: '4k3/8/8/2b5/8/8/8/2R1K3 w - - 0 1', check: { kind: 'win-piece' }, success: 'Nothing defended the bishop.', hint: 'Look along the c-file.' }],
    quiz: { question: 'A piece is “hanging” when…', options: ['It is attacked and not defended enough', 'It is on the edge of the board', 'It has not moved yet', 'It is pinned'], answer: 0, why: 'Then the opponent can take it for free.' },
  },
  {
    id: 'forks',
    unit: 'Tactics',
    title: 'Forks',
    concept: ['A fork attacks two things at once; the opponent can only save one. Knights and pawns are great forkers.'],
    exercises: [
      { prompt: 'Fork the king and rook with your knight.', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', check: { kind: 'fork' }, success: 'Check! The king must move, then the rook falls.', hint: 'Find a knight check that also hits a8.' },
      { prompt: 'Fork two pieces with a pawn.', fen: '4k3/8/8/2n1r3/8/3P4/8/6K1 w - - 0 1', check: { kind: 'fork' }, success: 'A pawn attacking two pieces wins one of them.', hint: 'A pawn attacks diagonally forward.' },
    ],
    quiz: { question: 'Why are forks so strong?', options: ['They always give check', 'The opponent can only answer one threat', 'Only knights can fork', 'They win the queen every time'], answer: 1, why: 'Two threats, one move to answer them: something is lost.' },
  },
  {
    id: 'pins',
    unit: 'Tactics',
    title: 'Pins and skewers',
    concept: ['A pin attacks a piece that can’t move without exposing something more valuable behind it. A skewer is the reverse: the valuable piece is in front and must move, and the one behind falls.'],
    exercises: [
      { prompt: 'Pin the knight to the king.', fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', check: { kind: 'pin' }, success: 'The knight can’t move: the king is behind it.', hint: 'The bishop and the king are on the same diagonal as the knight.' },
      { prompt: 'Skewer the king and queen.', fen: 'q3k3/8/8/8/8/8/8/4K2R w - - 0 1', check: { kind: 'skewer' }, success: 'The king must step aside and the queen on a8 is lost.', hint: 'Check along the 8th rank.' },
    ],
    quiz: { question: 'In a skewer, which piece is in front?', options: ['The less valuable one', 'The more valuable one', 'Always a pawn', 'Always the king'], answer: 1, why: 'The valuable piece has to move away, uncovering the piece behind it.' },
  },
  {
    id: 'discovered',
    unit: 'Tactics',
    title: 'Discovered attacks',
    concept: ['Move one piece out of the way and the piece behind it attacks. You get two threats: the piece that moved, and the line piece it uncovered.'],
    exercises: [{ prompt: 'Move the knight to uncover an attack on the queen.', fen: '4k3/4q3/8/8/4N3/8/8/K3R3 w - - 0 1', check: { kind: 'discovered' }, success: 'Your rook now hits the queen.', hint: 'The rook on e1 is behind your knight.' }],
    quiz: { question: 'What makes a discovered attack dangerous?', options: ['It is always checkmate', 'Two pieces threaten at once', 'It can’t be blocked', 'It wins a pawn'], answer: 1, why: 'The moving piece can make its own threat while the uncovered piece attacks.' },
  },
  {
    id: 'passed',
    unit: 'Strategy',
    title: 'Passed pawns',
    concept: ['A passed pawn has no enemy pawns in front of it on its file or the files next to it. Nothing but pieces can stop it, so it often decides endgames.'],
    exercises: [{ prompt: 'Create a passed pawn.', fen: '4k3/8/8/2p5/1P1P4/8/8/4K3 w - - 0 1', check: { kind: 'passed-pawn' }, success: 'No black pawn can stop it any more.', hint: 'Capture the black pawn.' }],
    quiz: { question: 'Which pawn is passed?', options: ['One with no enemy pawns in front on its own or neighbouring files', 'Any pawn on the 5th rank', 'A pawn that has captured', 'A pawn next to its king'], answer: 0, why: 'Only pieces can stop it from queening.' },
  },
  {
    id: 'open-file',
    unit: 'Strategy',
    title: 'Rooks on open files',
    concept: ['A file with no pawns is open. Rooks love open files: they reach deep into the enemy camp.'],
    exercises: [{ prompt: 'Put your rook on an open file.', fen: '4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 1', check: { kind: 'open-file' }, success: 'From there the rook can reach the 7th rank.', hint: 'The c-, d- and e-files have no pawns.' }],
    quiz: { question: 'What is an open file?', options: ['A file with no pawns on it', 'A file with your queen on it', 'The a- or h-file', 'A file next to your king'], answer: 0, why: 'With no pawns in the way, a rook controls the whole file.' },
  },
  {
    id: 'opposition',
    unit: 'Endgames',
    title: 'The opposition',
    concept: ['When the kings face each other with one square between them, the side that does NOT have to move “has the opposition” and can make the other king give way.'],
    exercises: [{ prompt: 'Take the opposition.', fen: '8/8/4k3/8/8/4K3/8/8 w - - 0 1', check: { kind: 'opposition' }, success: 'Now Black must move and give ground.', hint: 'Stand on the same file with one square between the kings.' }],
    quiz: { question: 'Who has the opposition?', options: ['The side to move', 'The side NOT to move', 'Whoever has more pawns', 'White, always'], answer: 1, why: 'The side to move must step aside, letting the other king advance.' },
    drill: 'kp-sixth',
  },
  {
    id: 'square',
    unit: 'Endgames',
    title: 'The rule of the square',
    concept: ['Draw a square from the pawn to its queening rank. If your king is inside it — or can step in on its move — it catches the pawn.'],
    exercises: [{ prompt: 'Catch the pawn: step into its square.', fen: '8/8/8/P3k3/8/8/8/7K b - - 0 1', check: { kind: 'catch-pawn', pawn: 'a5' }, success: 'You’re inside the square: the pawn can’t outrun you.', hint: 'Head toward the queening square a8.' }],
    quiz: { question: 'The pawn needs 3 moves to queen and it’s your move. How far can your king be from the queening square and still catch it?', options: ['3 moves', '4 moves', '5 moves', '2 moves'], answer: 1, why: 'Moving first gives your king one extra step.' },
    drill: 'square',
  },
  {
    id: 'rook-behind',
    unit: 'Endgames',
    title: 'Rooks behind passed pawns',
    concept: ['Put rooks behind passed pawns — your own or your opponent’s. Behind your pawn the rook pushes it; behind theirs it gains range as the pawn advances.'],
    exercises: [{ prompt: 'Put your rook behind your passed pawn.', fen: '6k1/8/8/P7/8/8/8/1R4K1 w - - 0 1', check: { kind: 'rook-behind' }, success: 'Now every pawn step makes your rook stronger.', hint: 'The pawn is on the a-file.' }],
    quiz: { question: 'Where does a rook belong with a passed pawn?', options: ['In front of it', 'Behind it', 'Next to it', 'On the back rank'], answer: 1, why: 'Behind the pawn its range grows as the pawn advances.' },
    drill: 'lucena',
  },
]

export const UNITS = [...new Set(LESSONS.map((l) => l.unit))]

/** First lesson not yet completed — recommended next (all lessons stay open). */
export function nextLesson(completed: string[]): Lesson | null {
  return LESSONS.find((l) => !completed.includes(l.id)) ?? null
}
