import { expect, type Page } from '@playwright/test'

/**
 * Waits until the app has written a value to IndexedDB. The app saves without
 * waiting (so the UI never stalls); a test that reloads or navigates right after
 * a change must let that write land first, or the browser may drop it.
 */
export async function waitForSaved(page: Page, key: string, check: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ([k, c]) =>
            new Promise<boolean>((resolve) => {
              const open = indexedDB.open('beacyn-chess')
              open.onerror = () => resolve(false)
              open.onsuccess = () => {
                const req = open.result.transaction('kv').objectStore('kv').get(k)
                req.onsuccess = () => {
                  open.result.close()
                  resolve(Boolean(new Function('v', `return ${c}`)(req.result)))
                }
                req.onerror = () => resolve(false)
              }
            }),
          [key, check] as const,
        ),
      { timeout: 10_000 },
    )
    .toBe(true)
}

/** The game is over and no unfinished game is left to resume. */
export const waitForGameClosed = (page: Page) => waitForSaved(page, 'currentGame', 'v === undefined')
