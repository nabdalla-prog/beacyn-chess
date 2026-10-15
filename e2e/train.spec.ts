import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { Chess } from 'chess.js'

// A real puzzle from the shipped set, so the test knows the answer.
const mateIn1 = JSON.parse(readFileSync(new URL('../public/puzzles/mateIn1/0.json', import.meta.url), 'utf8'))[0] as { id: string; fen: string; moves: string }
const [setup, answer] = mateIn1.moves.split(' ')

async function clickSquare(page: Page, square: string, orientation: 'w' | 'b') {
  const box = (await page.locator('cg-board').boundingBox())!
  const sq = box.width / 8
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const x = orientation === 'w' ? file : 7 - file
  const y = orientation === 'w' ? 7 - rank : rank
  await page.mouse.click(box.x + sq * (x + 0.5), box.y + sq * (y + 0.5))
}

test('solve a puzzle', async ({ page }) => {
  // The user plays the side that moves after the setup move.
  const userColor = mateIn1.fen.split(' ')[1] === 'w' ? 'b' : 'w'
  await page.goto(`./#/train/puzzle/mateIn1/0/${mateIn1.id}`)
  const card = page.getByTestId('puzzle')
  await expect(page.getByTestId('puzzle-message')).toContainText('Find mate in 1', { timeout: 10_000 })
  await expect(page.locator('cg-board')).toBeInViewport({ ratio: 1 })

  // A wrong move first: a legal move that isn't checkmate.
  const pos = new Chess(mateIn1.fen)
  pos.move({ from: setup.slice(0, 2), to: setup.slice(2, 4), promotion: setup[4] })
  const wrong = pos.moves({ verbose: true }).find((m) => {
    const c = new Chess(pos.fen())
    c.move(m)
    return !c.isCheckmate() && !m.promotion
  })!
  await clickSquare(page, wrong.from, userColor)
  await clickSquare(page, wrong.to, userColor)
  await expect(page.getByTestId('puzzle-message')).toContainText('isn’t it')
  await expect(card).toHaveClass(/wrong/)

  await card.getByRole('button', { name: 'Hint' }).click()
  await expect(page.getByTestId('puzzle-message')).toContainText('look at the')

  await clickSquare(page, answer.slice(0, 2), userColor)
  await clickSquare(page, answer.slice(2, 4), userColor)
  await expect(page.getByTestId('puzzle-message')).toContainText('solved')
  await expect(card).toHaveClass(/solved/)

  // The result is saved: the puzzle rating exists and the Skills page counts the puzzle.
  await page.getByTestId('next-puzzle').click()
  await page.getByRole('link', { name: 'Skills' }).click()
  await expect(page.getByText(/and 1 puzzle\b/)).toBeVisible()
})

test('daily plan: start a themed set, show a solution, progress is kept', async ({ page }) => {
  await page.goto('./#/train')
  const plan = page.getByTestId('plan')
  await expect(plan).toContainText('Today’s plan')
  await expect(plan).toContainText('Play a game against the coach')
  // New player: starter plan begins with mate-in-1 puzzles.
  await page.getByTestId('plan-theme:mateIn1').click()
  await expect(page.getByTestId('puzzle-message')).toContainText(/to move/, { timeout: 10_000 })
  await page.getByRole('button', { name: 'Show solution' }).click()
  await expect(page.getByTestId('puzzle-message')).toContainText('The solution:')
  await page.getByRole('button', { name: '← Training' }).click()
  await expect(plan.locator('li').first().getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  // A shown solution becomes a review card for later.
  await page.reload()
  await expect(page.getByTestId('plan').locator('li').first().getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
})
