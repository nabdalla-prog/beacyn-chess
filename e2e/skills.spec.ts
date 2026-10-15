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
  // The imported games usually weren't fully reviewed (we navigated away), so analyse
  // them here. On a fast machine the reviews may already have finished.
  const analyse = page.getByTestId('analyse-games')
  const done = page.getByText(/Based on 3 games/)
  await expect(analyse.or(done).first()).toBeVisible()
  if (await analyse.isVisible()) await analyse.click()
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

test('games judged before tactic tags can be updated', async ({ page }) => {
  test.setTimeout(120_000)
  await importGame(page, GAMES[2][0], GAMES[2][1])
  await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 60_000 })
  await expect(page.getByTestId('review-summary').getByRole('progressbar')).toBeHidden({ timeout: 60_000 })
  // Make it look like a game judged before M5: drop the tactic tags from every verdict.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('beacyn-chess')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('games', 'readwrite')
          const store = tx.objectStore('games')
          const all = store.getAll()
          all.onsuccess = () => {
            for (const g of all.result) {
              for (const m of g.moves) if (m.review) delete m.review.tags
              store.put(g)
            }
          }
          tx.oncomplete = () => resolve()
        }
      }),
  )
  await page.goto('./#/skills')
  await expect(page.getByText(/judged before tactics counted what you got right/)).toBeVisible()
  await page.getByTestId('analyse-games').click()
  await expect(page.getByText(/judged before tactics counted/)).toBeHidden({ timeout: 60_000 })
  // Tags are back on the stored verdicts.
  const tagged = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('beacyn-chess')
        open.onsuccess = () => {
          const all = open.result.transaction('games').objectStore('games').getAll()
          all.onsuccess = () => resolve(all.result.every((g: { moves: { review?: { tags?: unknown } }[] }) => g.moves.every((m) => !m.review || Array.isArray(m.review.tags))))
        }
      }),
  )
  expect(tagged).toBe(true)
})
