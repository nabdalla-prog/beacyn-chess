// A Stockfish instance running in its own Web Worker. Searches are queued so only
// one runs at a time, and every search can be cancelled without blocking the UI.
import { parseBestMove, parseInfo, type InfoLine } from './uci'

export type UciOptions = Record<string, string | number | boolean>

export interface SearchRequest {
  fen: string
  /** UCI moves played from `fen`. */
  moves?: string[]
  depth?: number
  movetime?: number
  nodes?: number
  multipv?: number
  /** setoption values applied before this search (kept for later searches too). */
  options?: UciOptions
}

export interface SearchResult {
  bestmove: string | null
  /** Deepest complete line for each multipv index, best first. */
  lines: InfoLine[]
  cancelled: boolean
}

export interface SearchHandle {
  promise: Promise<SearchResult>
  cancel(): void
}

export const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

type Job = {
  req: SearchRequest
  onInfo?: (line: InfoLine) => void
  resolve: (r: SearchResult) => void
  reject: (e: unknown) => void
  cancelled: boolean
}

export class Engine {
  private worker: Worker
  private waiters: { match: (line: string) => boolean; resolve: () => void }[] = []
  private lineHandler: ((line: string) => void) | null = null
  private queue: Job[] = []
  private current: Job | null = null
  private applied: UciOptions = {}
  private ready: Promise<void>
  private dead = false

  constructor(url = ENGINE_URL) {
    this.worker = new Worker(url)
    this.worker.onmessage = (e: MessageEvent) => {
      for (const line of String(e.data).split('\n')) this.onLine(line.trim())
    }
    this.worker.onerror = (e) => {
      this.dead = true
      const err = new Error(`Engine failed to load: ${e.message || 'unknown error'}`)
      this.current?.reject(err)
      for (const j of this.queue) j.reject(err)
      this.queue = []
    }
    this.ready = (async () => {
      this.send('uci')
      await this.waitFor((l) => l === 'uciok')
      await this.sync()
    })()
  }

  whenReady(): Promise<void> {
    return this.ready
  }

  search(req: SearchRequest, onInfo?: (line: InfoLine) => void): SearchHandle {
    let job!: Job
    const promise = new Promise<SearchResult>((resolve, reject) => {
      job = { req, onInfo, resolve, reject, cancelled: false }
    })
    if (this.dead) job.reject(new Error('Engine is not available'))
    else {
      this.queue.push(job)
      void this.pump()
    }
    return {
      promise,
      cancel: () => {
        if (job.cancelled) return
        job.cancelled = true
        if (this.current === job) this.send('stop')
        else {
          this.queue = this.queue.filter((j) => j !== job)
          job.resolve({ bestmove: null, lines: [], cancelled: true })
        }
      },
    }
  }

  /** Cancel everything queued or running. */
  stopAll(): void {
    for (const j of this.queue) j.resolve({ bestmove: null, lines: [], cancelled: true })
    this.queue = []
    if (this.current) {
      this.current.cancelled = true
      this.send('stop')
    }
  }

  newGame(): void {
    this.stopAll()
    this.send('ucinewgame')
  }

  terminate(): void {
    this.stopAll()
    this.dead = true
    this.worker.terminate()
  }

  private async pump(): Promise<void> {
    if (this.current) return
    await this.ready
    const job = this.queue.shift()
    if (!job || this.current) {
      if (job) this.queue.unshift(job)
      return
    }
    this.current = job
    try {
      job.resolve(await this.run(job))
    } catch (e) {
      job.reject(e)
    } finally {
      this.current = null
      void this.pump()
    }
  }

  private async run(job: Job): Promise<SearchResult> {
    const { req } = job
    const options: UciOptions = { MultiPV: req.multipv ?? 1, ...req.options }
    let changed = false
    for (const [name, value] of Object.entries(options)) {
      if (this.applied[name] === value) continue
      this.send(`setoption name ${name} value ${value}`)
      this.applied[name] = value
      changed = true
    }
    if (changed) await this.sync()

    const byPv = new Map<number, InfoLine>()
    const done = new Promise<string | null>((resolve) => {
      this.lineHandler = (line) => {
        const info = parseInfo(line)
        if (info && !info.bound) {
          byPv.set(info.multipv, info)
          job.onInfo?.(info)
          return
        }
        if (line.startsWith('bestmove')) resolve(parseBestMove(line))
      }
    })
    const moves = req.moves?.length ? ` moves ${req.moves.join(' ')}` : ''
    this.send(`position fen ${req.fen}${moves}`)
    const limits = [
      req.depth != null && `depth ${req.depth}`,
      req.movetime != null && `movetime ${req.movetime}`,
      req.nodes != null && `nodes ${req.nodes}`,
    ].filter(Boolean)
    this.send(`go ${limits.join(' ') || 'depth 12'}`)
    if (job.cancelled) this.send('stop')
    const bestmove = await done
    this.lineHandler = null
    const lines = [...byPv.values()].sort((a, b) => a.multipv - b.multipv)
    return { bestmove, lines, cancelled: job.cancelled }
  }

  private async sync(): Promise<void> {
    this.send('isready')
    await this.waitFor((l) => l === 'readyok')
  }

  private waitFor(match: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ match, resolve }))
  }

  private onLine(line: string): void {
    if (!line) return
    const i = this.waiters.findIndex((w) => w.match(line))
    if (i >= 0) {
      this.waiters.splice(i, 1)[0].resolve()
      return
    }
    this.lineHandler?.(line)
  }

  private send(cmd: string): void {
    if (!this.dead) this.worker.postMessage(cmd)
  }
}
