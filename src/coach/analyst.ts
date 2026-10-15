// Full-strength Stockfish used only for coaching, separate from the opponent so
// coaching never changes how the opponent plays. Results are cached per position,
// and identical requests in flight share one search.
import { Engine, type SearchHandle } from '../engine/engine'
import type { InfoLine } from '../engine/uci'

export const LIVE_DEPTH = 12

const cache = new Map<string, InfoLine[]>()
const inflight = new Map<string, { handle: SearchHandle; promise: Promise<InfoLine[] | null>; users: number }>()
let engine: Engine | null = null

function analyst(): Engine {
  engine ??= new Engine()
  return engine
}

export interface Analysis {
  promise: Promise<InfoLine[] | null>
  cancel(): void
}

function cached(fen: string, depth: number, multipv: number): InfoLine[] | null {
  // A deeper or wider result also answers a shallower or narrower request.
  for (const [key, lines] of cache) {
    const [f, d, m] = key.split('|')
    if (f === fen && Number(d) >= depth && Number(m) >= multipv) return lines
  }
  return null
}

/** Engine lines for `fen` (side-to-move point of view), best first. Resolves null if cancelled. */
export function analyse(fen: string, { depth = LIVE_DEPTH, multipv = 1 } = {}): Analysis {
  const hit = cached(fen, depth, multipv)
  if (hit) return { promise: Promise.resolve(hit), cancel() {} }
  const key = `${fen}|${depth}|${multipv}`
  let entry = inflight.get(key)
  if (!entry) {
    const handle = analyst().search({ fen, depth, multipv, options: { UCI_LimitStrength: false, 'Skill Level': 20 } })
    const promise = handle.promise.then((r) => {
      inflight.delete(key)
      if (r.cancelled) return null
      cache.set(key, r.lines)
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
      return r.lines
    })
    entry = { handle, promise, users: 0 }
    inflight.set(key, entry)
  }
  entry.users++
  const e = entry
  let cancelled = false
  return {
    promise: e.promise,
    cancel() {
      if (cancelled) return
      cancelled = true
      e.users--
      // Deferred, so a React effect re-subscribing in the same commit keeps the search alive.
      queueMicrotask(() => {
        if (e.users === 0 && inflight.get(key) === e) {
          inflight.delete(key)
          e.handle.cancel()
        }
      })
    },
  }
}

export function stopAnalysis(): void {
  inflight.clear()
  engine?.stopAll()
}
