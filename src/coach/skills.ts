// Skill profile: every user move becomes skill events built only from verified
// facts (the engine's verdict and the concept detectors stored on the move),
// which roll up into recency-weighted scores and the weakest-skill list.
import { Chess, type Square } from 'chess.js'
import { isError, type MoveClass } from './classify'
import { VALUE } from './board'
import { replay, type GameRecord } from '../game/session'
import type { Motif, Outcome } from './tactics'

export type SkillId =
  | 'tactics'
  | 'openings'
  | 'middlegame'
  | 'endgames'
  | 'calculation'
  | 'time'
  | 'blunders'
  | 'motif:hanging'
  | 'motif:fork'
  | 'motif:pin'
  | 'motif:discovered'
  | 'motif:mate'

/** The seven radar axes, in display order. */
export const RADAR_SKILLS: SkillId[] = ['tactics', 'openings', 'middlegame', 'endgames', 'calculation', 'time', 'blunders']
export const MOTIFS: SkillId[] = ['motif:hanging', 'motif:fork', 'motif:pin', 'motif:discovered', 'motif:mate']

export const SKILL_INFO: Record<SkillId, { name: string; noun: string }> = {
  tactics: { name: 'Tactics', noun: 'tactical moments' },
  openings: { name: 'Openings', noun: 'opening moves' },
  middlegame: { name: 'Middlegame', noun: 'middlegame moves' },
  endgames: { name: 'Endgames', noun: 'endgame moves' },
  calculation: { name: 'Calculation', noun: 'sharp positions' },
  time: { name: 'Time use', noun: 'moves' },
  blunders: { name: 'Avoiding blunders', noun: 'moves' },
  'motif:hanging': { name: 'Loose pieces', noun: 'moments with a piece hanging' },
  'motif:fork': { name: 'Forks', noun: 'fork moments' },
  'motif:pin': { name: 'Pins & skewers', noun: 'pin or skewer moments' },
  'motif:discovered': { name: 'Discovered attacks', noun: 'discovered-attack moments' },
  'motif:mate': { name: 'Checkmate patterns', noun: 'mating moments' },
}

const MOTIF_SKILL: Record<Motif, SkillId> = {
  hanging: 'motif:hanging',
  fork: 'motif:fork',
  pin: 'motif:pin',
  discovered: 'motif:discovered',
  mate: 'motif:mate',
}

/** Lichess puzzle themes that train each motif. */
export const THEME_MOTIF: Record<string, Motif> = {
  hangingPiece: 'hanging',
  trappedPiece: 'hanging',
  fork: 'fork',
  pin: 'pin',
  skewer: 'pin',
  discoveredAttack: 'discovered',
  mateIn1: 'mate',
  mateIn2: 'mate',
  mateIn3: 'mate',
  backRankMate: 'mate',
}

/** Older verdicts without tactic tags: which detector concepts count toward which motif. */
const CONCEPT_MOTIF: Record<string, SkillId> = {
  'hanging-piece': 'motif:hanging',
  'missed-threat': 'motif:hanging',
  'missed-capture': 'motif:hanging',
  'won-material': 'motif:hanging',
  'trapped-piece': 'motif:hanging',
  fork: 'motif:fork',
  'missed-fork': 'motif:fork',
  pin: 'motif:pin',
  skewer: 'motif:pin',
  'missed-pin': 'motif:pin',
  'discovered-attack': 'motif:discovered',
  'allowed-mate': 'motif:mate',
  'missed-mate': 'motif:mate',
  'back-rank': 'motif:mate',
  checkmate: 'motif:mate',
}

export interface SkillEvent {
  skill: SkillId
  ok: boolean
  /** Where it came from. Only game events can be shown as an example position. */
  source: 'game' | 'puzzle'
  /** For tactics: found / defended / missed / failed-defense (or a puzzle result). */
  outcome?: Outcome
  gameId: string
  ply: number
  at: number
  san: string
  cls: MoveClass
  /** Win-% lost on the move. */
  loss: number
}

export type Phase = 'opening' | 'middlegame' | 'endgame'

