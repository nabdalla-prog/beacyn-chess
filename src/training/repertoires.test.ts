import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { identifyOpening, makeBook } from '../coach/openings'
import { REPERTOIRES } from './repertoires'

const book = makeBook(JSON.parse(readFileSync(new URL('../../public/openings.json', import.meta.url), 'utf8')))
const norm = (s: string) => s.replace(/[’']/g, "'")

describe('opening repertoires', () => {
  for (const rep of REPERTOIRES) {
    for (const line of rep.lines) {
      it(`${rep.name} — ${line.name}: legal, named by the Lichess data, notes only on the user's moves`, () => {
        const c = new Chess()
        const moves = line.moves.map((san, i) => {
          const m = c.move(san)
          return { uci: m.from + m.to + (m.promotion ?? ''), san: m.san, by: ((i % 2 === 0) === (rep.color === 'w') ? 'user' : 'engine') as 'user' | 'engine', timeMs: 0 }
        })
        const o = identifyOpening({ startFen: new Chess().fen(), moves }, book)
        expect(o, 'opening found').not.toBeNull()
        expect(norm(o!.name).startsWith(norm(line.expectName)), `got "${o!.name}"`).toBe(true)
        for (const k of Object.keys(line.notes)) {
          const ply = Number(k)
          expect(ply < line.moves.length, `note ${ply} beyond the line`).toBe(true)
          expect((ply % 2 === 0) === (rep.color === 'w'), `note ${ply} is on the opponent's move`).toBe(true)
        }
      })
    }
  }
})
