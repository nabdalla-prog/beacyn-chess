import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const mateIn1 = JSON.parse(readFileSync(new URL('../public/puzzles/mateIn1/0.json', import.meta.url), 'utf8'))[0] as { id: string }

async function playAndResign(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.getByLabel('Type a move').fill('e4')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('move-list')).toContainText('e4')
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByTestId('status')).toContainText('resignation')
}

test('settings: board and pieces change every board and are remembered', async ({ page }) => {
  await page.goto('./#/settings')
  await expect(page.locator('html')).toHaveClass(/board-beacyn/)
  await page.getByRole('radio', { name: 'Green' }).click()
  await page.getByRole('radio', { name: 'Merida' }).click()
  await page.getByRole('switch', { name: 'Sound effects' }).uncheck()
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/board-green/)
  await expect(page.locator('html')).toHaveClass(/pieces-merida/)
  await expect(page.getByRole('switch', { name: 'Sound effects' })).not.toBeChecked()
  // The board really uses the chosen pieces.
  await page.goto('./')
  await page.getByRole('button', { name: 'Start game' }).click()
  const bg = await page.locator('cg-board piece.knight.white').first().evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(bg).toContain('/pieces/merida/wN.svg')
})

test('progress: a finished game earns "First game" and starts the streak', async ({ page }) => {
  await playAndResign(page)
  await page.goto('./')
  await expect(page.getByTestId('progress-card')).toContainText('1-day streak · 1 badge')
  await page.goto('./#/progress')
  await expect(page.getByTestId('streak')).toContainText('1 day')
  await expect(page.getByTestId('badges-earned')).toContainText('First game')
  await expect(page.getByTestId('badges-earned')).not.toContainText('First win')
})

test('export, then import into a fresh browser (replace), and hostile files are refused kindly', async ({ page, browser }) => {
  await playAndResign(page)
  await page.goto('./#/settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export my data' }).click()
  const file = await (await download).path()
  const backup = JSON.parse(readFileSync(file, 'utf8'))
  expect(backup).toMatchObject({ app: 'beacyn-chess', version: 1 })
  expect(backup.data.games).toHaveLength(1)
  expect(JSON.stringify(backup)).not.toContain('sk-ant') // no keys in backups

  const fresh = await browser.newContext()
  const p2 = await fresh.newPage()
  await p2.goto('./#/settings')
  // Hostile and broken files first: friendly message, nothing changes.
  await p2.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"beacyn-chess","version":99,"data":{}}') })
  await expect(p2.getByTestId('data-msg')).toContainText('newer version')
  await p2.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('<script>alert(1)</script>') })
  await expect(p2.getByTestId('data-msg')).toContainText('isn’t a Beacyn Chess backup')
  // Then the real one.
  await p2.getByTestId('import-file').setInputFiles(file)
  await expect(p2.getByTestId('import-confirm')).toContainText('This backup has 1 game')
  await p2.getByRole('radio', { name: /Replace/ }).check()
  await p2.getByRole('button', { name: 'Replace my data' }).click()
  await expect(p2.getByTestId('data-msg')).toContainText('Imported ✓')
  await p2.goto('./#/progress')
  await expect(p2.getByTestId('badges-earned')).toContainText('First game')
  await fresh.close()
})

test('optional AI (Ollama): rewording is shown only when it adds nothing new', async ({ page }) => {
  let reply = ''
  await page.route('http://localhost:11434/**', async (route) => {
    const url = route.request().url()
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (url.endsWith('/api/tags')) return route.fulfill({ json: { models: [{ name: 'llama3.2' }] }, headers: cors })
    const body = route.request().postDataJSON() as { messages: { content: string }[] }
    const note = /Note: (.*)$/s.exec(body.messages[1].content)![1]
    reply = reply === '' ? `Friendly: ${note}` : 'Try Nh3 instead, it wins 3 pawns.' // second answer invents a move
    return route.fulfill({ json: { message: { content: reply } }, headers: cors })
  })
  await page.goto('./#/settings')
  await page.getByRole('radio', { name: /Ollama on my computer/ }).check()
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('Connected ✓ 1 model found.')).toBeVisible()

  await page.goto('./')
  await page.getByRole('button', { name: 'Start game' }).click()
  await page.getByLabel('Type a move').fill('e4')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const fb = page.getByTestId('feedback').first()
  await expect(fb).toContainText('Friendly:', { timeout: 30_000 })
  await fb.getByTestId('ai-toggle').click()
  await expect(fb).not.toContainText('Friendly:')

  // The next answer invents a move and a number: it is thrown away, the coach's words stay.
  await expect(page.getByTestId('move-list')).toContainText(/1\.\s*e4\s*\S+/, { timeout: 30_000 })
  await page.getByLabel('Type a move').fill('d4')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('feedback').first()).toContainText('d4', { timeout: 30_000 })
  await page.waitForTimeout(1000)
  await expect(page.getByTestId('feedback').first()).not.toContainText('Nh3')
  await expect(page.getByTestId('ai-toggle')).toHaveCount(0)
})

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' })
  test('after one visit, play and puzzles work with no network', async ({ page, context }) => {
    test.skip(!!process.env.E2E_URL && !process.env.E2E_URL.startsWith('https://'), 'needs https or localhost')
    await page.goto('./')
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
      return reg.active?.state
    })
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('button', { name: 'Start game' }).click()
    await page.getByLabel('Type a move').fill('e4')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('move-list')).toContainText(/1\.\s*e4\s*\S+/, { timeout: 30_000 }) // the engine answered offline
    await page.getByRole('button', { name: 'Resign' }).click()
    await page.goto(`./#/train/puzzle/mateIn1/0/${mateIn1.id}`)
    await expect(page.getByTestId('puzzle')).toBeVisible()
    await context.setOffline(false)
  })
})