/** Opening = first 12 moves; endgame = little material left; otherwise middlegame. */
export function phaseOf(chess: Chess): Phase {
  let pieces = 0
  let queens = 0
  for (const p of chess.board().flat()) {
    if (!p || p.type === 'k' || p.type === 'p') continue
    pieces += VALUE[p.type]
    if (p.type === 'q') queens++
  }
  if (pieces <= 2600 || (queens === 0 && pieces <= 3600)) return 'endgame'
  if (Number(chess.fen().split(' ')[5]) <= 12) return 'opening'
  return 'middlegame'
}

/** Sharp = a forcing best move (capture or check) or the mover is in check. */
export function isSharp(chess: Chess, bestUci: string | undefined): boolean {
  if (chess.isCheck()) return true
  if (!bestUci) return false
  if (chess.get(bestUci.slice(2, 4) as Square)) return true
  try {
    const c = new Chess(chess.fen())
    c.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] })
    return c.isCheck()
  } catch {
    return false
  }
}

/** A move made in under this many ms counts as "rushed" if it was an error. */
export const RUSHED_MS = 3000

/**
 * Skill events for one game. Uses the coach's stored verdict on each user move
 * (`move.review`); moves without one are skipped, as are moves played after the
 * hint ladder showed the answer (level 3+), since they aren't the user's own find.
 */
export function eventsFromGame(game: GameRecord): SkillEvent[] {
  const out: SkillEvent[] = []
  const chess = replay(game, 0)
  const initialMs = game.timeControl ? game.timeControl.initial * 1000 : 0
  game.moves.forEach((m, ply) => {
    const r = m.review
    if (m.by === 'user' && r && (m.hintLevel ?? 0) < 3) {
      const base = { gameId: game.id, ply, at: game.startedAt, san: m.san, cls: r.cls, loss: r.loss, source: 'game' as const }
      const bad = isError(r.cls)
      const add = (skill: SkillId, ok: boolean, outcome?: Outcome) => out.push({ ...base, skill, ok, outcome })

      const phase = phaseOf(chess)
      add(phase === 'opening' ? 'openings' : phase === 'endgame' ? 'endgames' : 'middlegame', !bad)
      add('blunders', r.cls !== 'blunder' && r.cls !== 'missed-win')
      if (isSharp(chess, r.best)) add('calculation', !bad)

      if (r.tags) {
        // Successes count too: tactics the user found and real threats they defended.
        for (const t of r.tags) {
          const ok = t.outcome === 'found' || t.outcome === 'defended'
          add(MOTIF_SKILL[t.motif], ok, t.outcome)
          add('tactics', ok, t.outcome)
        }
      } else {
        const motifs = new Set(r.concepts.map((c) => CONCEPT_MOTIF[c]).filter(Boolean))
        for (const motif of motifs) {
          add(motif, !bad)
          add('tactics', !bad)
        }
      }

      if (m.timeMs > 0 && !game.imported) {
        const rushed = bad && m.timeMs < RUSHED_MS
        const lowClock = !!initialMs && m.clockMs != null && m.clockMs < initialMs * 0.1 && bad
        add('time', !rushed && !lowClock)
      }
    }
    chess.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
  })
  return out
}

export interface PuzzleResult {
  puzzleId: string
  themes: string[]
  /** Solved without a wrong move, hint or shown answer. */
  clean: boolean
  at: number
}

/**
 * Puzzle results feed the tactical motifs. Each day's puzzles count as one
 * "game" for recency weighting, so a long puzzle session doesn't drown out play.
 */
export function eventsFromPuzzles(results: PuzzleResult[]): SkillEvent[] {
  const out: SkillEvent[] = []
  for (const r of results) {
    const motifs = new Set(r.themes.map((t) => THEME_MOTIF[t]).filter(Boolean))
    const day = new Date(r.at).toISOString().slice(0, 10)
    const base = { gameId: `puzzles:${day}`, ply: 0, at: r.at, san: '', cls: (r.clean ? 'best' : 'mistake') as MoveClass, loss: r.clean ? 0 : 10, source: 'puzzle' as const }
    for (const m of motifs) {
      out.push({ ...base, skill: MOTIF_SKILL[m], ok: r.clean, outcome: r.clean ? 'found' : 'missed' })
      out.push({ ...base, skill: 'tactics', ok: r.clean, outcome: r.clean ? 'found' : 'missed' })
    }
  }
  return out
}

