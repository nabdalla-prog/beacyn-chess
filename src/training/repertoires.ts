// Opening repertoires for the opening trainer. Each line is checked in a unit
// test: every move is legal and the line reaches the opening the Lichess
// opening data set names (see repertoires.test.ts), so names are never invented.

export interface RepLine {
  id: string
  name: string
  /** SAN moves from the starting position. */
  moves: string[]
  /** The idea behind the user's moves, keyed by ply index (0 = White's first move). */
  notes: Record<number, string>
  /** The Lichess opening name this line must reach (checked by test). */
  expectName: string
}

export interface Repertoire {
  id: string
  name: string
  color: 'w' | 'b'
  summary: string
  lines: RepLine[]
}

export const REPERTOIRES: Repertoire[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    color: 'w',
    summary: 'Classical development aimed at the centre and the f7 square. Great first opening with White.',
    lines: [
      {
        id: 'italian-piano',
        name: 'Giuoco Piano, quiet plan',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O'],
        notes: {
          0: 'Take the centre and open lines for the queen and bishop.',
          2: 'Develop toward the centre and attack the e5 pawn.',
          4: 'The bishop aims at f7, the weakest point next to Black’s king.',
          6: 'Prepare d4 later to build a big centre.',
          8: 'Protect e4 calmly and open the c1 bishop.',
          10: 'Castle: king safe, rook ready to join the game.',
        },
        expectName: 'Italian Game: Classical Variation, Giuoco Pianissimo',
      },
      {
        id: 'italian-two-knights',
        name: 'Two Knights Defence with d3',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1'],
        notes: {
          0: 'Take the centre and open lines for the queen and bishop.',
          2: 'Develop and attack the e5 pawn.',
          4: 'The bishop eyes f7.',
          6: 'Guard e4 solidly instead of starting sharp fights.',
          8: 'Castle early to keep the king safe.',
          10: 'The rook supports e4 and the e-file.',
        },
        expectName: 'Italian Game: Two Knights Defense, Modern Bishop’s Opening',
      },
    ],
  },
  {
    id: 'london',
    name: 'London System',
    color: 'w',
    summary: 'The same easy setup against almost anything: pawns on d4 and e3, bishop out to f4 on move 2 (the “Accelerated” London).',
    lines: [
      {
        id: 'london-d5',
        name: 'Against …d5 (Accelerated London)',
        moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5', 'c3', 'Nc6', 'Nbd2'],
        notes: {
          0: 'Take the centre with the queen’s pawn.',
          2: 'Bring the bishop out before e3 locks it in.',
          4: 'Support d4 and open the other bishop.',
          6: 'Develop and control e5.',
          8: 'Answer …c5 by supporting d4 with a pawn.',
          10: 'The knight supports e4 and keeps the c-pawn free.',
        },
        expectName: 'Queen’s Pawn Game: Accelerated London System',
      },
      {
        id: 'london-kid',
        name: 'Against …g6 (Accelerated London)',
        moves: ['d4', 'Nf6', 'Bf4', 'g6', 'e3', 'Bg7', 'Nf3', 'O-O', 'Be2'],
        notes: {
          0: 'Take the centre.',
          2: 'Bishop out first, the London way.',
          4: 'Solid support for d4.',
          6: 'Develop toward the centre.',
          8: 'Quiet development, ready to castle.',
        },
        expectName: 'Indian Defense: Accelerated London System',
      },
    ],
  },
  {
    id: 'black-e5',
    name: '1…e5 against 1.e4',
    color: 'b',
    summary: 'Meet 1.e4 with the classical reply: equal share of the centre and fast development.',
    lines: [
      {
        id: 'e5-italian',
        name: 'Against the Italian',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6'],
        notes: {
          1: 'Claim your share of the centre.',
          3: 'Develop and defend e5.',
          5: 'Mirror White: the bishop aims at f2.',
          7: 'Develop and pressure e4.',
          9: 'Support e5 and open the c8 bishop.',
        },
        expectName: 'Italian Game: Classical Variation, Giuoco Pianissimo',
      },
      {
        id: 'e5-ruy',
        name: 'Against the Ruy Lopez',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
        notes: {
          1: 'Claim your share of the centre.',
          3: 'Develop and defend e5.',
          5: 'Ask the bishop a question straight away.',
          7: 'Develop and hit e4.',
          9: 'Calm development: castle next.',
        },
        expectName: 'Ruy Lopez: Closed',
      },
    ],
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    color: 'b',
    summary: 'A solid reply to 1.e4: prepare …d5 with the c-pawn and get the light-squared bishop out.',
    lines: [
      {
        id: 'caro-classical',
        name: 'Classical',
        moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6'],
        notes: {
          1: 'Prepare …d5 without blocking your bishop.',
          3: 'Challenge the centre.',
          5: 'Trade in the centre.',
          7: 'Develop the bishop before …e6 shuts it in.',
          9: 'Keep the bishop on its good diagonal.',
        },
        expectName: 'Caro-Kann Defense: Classical Variation',
      },
      {
        id: 'caro-advance',
        name: 'Advance',
        moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6'],
        notes: {
          1: 'Prepare …d5.',
          3: 'Challenge the centre.',
          5: 'The bishop gets outside the pawn chain first.',
          7: 'Now the pawn chain is solid and the f8 bishop can develop.',
        },
        expectName: 'Caro-Kann Defense: Advance Variation',
      },
    ],
  },
  {
    id: 'qgd',
    name: 'Queen’s Gambit Declined',
    color: 'b',
    summary: 'Against 1.d4: keep a strong pawn on d5 and develop calmly.',
    lines: [
      {
        id: 'qgd-main',
        name: 'Main line',
        moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
        notes: {
          1: 'Take your share of the centre.',
          3: 'Defend d5 with a pawn instead of taking on c4.',
          5: 'Develop and add another defender to d5.',
          7: 'Break the pin on the knight.',
          9: 'Castle: the king is safe and the rook can come to the centre.',
        },
        expectName: 'Queen’s Gambit Declined',
      },
    ],
  },
]

export const allLines = () => REPERTOIRES.flatMap((r) => r.lines.map((l) => ({ rep: r, line: l })))
