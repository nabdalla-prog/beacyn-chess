// Builds public/openings.json from the Lichess chess-openings TSV files (CC0):
//   git clone https://github.com/lichess-org/chess-openings /tmp/chess-openings
//   node scripts/build-openings.mjs /tmp/chess-openings
// Output: { named: { [epd]: [eco, name] }, book: [epd, ...] }  (book = unnamed theory positions)
// `book` holds every position on any named line (including unnamed steps), so
// "still in theory" survives transpositions and intermediate moves.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/build-openings.mjs <chess-openings dir>')
const epd = (fen) => fen.split(' ').slice(0, 4).join(' ')

const named = {}
const book = new Set()
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(join(src, `${f}.tsv`), 'utf8').trim().split('\n').slice(1)
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t')
    const chess = new Chess()
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/)
    for (const san of sans) {
      chess.move(san)
      book.add(epd(chess.fen()))
    }
    const key = epd(chess.fen())
    // Prefer the shortest (most general) name when two lines reach one position.
    if (!named[key] || named[key][1].length > name.length) named[key] = [eco, name]
  }
}
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/openings.json')
// Named positions are book positions too; list only the unnamed ones in `book`.
writeFileSync(out, JSON.stringify({ named, book: [...book].filter((k) => !named[k]) }))
console.log(`named ${Object.keys(named).length}, book ${book.size} -> ${out}`)