export interface SkillScore {
  skill: SkillId
  /** 0–100, recency-weighted share of good outcomes; null without enough data. */
  score: number | null
  n: number
  bad: number
  /** The user's most costly mistake for this skill (a real position to show). */
  example: SkillEvent | null
  /** Mistakes for this skill, most costly first (up to 10), for picking distinct examples. */
  mistakes: SkillEvent[]
}

/** Minimum events before a skill gets a score. */
export const MIN_EVENTS: Record<'radar' | 'motif', number> = { radar: 5, motif: 3 }
/** Each older game counts this much less than the next newer one. */
export const RECENCY = 0.85

export function scoreSkills(events: SkillEvent[]): Record<SkillId, SkillScore> {
  const gameOrder = [...new Set([...events].sort((a, b) => b.at - a.at).map((e) => e.gameId))]
  const age = new Map(gameOrder.map((id, i) => [id, i]))
  const result = {} as Record<SkillId, SkillScore>
  for (const skill of [...RADAR_SKILLS, ...MOTIFS]) {
    const ev = events.filter((e) => e.skill === skill)
    let w = 0
    let good = 0
    for (const e of ev) {
      const weight = Math.pow(RECENCY, age.get(e.gameId) ?? 0)
      w += weight
      if (e.ok) good += weight
    }
    const mistakes = ev
      .filter((e) => !e.ok && e.source === 'game')
      .sort((a, b) => b.loss - a.loss || b.at - a.at)
      .slice(0, 10)
    const min = skill.startsWith('motif:') ? MIN_EVENTS.motif : MIN_EVENTS.radar
    result[skill] = {
      skill,
      score: ev.length >= min && w > 0 ? Math.round((100 * good) / w) : null,
      n: ev.length,
      bad: ev.filter((e) => !e.ok).length,
      example: mistakes[0] ?? null,
      mistakes,
    }
  }
  return result
}

/**
 * The three weakest skills with data, worst first. Motifs compete with the
 * radar skills, except the umbrella "tactics" score (its motifs are more specific).
 */
export function weakestSkills(scores: Record<SkillId, SkillScore>, count = 3): SkillScore[] {
  const ranked = Object.values(scores)
    .filter((s) => s.skill !== 'tactics' && s.score != null && s.bad > 0)
    .sort((a, b) => a.score! - b.score! || b.bad - a.bad)
  // Give each weak skill its own example position where possible.
  const used = new Set<string>()
  const out: SkillScore[] = []
  for (const s of ranked) {
    if (out.length >= count) break
    const pick = s.mistakes.find((m) => !used.has(`${m.gameId}:${m.ply}`)) ?? s.mistakes[0]
    if (!pick) continue
    used.add(`${pick.gameId}:${pick.ply}`)
    out.push({ ...s, example: pick })
  }
  return out
}

/** One plain sentence about a weak skill, with a real example from the user's games. */
export function weaknessSentence(s: SkillScore, exampleText: string, moveLabel: string): string {
  const info = SKILL_INFO[s.skill]
  const lead = `${s.bad} of your ${s.n} ${info.noun} went wrong`
  return `${lead}. For example, ${moveLabel}: ${exampleText}`
}

/** Score history for trend lines: the skill's score after each game (only once it has enough data). */
export function skillTrend(eventsByGame: { gameId: string; at: number; events: SkillEvent[] }[], skill: SkillId): { at: number; score: number }[] {
  const sorted = [...eventsByGame].sort((a, b) => a.at - b.at)
  const out: { at: number; score: number }[] = []
  const acc: SkillEvent[] = []
  for (const g of sorted) {
    acc.push(...g.events)
    const s = scoreSkills(acc)[skill]
    if (s.score != null && g.events.some((e) => e.skill === skill)) out.push({ at: g.at, score: s.score })
  }
  return out
}
