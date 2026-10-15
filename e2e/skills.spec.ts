import { expect, test, type Page } from '@playwright/test'

const GAMES = [
  // Scholar's mate against me (I'm Black): 3...Nf6?? allows Qxf7#.
  ['[White "Ann"]\n[Black "Me"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0', 'Black'],
  // Fool's mate (I'm White): 2.g4?? allows Qh4#.
  ['[White "Me"]\n[Black "Bo"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1', 'White'],
  // I hang a knight (I'm White): 3.Ng5?? Qxg5.
  ['[White "Me"]\n[Black "Cy"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 3. Ng5 Qxg5 4. d4 Qg6 5. Nc3 exd4 6. Nd5 Kd8 0-1', 'White'],
] as const

async function importGame(page: Page, pgn: string, side: string) {
  await page.goto('./')
  await page.getByRole('button', { name: /Review a game from elsewhere/ }).click()
  await page.getByLabel(/Paste the PGN/).fill(pgn)
  await page.getByRole('radio', { name: `I was ${side}` }).click()
  await page.getByRole('button', { name: 'Import and review' }).click()
  await expect(page.getByTestId('review-summary')).toBeVisible()
}

test('skill profile: analyse games, see the radar and weakest skills, open an example', async ({ page }) => {
  test.setTimeout(240_000)
  // Empty state first.
  await page.goto('./#/skills')
  await expect(page.getByText(/your skill profile appears here/)).toBeVisible()

  for (const [pgn, side] of GAMES) await importGame(page, pgn, side)

  await page.getByRole('link', { name: 'Skills' }).click()
  await expect(page.getByRole('heading', { name: 'Your skills' })).toBeVisible()
  // The imported games weren't fully reviewed (we navigated away), so analyse them here.
  const analyse = page.getByTestId('analyse-games')
  await expect(analyse).toBeVisible()
  await analyse.click()
  await expect(page.getByText(/Analysing game \d of 3/)).toBeVisible()
  await expect(page.getByText(/aren’t analysed yet|Analysing game/)).toBeHidden({ timeout: 180_000 })
  await expect(page.getByText(/Based on 3 games/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('radar')).toBeVisible()
  await expect(page.getByTestId('radar')).toHaveAttribute('aria-label', /Avoiding blunders \d+/)

  const weakest = page.getByTestId('weakest')
  await expect(weakest.locator('.weak-item').first()).toBeVisible()
  await expect(weakest).toContainText(/went wrong\. For example, \d+(\.|…) /)

  // "Show me this position" opens the review on that move.
  await weakest.getByRole('button', { name: /Show me this position/ }).first().click()
  await expect(page.getByTestId('move-card')).toBeVisible()
  await expect(page.getByTestId('move-card').locator('.badge')).toBeVisible()
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByTestId('weakest')).toBeVisible()
})
