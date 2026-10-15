import { expect, test, type Page } from '@playwright/test'
import { waitForSaved } from './helpers'

async function typeMove(page: Page, san: string) {
  await page.getByLabel('Type a move').fill(san)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

test('play moves against the coach, take one back, and resign', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByTestId('status')).toContainText('Your move')

  await typeMove(page, 'e4')
  // The engine replies (worker loaded, search finished, move applied).
  await expect(page.getByTestId('move-list').locator('[data-san]')).toHaveCount(2, { timeout: 30_000 })
  await expect(page.getByTestId('status')).toContainText('Your move')

  await typeMove(page, 'd4')
  await expect(page.getByTestId('move-list').locator('[data-san]')).toHaveCount(4, { timeout: 30_000 })

  // Takeback removes the coach reply and our move.
  await page.getByRole('button', { name: /Take back/ }).click()
  await expect(page.getByTestId('move-list').locator('li')).toHaveCount(1)
  await waitForSaved(page, 'currentGame', 'v && v.moves.length === 2')

  // Game survives a reload.
  await page.reload()
  await expect(page.getByTestId('move-list').locator('li')).toHaveCount(1)

  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByTestId('status')).toContainText('Coach won by resignation')
  await expect(page.getByTestId('status')).toContainText('Coach is now ≈')
})

test('drag a piece on the board', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  const board = page.locator('cg-board')
  const sq = (await board.boundingBox())!.width / 8
  // e2 -> e4 by clicking from-square then to-square (white at bottom). Positions are
  // relative to the board, so a scroll between the two clicks doesn't matter.
  await board.click({ position: { x: sq * 4.5, y: sq * 6.5 } })
  await expect(page.locator('cg-board square.selected')).toHaveCount(1) // like a person: see it picked up, then tap
  await board.click({ position: { x: sq * 4.5, y: sq * 4.5 } })
  await expect(page.getByTestId('move-list')).toContainText('e4')
})
