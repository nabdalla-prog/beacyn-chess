// Parsing of Stockfish UCI output into typed values.

/** Score from the side to move's point of view, as Stockfish reports it. */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number }

export interface InfoLine {
  depth: number
  multipv: number
  score: Score
  /** Set when the score is only a bound from an aspiration window. */
  bound?: 'lower' | 'upper'
  nodes?: number
  timeMs?: number
  /** Principal variation in UCI notation, e.g. ["e2e4", "e7e5"]. */
  pv: string[]
}

export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return null
  const t = line.split(/\s+/)
  let depth = 0
  let multipv = 1
  let score: Score | null = null
  let bound: InfoLine['bound']
  let nodes: number | undefined
  let timeMs: number | undefined
  let pv: string[] = []
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i])
        break
      case 'multipv':
        multipv = Number(t[++i])
        break
      case 'nodes':
        nodes = Number(t[++i])
        break
      case 'time':
        timeMs = Number(t[++i])
        break
      case 'score': {
        const kind = t[++i]
        const value = Number(t[++i])
        if (kind === 'cp' || kind === 'mate') score = { type: kind, value }
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = t[++i] === 'lowerbound' ? 'lower' : 'upper'
        }
        break
      }
      case 'pv':
        pv = t.slice(i + 1).filter(Boolean)
        i = t.length
        break
    }
  }
  if (!score || pv.length === 0) return null
  return { depth, multipv, score, bound, nodes, timeMs, pv }
}

export function parseBestMove(line: string): string | null {
  const m = /^bestmove (\S+)/.exec(line)
  if (!m || m[1] === '(none)') return null
  return m[1]
}

/** Flip a side-to-move score to White's point of view. */
export function toWhitePov(score: Score, sideToMove: 'w' | 'b'): Score {
  return sideToMove === 'w' ? score : { type: score.type, value: -score.value }
}

/** Centipawn-like number for sorting and win-probability; mates are pushed to ±100000 minus distance. */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value
  if (score.value === 0) return -100000
  return Math.sign(score.value) * (100000 - Math.abs(score.value) * 100)
}

export function formatScore(score: Score): string {
  if (score.type === 'mate') return `${score.value > 0 ? '' : '-'}M${Math.abs(score.value)}`
  const v = score.value / 100
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}
