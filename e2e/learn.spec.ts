import { expect, test, type Page } from '@playwright/test'
import { Chess } from 'chess.js'

async function clickSquare(page: Page, square: string, orientation: 'w' | 'b' = 'w') {
  const box = (await page.locator('cg-board').boundingBox())!
  const sq = box.width / 8
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1]) - 1
  const x = orientation === 'w' ? file : 7 - file
  const y = orientation === 'w' ? 7 - rank : rank
  await page.mouse.click(box.x + sq * (x + 0.5), box.y + sq * (y + 0.5))
}
const move = async (page: Page, uci: string, o: 'w' | 'b' = 'w') => {
  await clickSquare(page, uci.slice(0, 2), o)
  await clickSquare(page, uci.slice(2, 4), o)
}

test('a lesson: concept, exercises (wrong then right), quiz, marked done', async ({ page }) => {
  await page.goto('./#/learn')
  await page.getByRole('link', { name: 'Forks' }).click()
  await expect(page.getByTestId('lesson')).toContainText('A fork attacks two things at once')
  await page.getByRole('button', { name: 'Try it on the board' }).click()
  await expect(page.locator('cg-board')).toBeInViewport({ ratio: 1 })
  const ex = page.getByTestId('exercise')
  await move(page, 'e1e2') // not a fork
  await expect(ex).toContainText('isn’t it')
  await move(page, 'b5c7') // Nc7+ forks king and rook
  await expect(ex).toContainText('Check! The king must move')
  await ex.getByRole('button', { name: 'Next exercise' }).click()
  await move(page, 'd3d4') // pawn fork
  await expect(ex).toContainText('A pawn attacking two pieces')
  await page.getByTestId('to-quiz').click()
  const quiz = page.getByTestId('quiz')
  await quiz.getByRole('button', { name: 'They always give check' }).click()
  await expect(quiz).toContainText('Not quite')
  await quiz.getByRole('button', { name: 'The opponent can only answer one threat' }).click()
  await expect(quiz).toContainText('Right!')
  await page.getByRole('button', { name: '← Learn' }).click()
  await expect(page.getByTestId('lessons')).toContainText('1/16 done')
  await expect(page.getByRole('link', { name: /Forks.*\(done\)/ })).toBeVisible()
})

test('opening trainer: play the Italian, one slip is corrected with an arrow', async ({ page }) => {
  await page.goto('./#/learn/opening/italian')
  const card = page.getByTestId('opening-card')
  await expect(card).toContainText('Play the first move of the Italian Game')
  await move(page, 'd2d4') // wrong first move
  await expect(card).toContainText('The line plays e4')
  await move(page, 'e2e4')
  await expect(card).toContainText('Take the centre')
  // Opponent replies by itself; continue with the line until it ends.
  const line = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6', 'e1g1', 'e8g8']
  for (let i = 2; i < line.length; i += 2) {
    // Wait for the opponent's reply to land before moving.
    await expect(card.getByRole('list', { name: 'Moves so far' }).locator('li')).toHaveCount(i, { timeout: 5000 })
    await move(page, line[i])
  }
  await expect(card).toContainText('Line complete with 1 slip')
})

test('endgame drill: catch the pawn (rule of the square) and hold the draw', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('./#/learn/endgame/square')
  const status = page.getByTestId('drill-status')
  await expect(status).toContainText('You play Black')
  for (let i = 0; i < 10; i++) {
    const text = await status.innerText()
    if (/draw held|draw secured|Not enough material/.test(text)) break
    await expect(status).not.toContainText('thinking', { timeout: 30_000 })
    // Read the position from the move list isn't shown; rebuild from the board via FEN in the DOM-free way:
    const fen = await page.evaluate(() => (window as unknown as { __drillFen?: string }).__drillFen ?? '')
    const c = new Chess(fen)
    // King walks toward the pawn / queening square; captures it when possible.
    const pawn = c.findPiece({ type: 'p', color: 'w' })[0]
    const moves = c.moves({ verbose: true }).filter((m) => m.piece === 'k')
    const target = pawn ?? 'a8'
    const dist = (s: string) => Math.max(Math.abs(s.charCodeAt(0) - target.charCodeAt(0)), Math.abs(Number(s[1]) - Number(target[1])))
    const best = moves.find((m) => m.captured) ?? moves.sort((a, b) => dist(a.to) - dist(b.to))[0]
    await move(page, best.from + best.to, 'b')
  }
  await expect(status).toContainText(/draw held|draw secured/, { timeout: 30_000 })
})

test('visualization: name the square 10/10, then a blindfold question', async ({ page }) => {
  await page.goto('./#/learn/vis/squares')
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('vis-squares')).toContainText(`Round ${i + 1} of 10`)
    const sq = await page.getByTestId('vis-target').innerText()
    await clickSquare(page, sq)
  }
  await expect(page.getByTestId('vis-squares')).toContainText('10/10')
  await page.goto('./#/learn/vis/blindfold')
  await page.getByRole('button', { name: '2 moves' }).click()
  await expect(page.getByTestId('vis-question')).toContainText('Where is', { timeout: 10_000 })
  await clickSquare(page, 'e4')
  await expect(page.getByTestId('vis-question')).toContainText(/Yes — it’s on|Not quite: it’s on/)
})

test('placement: answer, skip 5 puzzles, choose a mode, coach strength is set', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('./')
  await page.getByTestId('welcome-card').getByRole('link', { name: 'Find my level' }).click()
  await page.getByRole('button', { name: 'I know the rules' }).click()
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(`Placement ${i + 1}/5`)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'I don’t know' })).toBeEnabled({ timeout: 5000 })
    await page.getByRole('button', { name: 'I don’t know' }).click()
    await page.getByTestId('next-puzzle').click()
  }
  await expect(page.getByTestId('welcome-mode')).toContainText('Your level: about')
  await page.getByRole('button', { name: /Guided/ }).click()
  await page.getByRole('button', { name: 'Let’s play' }).click()
  await expect(page.getByTestId('welcome-card')).toBeHidden()
  await expect(page.locator('label[for=strength]')).toContainText('≈400')
})
