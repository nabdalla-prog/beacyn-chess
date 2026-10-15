import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { importPgn } from '../game/session'
import { RecentGameRow } from './HomeExtras'

describe('imported text is never rendered as HTML', () => {
  it('escapes a hostile opponent name in the games list', () => {
    const g = importPgn('[White "Me"]\n[Black "<script>alert(1)</script><b>x</b>"]\n[Result "1-0"]\n\n1. e4 e5 1-0', 'w', 0)
    const html = renderToStaticMarkup(<RecentGameRow game={g} onReview={() => {}} />)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;&lt;b&gt;x&lt;/b&gt;')
  })

  it('no source file uses raw-HTML APIs', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p)
      }
    }
    walk(new URL('..', import.meta.url).pathname)
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write/)
    }
  })
})
