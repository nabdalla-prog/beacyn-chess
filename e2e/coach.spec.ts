import { expect, test, type Page } from '@playwright/test'

async function startGuided(page: Page) {
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  // A strong coach never answers 1.e4 with ...b5, so the blunder below is always available.
  await page.locator('#strength').fill('2500')
  await page.getByRole('radio', { name: 'Guided' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByTestId('status')).toContainText('Your move')
}

async function typeMove(page: Page, san: string) {
  await page.getByLabel('Type a move').fill(san)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

test('take a hint: the ladder goes from region to full explanation', async ({ page }) => {
  await startGuided(page)
  const hint = page.getByTestId('hint')
  const btn = page.getByTestId('hint-btn')
  await btn.click()
  await expect(hint).toContainText('Hint 1 of 4')
  await expect(hint).toContainText(/Look at the (kingside|queenside|center)/)
  await expect(page.locator('cg-board square.cc-region').first()).toBeAttached()
  await btn.click()
  await expect(hint).toContainText('Hint 2 of 4')
  await expect(page.locator('cg-board square.cc-piece')).toHaveCount(1)
  await btn.click()
  await expect(hint).toContainText(/Try \S+\./)
  await btn.click()
  await expect(hint).toContainText('Hint 4 of 4')
  await expect(btn).toBeDisabled()

  // "Show me why" plays the engine line on the board step by step.
  await hint.getByRole('button', { name: 'Show me why' }).click()
  const bar = page.getByTestId('view-bar')
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: 'Next move' }).click()
  await expect(bar.locator('li.current')).toHaveCount(1)
  await bar.getByRole('button', { name: 'Back to game' }).click()
  await expect(bar).toBeHidden()
})

test('every move gets a badge and an explanation; a blunder is warned first', async ({ page }) => {
  await startGuided(page)
  await typeMove(page, 'e4')
  const feedback = page.getByTestId('feedback')
  await expect(feedback).toBeVisible({ timeout: 30_000 })
  await expect(feedback.locator('.badge')).toBeVisible()
  await expect(page.getByTestId('status')).toContainText('Your move', { timeout: 30_000 })

  // Ba6 hangs the bishop to the b7 pawn (and usually the b8 knight).
  await typeMove(page, 'Ba6')
  const warning = page.getByTestId('warning')
  await expect(warning).toBeVisible({ timeout: 30_000 })
  await expect(warning).toContainText('Wait')
  // The threat arrow is drawn on the board.
  await expect(page.locator('cg-container svg.cg-shapes g path, cg-container svg g line').first()).toBeAttached()
  await warning.getByRole('button', { name: 'Pick another move' }).click()
  await expect(warning).toBeHidden()
  await expect(page.getByTestId('move-list').locator('li')).toHaveCount(1)
  await expect(page.getByTestId('status')).toContainText('Your move')
})
