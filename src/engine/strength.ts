// Maps an estimated rating (≈400–2500) to engine settings, and picks the
// opponent's move so lower levels make human-like mistakes.
import type { UciOptions } from './engine'
import { scoreToCp, type InfoLine } from './uci'

export const MIN_RATING = 400
export const MAX_RATING = 2500
/** At and above this rating Stockfish's own UCI_Elo limiter is used. */
export const ELO_LIMIT_FROM = 1400

export interface StrengthConfig {
  options: UciOptions
  depth?: number
  movetime?: number
  multipv: number
  /** Softmax temperature in centipawns; 0 = always play the engine's move. */
  temperature: number
  /** Chance of a "slip": a random legal move instead of a considered one. */
  slipChance: number
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function clampRating(r: number): number {
  return Math.round(clamp(r, MIN_RATING, MAX_RATING))
}

export function strengthConfig(rating: number): StrengthConfig {
  const r = clampRating(rating)
  if (r >= ELO_LIMIT_FROM) {
    const t = (r - ELO_LIMIT_FROM) / (MAX_RATING - ELO_LIMIT_FROM)
    return {
      options: { UCI_LimitStrength: true, UCI_Elo: clamp(r, 1320, 3190), 'Skill Level': 20 },
      movetime: Math.round(lerp(300, 1000, t)),
      multipv: 1,
      temperature: 0,
      slipChance: 0,
    }
  }
  // Below 1400: honest multi-line search, then a weighted human-like choice.
  const t = (r - MIN_RATING) / (ELO_LIMIT_FROM - MIN_RATING) // 0 at 400, 1 at 1400
  return {
    options: { UCI_LimitStrength: false, 'Skill Level': 20 },
    depth: Math.round(lerp(5, 10, t)),
    multipv: 6,
    // Exponential: 300cp at 400 (often ignores material), 30cp at 1400.
    temperature: Math.round(300 * Math.pow(30 / 300, t)),
    slipChance: Number(lerp(0.12, 0.01, t).toFixed(3)),
  }
}

/** Deterministic PRNG for tests and reproducible games. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Choose the engine's move. `lines` are side-to-move scored candidates from a
 * MultiPV search; `legal` is every legal UCI move (used for slips).
 */
export function pickMove(
  lines: InfoLine[],
  legal: string[],
  bestmove: string | null,
  cfg: StrengthConfig,
  rng: () => number = Math.random,
): string | null {
  if (legal.length === 0) return null
  if (cfg.slipChance > 0 && rng() < cfg.slipChance) {
    return legal[Math.floor(rng() * legal.length)]
  }
  const candidates = lines.filter((l) => l.pv[0] && legal.includes(l.pv[0]))
  if (cfg.temperature <= 0 || candidates.length <= 1) {
    return bestmove && legal.includes(bestmove) ? bestmove : (candidates[0]?.pv[0] ?? legal[0])
  }
  const cps = candidates.map((l) => clamp(scoreToCp(l.score), -1500, 1500))
  const top = Math.max(...cps)
  const weights = cps.map((cp) => Math.exp((cp - top) / cfg.temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  let x = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    x -= weights[i]
    if (x <= 0) return candidates[i].pv[0]
  }
  return candidates[candidates.length - 1].pv[0]
}
