// Takes the README screenshots (docs/screenshots/*.jpg) from a running preview:
//   npm run build && npx vite preview --port 4173 &   then   node scripts/screenshots.cjs
// It imports a few games and analyses them first, so Review and Skills have something to show.
const { chromium, devices } = require('playwright')

const BASE = process.env.SHOT_URL ?? 'http://localhost:4173/beacyn-chess/'
const OUT = 'docs/screenshots'
const GAMES = [
  // Morphy's "Opera Game" (1858), public domain: a long, good game so the radar has more to show.
  [
    '[White "Me"]\n[Black "Duke & Count"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',
    'White',
  ],
  ['[White "Ann"]\n[Black "Me"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', 'Black'],
  ['[White "Me"]\n[Black "Bo"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1', 'White'],
  ['[White "Me"]\n[Black "Cy"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1', 'White'],
]

async function seed(page) {
  for (const [pgn, side] of GAMES) {
    await page.goto(BASE)
    await page.getByRole('button', { name: /Review a game from elsewhere/ }).click()
    await page.getByLabel(/Paste the PGN/).fill(pgn)
    await page.getByRole('radio', { name: `I was ${side}` }).click()
    await page.getByRole('button', { name: 'Import and review' }).click()
    await page.getByTestId('accuracy-user').filter({ hasText: /%/ }).waitFor({ timeout: 90000 })
    await page.getByTestId('review-summary').getByRole('progressbar').waitFor({ state: 'hidden', timeout: 90000 })
  }
}

async function shot(page, name) {
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 })
  console.log(name)
}

;(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  for (const size of ['phone', 'desktop']) {
    for (const scheme of ['light', 'dark']) {
      const opts = size === 'phone' ? { ...devices['Pixel 7'], deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }
      const ctx = await browser.newContext({ ...opts, colorScheme: scheme, serviceWorkers: 'block' })
      const page = await ctx.newPage()
      const tag = `${size}-${scheme}`
      await seed(page)

      // Review: the last imported game, on its key moment.
      await page.getByTestId('review-summary').scrollIntoViewIfNeeded()
      await shot(page, `review-${tag}`)

      // Play with coaching: a quick opening slip, so the coach has something to show.
      await page.goto(BASE)
      await page.getByRole('radio', { name: 'White' }).click()
      await page.getByRole('button', { name: 'Start game' }).click()
      await page.getByLabel('Type a move').fill('e4')
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await page.getByTestId('move-list').locator('[data-san]').nth(1).waitFor({ timeout: 30000 })
      await page.getByTestId('hint-btn').first().click()
      await page.getByTestId('hint').first().waitFor()
      await page.getByTestId('hint-btn').first().click()
      await page.evaluate(() => scrollTo(0, 0))
      await shot(page, `play-${tag}`)
      await page.getByRole('button', { name: 'Resign' }).click()

      await page.goto(`${BASE}#/skills`)
      await page.getByTestId('radar').waitFor()
      await shot(page, `skills-${tag}`)

      await page.goto(`${BASE}#/train`)
      await page.getByRole('heading', { name: /Today/ }).first().waitFor()
      await shot(page, `train-${tag}`)

      await page.goto(`${BASE}#/learn`)
      await page.getByTestId('lessons').waitFor()
      await shot(page, `learn-${tag}`)
      await ctx.close()
    }
  }
  await browser.close()
})()
