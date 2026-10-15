import AxeBuilder from '@axe-core/playwright'
import { waitForGameClosed } from './helpers'
import { expect, test, type Page } from '@playwright/test'

// Every page, in light and dark, is checked with axe (WCAG 2.1 A/AA, which includes 4.5:1 text contrast).
// Phone and desktop come from the two Playwright projects.
const PGN = '[White "Me"]\n[Black "Bo"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1'

async function axe(page: Page, what: string) {
  // Let lazy pages and fonts settle so contrast is checked on the final colours.
  await page.waitForLoadState('networkidle')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`)
  expect(summary, `axe on ${what}`).toEqual([])
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: every page has no WCAG A/AA violations (${scheme})`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('./')
    await axe(page, 'home')

    await page.getByRole('button', { name: 'Start game' }).click()
    await page.getByLabel('Type a move').fill('e4')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('move-list')).toContainText('e4')
    await expect(page.getByTestId('feedback')).toBeVisible({ timeout: 30_000 })
    await axe(page, 'play with coaching')
    await page.getByRole('button', { name: 'Resign' }).click()
    await waitForGameClosed(page)

    await page.goto('./')
    await page.getByRole('button', { name: /Review a game from elsewhere/ }).click()
    await page.getByLabel(/Paste the PGN/).fill(PGN)
    await page.getByRole('radio', { name: 'I was White' }).click()
    await page.getByRole('button', { name: 'Import and review' }).click()
    await expect(page.getByTestId('accuracy-user')).toHaveText(/^\d+%$/, { timeout: 60_000 })
    await axe(page, 'review')

    for (const [hash, ready, name] of [
      ['#/skills', page.getByRole('heading', { name: 'Your skills' }), 'skills'],
      ['#/train', page.getByRole('heading', { name: /Today/ }).first(), 'train'],
      ['#/learn', page.getByTestId('lessons'), 'learn'],
      ['#/learn/lesson/forks', page.getByTestId('lesson'), 'lesson'],
      ['#/learn/vis/squares', page.getByTestId('vis-squares'), 'visualization'],
      ['#/welcome', page.getByRole('main'), 'placement'],
      ['#/settings', page.getByRole('heading', { name: 'Settings' }), 'settings'],
      ['#/progress', page.getByRole('heading', { name: 'Your progress' }), 'progress'],
    ] as const) {
      await page.goto(`./${hash}`)
      await expect(ready).toBeVisible()
      await axe(page, name)
    }
  })
}

test('play a whole move with the keyboard only, and hear it in words', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: 'White' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  const board = page.getByRole('application', { name: /Chessboard/ })
  // Tab through the page until the board has focus (header links, theme button, … come first).
  for (let i = 0; i < 20 && !(await board.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(board).toBeFocused()
  await expect(page.locator('square.kb-cursor')).toHaveCount(1) // the cursor is visible, on e2
  await page.keyboard.press('Enter')
  await expect(board).toContainText('e2, white pawn, selected. 2 moves.')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(board).toContainText('e4, empty, you can move here')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('move-list')).toContainText('e4')
  await expect(page.getByTestId('announcer')).toContainText('You: White pawn to e4.')
  // The coach replies and that is announced too.
  await expect(page.getByTestId('announcer')).toContainText(/Coach: Black \w+ (to|takes)/, { timeout: 30_000 })
})
