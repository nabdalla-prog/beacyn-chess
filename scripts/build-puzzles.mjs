// Builds a small curated puzzle set from the Lichess puzzle database (CC0):
//   curl -s https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node scripts/build-puzzles.mjs
// Keeps well-tested, popular, short puzzles; 100 per theme × rating band, chosen
// deterministically (lowest hash of the id) so rebuilding gives the same set.
// Output: public/puzzles/<theme>/<band>.json and public/puzzles/index.json
import { createInterface } from 'node:readline'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

// Priority order: a puzzle goes to the first of its themes found here.
export const THEMES = ['backRankMate', 'mateIn1', 'mateIn2', 'fork', 'pin', 'skewer', 'discoveredAttack', 'trappedPiece', 'hangingPiece']
export const BANDS = [
  [0, 800],
  [800, 1100],
  [1100, 1400],
  [1400, 1700],
  [1700, 2000],
  [2000, 4000],
]
const PER_BUCKET = 100
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/puzzles')

const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const buckets = new Map() // key -> sorted array of { h, p } (ascending h), max PER_BUCKET

function offer(key, h, p) {
  let b = buckets.get(key)
  if (!b) buckets.set(key, (b = []))
  if (b.length >= PER_BUCKET && h >= b[b.length - 1].h) return
  let lo = 0
  let hi = b.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (b[mid].h < h) lo = mid + 1
    else hi = mid
  }
  b.splice(lo, 0, { h, p })
  if (b.length > PER_BUCKET) b.pop()
}

let lines = 0
let kept = 0
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of rl) {
  if (lines++ === 0 && line.startsWith('PuzzleId')) continue
  const [id, fen, movesStr, rating, rd, popularity, plays, themesStr] = line.split(',')
  if (!id || !/^[A-Za-z0-9]{5,8}$/.test(id)) continue
  const r = Number(rating)
  if (!(Number(rd) <= 90 && Number(popularity) >= 85 && Number(plays) >= 500)) continue
  const moves = movesStr.split(' ')
  if (moves.length < 2 || moves.length > 8) continue
  const themes = themesStr.split(' ')
  const theme = THEMES.find((t) => themes.includes(t))
  if (!theme) continue
  const band = BANDS.findIndex(([a, b]) => r >= a && r < b)
  if (band < 0) continue
  const h = hash(id)
  const key = `${theme}/${band}`
  const b = buckets.get(key)
  if (b && b.length >= PER_BUCKET && h >= b[b.length - 1].h) continue
  // Verify every move is legal before keeping it.
  try {
    const c = new Chess(fen)
    for (const u of moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
  } catch {
    continue
  }
  kept++
  offer(key, h, { id, fen, moves: movesStr, rating: r, themes: themes.filter((t) => /^[a-zA-Z0-9]{2,30}$/.test(t)) })
}

rmSync(out, { recursive: true, force: true })
const index = { source: 'Lichess puzzle database (CC0)', themes: THEMES, bands: BANDS, counts: {} }
for (const theme of THEMES) {
  mkdirSync(join(out, theme), { recursive: true })
  for (let band = 0; band < BANDS.length; band++) {
    const list = (buckets.get(`${theme}/${band}`) ?? []).map((x) => x.p).sort((a, b) => a.rating - b.rating)
    writeFileSync(join(out, theme, `${band}.json`), JSON.stringify(list))
    index.counts[`${theme}/${band}`] = list.length
  }
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
console.error(`read ${lines} lines, verified ${kept}, wrote ${Object.values(index.counts).reduce((a, b) => a + b, 0)} puzzles`)
