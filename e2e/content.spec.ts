// Checks teaching content against Stockfish, so the app never claims a result
// the engine disagrees with. Runs once (desktop project); it's about content, not layout.
import { expect, test } from '@playwright/test'
import { DRILLS } from '../src/training/endgames'

test.skip(() => test.info().project.name !== 'desktop', 'content check runs once')

test('every endgame drill is really a win (or a draw) for the user, per Stockfish', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('./')
  const results = await page.evaluate(
    async ({ drills, url }) => {
      const worker = new Worker(url)
      const lines: string[] = []
      let waiter: ((l: string) => void) | null = null
      worker.onmessage = (e) => {
        for (const l of String(e.data).split('\n')) {
          lines.push(l)
          waiter?.(l)
        }
      }
      const until = (pred: (l: string) => boolean) => new Promise<string>((res) => (waiter = (l) => pred(l) && res(l)))
      worker.postMessage('uci')
      await until((l) => l === 'uciok')
      const out: { id: string; score: string }[] = []
      for (const d of drills) {
        lines.length = 0
        worker.postMessage(`position fen ${d.fen}`)
        worker.postMessage('go depth 18')
        await until((l) => l.startsWith('bestmove'))
        const info = [...lines].reverse().find((l) => / score (cp|mate) /.test(l) && / pv /.test(l))!
        const m = / score (cp|mate) (-?\d+)/.exec(info)!
        out.push({ id: d.id, score: `${m[1]} ${m[2]}` })
      }
      worker.terminate()
      return out
    },
    { drills: DRILLS.map((d) => ({ id: d.id, fen: d.fen })), url: 'engine/stockfish-19-lite-single.js' },
  )
  console.log(results.map((r) => `${r.id}: ${r.score}`).join(', '))
  for (const r of results) {
    const d = DRILLS.find((x) => x.id === r.id)!
    const [kind, v] = r.score.split(' ')
    const value = Number(v) // side to move = the user
    if (d.goal === 'draw') {
      expect(kind === 'cp' && Math.abs(value) <= 150, `${d.id} should be a draw, engine says ${r.score}`).toBe(true)
    } else {
      expect((kind === 'mate' && value > 0) || (kind === 'cp' && value >= 400), `${d.id} should be winning, engine says ${r.score}`).toBe(true)
    }
  }
})
