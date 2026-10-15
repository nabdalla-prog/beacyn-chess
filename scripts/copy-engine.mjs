// Copies the single-threaded lite Stockfish build from npm into public/engine/.
// It needs no cross-origin isolation headers, so it works on GitHub Pages.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/stockfish/bin')
const out = join(root, 'public/engine')
mkdirSync(out, { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(src, f), join(out, f))
}
console.log('Stockfish copied to public/engine/')
