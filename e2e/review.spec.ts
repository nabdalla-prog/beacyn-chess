import { expect, test, type Page } from '@playwright/test'

async function typeMove(page: Page, san: string) {
  await page.getByLabel('Type a move').fill(san)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

test('review a game straight after playing it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await typeMove(page, 'e4')
  await expect(page.getByTestId('move-list').locator('[data-san]')).toHaveCount(2, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Resign' }).click()
  await page.getByTestId('review-game').click()
  await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 60_000 })
  await expect(page.getByTestId('move-list').locator('.badge')).toHaveCount(2, { timeout: 60_000 })
  await page.goBack()
  await expect(page.getByTestId('recent-games')).toContainText('Loss')
})

async function importGame(page: Page, pgn: string, side: 'White' | 'Black') {
  await page.goto('./')
  await page.getByRole('button', { name: /Review a game from elsewhere/ }).click()
  await page.getByLabel(/Paste the PGN/).fill(pgn)
  await page.getByRole('radio', { name: `I was ${side}` }).click()
  await page.getByRole('button', { name: 'Import and review' }).click()
}

test('finish a review: accuracy, opening, key moment, retry, graph', async ({ page }) => {
  test.setTimeout(180_000)
  await importGame(page, '[White "Me"]\n[Black "Rival"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1', 'White')
  const summary = page.getByTestId('review-summary')
  await expect(summary).toBeVisible()
  await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 60_000 })
  await expect(summary.getByRole('progressbar')).toBeHidden({ timeout: 60_000 })
  await expect(page.getByTestId('opening')).toContainText("A00 · Barnes Opening: Fool's Mate")
  await expect(summary.locator('.badge.q-blunder')).toBeVisible()

  // The blunder is a key moment with a retry.
  const moments = page.getByTestId('key-moments')
  await expect(moments).toContainText('2. g4')
  await moments.locator('li', { hasText: '2. g4' }).getByRole('button', { name: 'Retry this position' }).click()
  const retry = page.getByTestId('retry')
  await expect(retry).toContainText('You played g4 here')
  // The board is brought fully on screen (phones: the list is below it).
  await expect(page.locator('cg-board')).toBeInViewport({ ratio: 1 })
  await page.waitForTimeout(600) // let smooth scrolling settle
  // Repeat the blunder on the board: g2 → g4 (White at the bottom).
  const box = (await page.locator('cg-board').boundingBox())!
  const sq = box.width / 8
  await page.mouse.click(box.x + sq * 6.5, box.y + sq * 6.5)
  await page.mouse.click(box.x + sq * 6.5, box.y + sq * 4.5)
  await expect(retry).toContainText('Not quite', { timeout: 30_000 })
  await retry.getByRole('button', { name: 'Show answer' }).click()
  await expect(retry).toContainText('The move was')
  await retry.getByRole('button', { name: 'Back to review' }).click()

  // Step through with the buttons and jump with the graph.
  await page.getByRole('button', { name: 'First move' }).click()
  await expect(page.getByTestId('move-card')).toContainText('Start position')
  await page.getByTestId('review-next').click()
  await expect(page.getByTestId('move-card')).toContainText('1. f3')
  const g = (await page.getByTestId('eval-graph').locator('svg').boundingBox())!
  await page.mouse.click(g.x + g.width - 2, g.y + g.height / 2)
  await expect(page.getByTestId('move-card')).toContainText('Qh4#')

  // Reload keeps the review (stored analysis) and the back button goes home.
  await page.reload()
  await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 10_000 })
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByTestId('recent-games')).toContainText('Loss')
  await expect(page.getByTestId('recent-games')).toContainText('vs Rival')
})

test('import a PGN where the opponent slipped', async ({ page }) => {
  await importGame(page, '[White "Me"]\n[Black "Friend"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', 'White')
  await expect(page.getByTestId('review-summary')).toBeVisible()
  await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 60_000 })
  await expect(page.getByText('You won by checkmate')).toBeVisible()
  // Black's 3...Nf6?? is a "chance" moment, and White found the punishment.
  await expect(page.getByTestId('key-moments')).toContainText('3… Nf6')
  await expect(page.getByTestId('key-moments')).toContainText('you found it')
})
