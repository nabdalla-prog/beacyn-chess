import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

// Production builds are served from https://nabdalla-prog.github.io/beacyn-chess/.
// Forks with another repo name can override this with BASE_PATH (e.g. "/my-fork/").
export const BASE_PATH = process.env.BASE_PATH ?? '/beacyn-chess/'

/** Public address of the site, for link previews (Open Graph needs absolute URLs). */
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? 'nabdalla-prog'
const SITE_URL = process.env.SITE_URL ?? `https://${owner.toLowerCase()}.github.io${BASE_PATH}`

function siteUrl(): Plugin {
  return { name: 'beacyn-site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL) }
}

/** Writes dist/sw.js with the list of files to keep for offline use (everything but the optional AI code). */
function serviceWorker(): Plugin {
  return {
    name: 'beacyn-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = 'dist'
      const files: string[] = []
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f)
          if (statSync(p).isDirectory()) walk(p)
          else files.push(relative(dist, p).split('\\').join('/'))
        }
      }
      walk(dist)
      const keep = files
        .filter((f) => !/^assets\/(webllm|anthropic)-/.test(f) && !/(^|\/)(sw\.js|og-image\.png|CREDITS\.txt|LICENSE\.txt)$/.test(f) && !f.endsWith('.map'))
        .map((f) => (f === 'index.html' ? './' : `./${f}`))
        .sort()
      const template = readFileSync('scripts/sw-template.js', 'utf8')
      const hash = createHash('sha256').update(template)
      for (const f of keep) hash.update(f === './' ? readFileSync(join(dist, 'index.html')) : readFileSync(join(dist, f.slice(2))))
      const sw = template
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(keep))
      writeFileSync(join(dist, 'sw.js'), sw)
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  // Dev server runs at "/"; the build and `vite preview` use the real Pages path.
  base: command === 'build' || isPreview ? BASE_PATH : '/',
  plugins: [react(), siteUrl(), serviceWorker()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}))
