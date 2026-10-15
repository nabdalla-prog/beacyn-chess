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
  const sans = async () =>
    (await page.locator('[data-testid=move-list] .move').allInnerTexts()).filter((s) => s && s !== '…')
  const isOver = async () => /won|Draw/.test(await status.innerText())

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
    // Wait for the coach's reply or for the game to end.
    await expect
      .poll(async () => (await isOver()) || (await sans()).length >= before + 2, { timeout: 30_000 })
      .toBe(true)
  }

  await expect(status).toContainText(/You won|Coach won|Draw/)
  await expect(status).toContainText('Coach is now ≈')
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible()
  // The finished game is recorded and the next game can start.
  await page.getByRole('button', { name: 'New game' }).click()
  await expect(page.getByText(/1 game played/)).toBeVisible()
})
