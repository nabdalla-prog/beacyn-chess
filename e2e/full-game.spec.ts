import { expect, test } from '@playwright/test'
import { Chess } from 'chess.js'

// Plays a whole game to the end: random legal moves for the user against a
// strong coach, so the game finishes (normally by checkmate) in a few dozen moves.
test('play a full game to the end', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  await page.locator('#strength').fill('2500')
  await page.getByRole('radio', { name: 'Untimed' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()

  const status = page.getByTestId('status')
  const sans = () => page.locator('[data-testid=move-list] [data-san]').evaluateAll((els) => els.map((e) => e.getAttribute('data-san')!))
  const isOver = async () => /won|Draw/.test(await status.innerText())

  let warnings = 0
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

  for (let ply = 0; ply < 200 && !(await isOver()); ply += 2) {
    const chess = new Chess()
    for (const s of await sans()) chess.move(s)
    const legal = chess.moves()
    const move = legal[Math.floor(rand() * legal.length)]
    const before = (await sans()).length
    await page.getByLabel('Type a move').fill(move)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    // Guided mode may stop a blunder first; random moves blunder a lot, so insist.
    const warning = page.getByTestId('warning')
    // Wait for the coach's reply, a warning, or the end of the game.
    await expect
      .poll(async () => (await isOver()) || (await warning.isVisible()) || (await sans()).length >= before + 2, { timeout: 30_000 })
      .toBe(true)
    if (await warning.isVisible()) {
      warnings++
      await page.getByRole('button', { name: 'Play it anyway' }).click()
      await expect
        .poll(async () => (await isOver()) || (await sans()).length >= before + 2, { timeout: 30_000 })
        .toBe(true)
    }
  }

  await expect(status).toContainText(/You won|Coach won|Draw/)
  // (Warnings depend on how the game goes; coach.spec covers them deterministically.)
  test.info().annotations.push({ type: 'warnings', description: String(warnings) })
  // Move-quality badges were added to the user's moves.
  await expect(page.locator('[data-testid=move-list] .badge').first()).toBeVisible()
  await expect(status).toContainText('Coach is now ≈')
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible()
  // The finished game is recorded and the next game can start.
  await page.getByRole('button', { name: 'New game' }).click()
  await expect(page.getByText(/1 game played/)).toBeVisible()
})
