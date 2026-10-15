// Optional AI wording for coach notes. This file is small on purpose: provider code
// (including the in-browser model) is only loaded when the user has turned that provider on.
// Any failure or slowness means the normal note is shown — silently.
import { checkRewrite } from './guard'
import type { AiFacts, AiSettings } from './types'

const TIMEOUT_MS = 12000
const cache = new Map<string, Promise<string | null>>()

/** Approximate download for the in-browser model (measured from its weight files). */
export const WEBLLM_DOWNLOAD_MB = 700

export async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) != null
  } catch {
    return false
  }
}

async function ask(f: AiFacts, s: AiSettings, signal: AbortSignal): Promise<string | null> {
  if (s.provider === 'webllm') {
    if (!s.webllmConsent) return null
    return (await import('./webllm')).rewrite(f)
  }
  if (s.provider === 'ollama') return (await import('./ollama')).rewrite(f, s.ollamaUrl, s.ollamaModel, signal)
  if (s.provider === 'byok') return (await import('./anthropic')).rewrite(f, s.byokModel, signal)
  return null
}

/** A friendlier wording of a verified note, or null (then the app shows its own words). */
export function rewriteNote(f: AiFacts, s: AiSettings): Promise<string | null> {
  if (s.provider === 'off') return Promise.resolve(null)
  const key = `${s.provider}|${f.san}|${f.verdict}|${f.text}`
  let p = cache.get(key)
  if (!p) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    p = Promise.race([
      ask(f, s, ctrl.signal),
      new Promise<null>((resolve) => ctrl.signal.addEventListener('abort', () => resolve(null))),
    ])
      .then((out) => (out ? checkRewrite(f, out) : null))
      .catch(() => null)
      .then((out) => {
        clearTimeout(timer)
        if (!out) cache.delete(key) // try again next time (e.g. once the in-browser model has loaded)
        return out
      })
    cache.set(key, p)
    if (cache.size > 200) cache.delete(cache.keys().next().value!)
  }
  return p
}
