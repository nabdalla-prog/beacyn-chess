// Renders public/og-image.png (1200x630), the picture shown when the link is shared.
// Usage: node scripts/build-og-image.cjs   (needs Playwright's Chromium)
const { readFileSync } = require('node:fs')
const { chromium } = require('playwright')

const font = (w) => readFileSync(`node_modules/@fontsource/lexend/files/lexend-latin-${w}-normal.woff2`).toString('base64')
const logo = readFileSync('src/assets/beacyn-mark-dark-bg.svg').toString('base64')
const squares = Array.from({ length: 64 }, (_, i) => `<i class="${(Math.floor(i / 8) + (i % 8)) % 2 ? 'd' : 'l'}"></i>`).join('')

const html = `<!doctype html><html><head><style>
@font-face { font-family: Lexend; font-weight: 400; src: url(data:font/woff2;base64,${font(400)}) }
@font-face { font-family: Lexend; font-weight: 600; src: url(data:font/woff2;base64,${font(600)}) }
body { margin: 0; width: 1200px; height: 630px; background: #16213e; color: #fff; font-family: Lexend; display: flex; align-items: center; gap: 64px; padding: 0 80px; box-sizing: border-box; overflow: hidden }
.text { flex: 1 }
.brand { display: flex; align-items: center; gap: 22px; font-size: 64px }
.brand img { width: 110px; height: 110px }
.brand b { font-weight: 600 }
.tag { font-size: 40px; line-height: 1.25; margin: 34px 0 26px; color: #fff }
.tag em { font-style: normal; color: #f5a623 }
.sub { font-size: 24px; color: #c3cadb }
.board { width: 360px; height: 360px; display: grid; grid-template-columns: repeat(8, 1fr); border-radius: 12px; overflow: hidden; box-shadow: 0 0 0 6px #f5a623; transform: rotate(-4deg) }
.l { background: #ece8dd } .d { background: #8d99b3 }
</style></head><body>
<div class="text">
  <div class="brand"><img src="data:image/svg+xml;base64,${logo}"><span><b>Beacyn</b> Chess</span></div>
  <div class="tag">A free chess coach that <em>shows you why</em>.</div>
  <div class="sub">Play, learn from every move, train your weak spots.<br>In your browser · no account · open source</div>
</div>
<div class="board">${squares}</div>
</body></html>`

;(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
  await p.setContent(html)
  await p.waitForTimeout(300)
  await p.screenshot({ path: 'public/og-image.png' })
  await b.close()
})()
