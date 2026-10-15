import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Production builds are served from https://nabdalla-prog.github.io/Beacyn-chess/.
// Forks with another repo name can override this with BASE_PATH (e.g. "/my-fork/").
export const BASE_PATH = process.env.BASE_PATH ?? '/Beacyn-chess/'

export default defineConfig(({ command, isPreview }) => ({
  // Dev server runs at "/"; the build and `vite preview` use the real Pages path.
  base: command === 'build' || isPreview ? BASE_PATH : '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
