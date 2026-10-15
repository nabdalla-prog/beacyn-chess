// State and flow for a game against the coach: user moves, engine replies,
// clocks, takebacks, game end, adaptive strength and persistence.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import { Engine } from '../engine/engine'
import { pickMove, strengthConfig } from '../engine/strength'
import { nextRating } from '../engine/adaptive'
import {
  applyTakeback,
  detectGameOver,
  legalDests,
  moveToUci,
  newGame,
  replay,
  takebackPlies,
  timeoutResult,
  tryUci,
  TIME_CONTROLS,
  userScore,
  type Color,
  type GameRecord,
  type GameResult,
  type MoveRecord,
  type MoveReview,
} from '../game/session'
import { pressClock, remaining, startClock, stopClock, type ClockState } from '../game/clock'
import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  loadCurrentGame,
  loadProfile,
  loadSettings,
  saveCurrentGame,
  saveGame,
  saveProfile,
  saveSettings,
  type Profile,
  type Settings,
} from '../storage/db'

/** Minimum time the coach "thinks", so moves don't appear instantly. */
const MIN_THINK_MS = 500

let sharedEngine: Engine | null = null
function opponentEngine(): Engine {
  sharedEngine ??= new Engine()
  return sharedEngine
}

export interface PendingPromotion {
  from: Square
  to: Square
}

export function usePlay() {
  const [loaded, setLoaded] = useState(false)
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS)
  const [game, setGame] = useState<GameRecord | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)
  const [thinking, setThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [, setTick] = useState(0)
  /** Bumped to make the board re-sync after a move was rejected or cancelled. */
  const [boardKey, setBoardKey] = useState(0)
  /** Guided mode is checking the user's move before it is played. */
  const [checking, setChecking] = useState(false)
  const turnStarted = useRef(Date.now())
  /** Set by the coach: may veto a user move (guided-mode warning). */
  const guardRef = useRef<((fenBefore: string, uci: string) => Promise<boolean>) | null>(null)
  /** Set by the coach: extra facts recorded on the user's next move (hint level used). */
  const moveMetaRef = useRef<Partial<MoveRecord>>({})
  /** Latest game state, including coach annotations that arrived after a callback captured `game`. */
  const latestGame = useRef<GameRecord | null>(null)
  useLayoutEffect(() => {
    latestGame.current = game
  }, [game])

  // ---- load saved state ----
  useEffect(() => {
    void (async () => {
      const [p, s, g] = await Promise.all([loadProfile(), loadSettings(), loadCurrentGame()])
      setProfile(p)
      setSettingsState(s)
      if (g && !g.result) {
        try {
          replay(g)
          setGame(g)
          // Clocks are paused across reloads; restore each side's last saved time.
          if (g.timeControl) {
            const c = startClock(g.timeControl, replay(g).turn(), Date.now())
            const first = sideToMove(g.startFen)
            g.moves.forEach((m, i) => {
              const mover: Color = i % 2 === 0 ? first : first === 'w' ? 'b' : 'w'
              if (m.clockMs != null) c[mover] = m.clockMs
            })
            setClock(c)
          }
        } catch {
          void saveCurrentGame(null)
        }
      }
      setLoaded(true)
    })()
  }, [])

  const chess = useMemo(() => (game ? replay(game) : null), [game])
  const turn: Color = chess?.turn() ?? 'w'
  const userTurn = !!game && !game.result && turn === game.userColor
  const dests = useMemo(() => (chess && userTurn ? legalDests(chess) : new Map()), [chess, userTurn])

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s)
    void saveSettings(s)
  }, [])

  // ---- finishing ----
  const finish = useCallback(
    (g: GameRecord, result: GameResult) => {
      const done: GameRecord = { ...g, result, endedAt: Date.now() }
      const score = userScore(done)!
      const p = profile
      const after = settings.adaptive ? nextRating(g.rating, score, p.gamesPlayed) : g.rating
      done.ratingAfter = after
      const newProfile: Profile = {
        rating: after,
        gamesPlayed: p.gamesPlayed + 1,
        ratingHistory: [...p.ratingHistory, { at: Date.now(), rating: after, gameId: g.id }],
      }
      setProfile(newProfile)
      setGame(done)
      setClock((c) => (c ? stopClock(c, Date.now()) : c))
      opponentEngine().stopAll()
      setThinking(false)
      void saveGame(done)
      void saveProfile(newProfile)
      void saveCurrentGame(null)
    },
    [profile, settings.adaptive],
  )

  // ---- applying a move ----
  const commitMove = useCallback(
    (g: GameRecord, uci: string, by: MoveRecord['by'], meta: Partial<MoveRecord> = {}): GameRecord | null => {
      g = withAnnotations(g, latestGame.current)
      const c = replay(g)
      const mv = tryUci(c, uci)
      if (!mv) return null
      const now = Date.now()
      const rec: MoveRecord = { ...meta, san: mv.san, uci: moveToUci(mv), by, timeMs: now - turnStarted.current }
      turnStarted.current = now
      let nextClock = clock
      if (g.timeControl && clock) {
        nextClock = pressClock(clock, g.timeControl, now)
        rec.clockMs = nextClock[mv.color]
        setClock(nextClock)
      }
      const next: GameRecord = { ...g, moves: [...g.moves, rec] }
      const who = by === 'user' ? 'You played' : 'Coach played'
      setAnnouncement(`${who} ${mv.san}${c.isCheck() ? ', check' : ''}.`)
      const over = detectGameOver(c)
      if (over) finish(next, over)
      else {
        setGame(next)
        void saveCurrentGame(next)
      }
      return next
    },
    [clock, finish],
  )

  // ---- engine's turn ----
  useEffect(() => {
    if (!game || game.result || !chess || turn === game.userColor) return
    const cfg = strengthConfig(game.rating)
    const engine = opponentEngine()
    const fen = chess.fen()
    const legal = chess.moves({ verbose: true }).map(moveToUci)
    const started = Date.now()
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setThinking(true)
    const handle = engine.search({ fen, depth: cfg.depth, movetime: cfg.movetime, multipv: cfg.multipv, options: cfg.options })
    handle.promise
      .then((res) => {
        if (!alive || res.cancelled) return
        const uci = pickMove(res.lines, legal, res.bestmove, cfg)
        if (!uci) return
        timer = setTimeout(() => {
          if (!alive) return
          setThinking(false)
          commitMove(game, uci, 'engine')
        }, Math.max(0, MIN_THINK_MS - (Date.now() - started)))
      })
      .catch((e: unknown) => {
        if (!alive) return
        setThinking(false)
        setEngineError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
      clearTimeout(timer)
      handle.cancel()
    }
    // Only re-run when the position changes, not when callbacks are re-created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.moves.length, game?.result])

  // ---- clocks ----
  useEffect(() => {
    if (!game?.timeControl || !clock?.running || game.result) return
    const id = setInterval(() => {
      const now = Date.now()
      const side = clock.running!
      if (remaining(clock, side, now) <= 0) {
        finish(game, timeoutResult(replay(game), side))
      } else setTick((t) => t + 1)
    }, 100)
    return () => clearInterval(id)
  }, [game, clock, finish])

  // ---- user actions ----
  const start = useCallback(
    (opts: { userColor: Color; rating: number; timeControlIndex: number }) => {
      opponentEngine().newGame()
      setEngineError(null)
      const tc = TIME_CONTROLS[opts.timeControlIndex]?.value ?? null
      const g: GameRecord = { ...newGame({ userColor: opts.userColor, rating: opts.rating, timeControl: tc }), coachMode: settings.coachMode }
      moveMetaRef.current = {}
      turnStarted.current = Date.now()
      setClock(tc ? startClock(tc, 'w', Date.now()) : null)
      setPromotion(null)
      setGame(g)
      setAnnouncement(`New game. You play ${opts.userColor === 'w' ? 'White' : 'Black'}.`)
      void saveCurrentGame(g)
      if (opts.rating !== profile.rating) {
        const p = { ...profile, rating: opts.rating }
        setProfile(p)
        void saveProfile(p)
      }
    },
    [profile, settings.coachMode],
  )

  const userMove = useCallback(
    (from: Square, to: Square, promo?: string, opts: { force?: boolean } = {}): boolean => {
      if (!game || !chess || !userTurn || checking) return false
      const candidates = chess.moves({ verbose: true }).filter((m) => m.from === from && m.to === to)
      if (candidates.length === 0) {
        setBoardKey((k) => k + 1)
        return false
      }
      if (candidates.some((m) => m.promotion) && !promo) {
        setPromotion({ from, to })
        return true
      }
      setPromotion(null)
      const uci = `${from}${to}${promo ?? ''}`
      const commit = (warned: boolean) => {
        const meta = { ...moveMetaRef.current, ...(warned ? { warned: true } : {}) }
        moveMetaRef.current = {}
        return commitMove(game, uci, 'user', meta) !== null
      }
      const guard = guardRef.current
      if (!guard || opts.force) return commit(!!opts.force)
      setChecking(true)
      void guard(chess.fen(), uci)
        .catch(() => true)
        .then((ok) => {
          setChecking(false)
          if (ok) commit(false)
        })
      return true
    },
    [game, chess, userTurn, checking, commitMove],
  )

  /** Put the board back to the real position (after a rejected or cancelled move). */
  const resetBoard = useCallback(() => setBoardKey((k) => k + 1), [])

  const cancelPromotion = useCallback(() => {
    setPromotion(null)
    setBoardKey((k) => k + 1)
  }, [])

  /** Attach the coach's verdict to a move; saved with the game. */
  const annotate = useCallback((ply: number, review: MoveReview) => {
    setGame((g) => {
      if (!g || !g.moves[ply] || g.moves[ply].review) return g
      const moves = g.moves.slice()
      moves[ply] = { ...moves[ply], review }
      const next = { ...g, moves }
      latestGame.current = next
      void (next.result ? saveGame(next) : saveCurrentGame(next))
      return next
    })
  }, [])

  const takeback = useCallback(() => {
    if (!game || game.result || takebackPlies(game) === 0) return
    opponentEngine().stopAll()
    setThinking(false)
    const g = applyTakeback(game)
    turnStarted.current = Date.now()
    if (clock && g.timeControl) setClock({ ...clock, running: replay(g).turn(), since: Date.now() })
    setGame(g)
    setAnnouncement('Move taken back. Your turn.')
    void saveCurrentGame(g)
  }, [game, clock])

  const resign = useCallback(() => {
    if (!game || game.result) return
    finish(game, { winner: game.userColor === 'w' ? 'b' : 'w', termination: 'resign' })
  }, [game, finish])

  const exitGame = useCallback(() => {
    opponentEngine().stopAll()
    setThinking(false)
    setGame(null)
    setClock(null)
  }, [])

  const now = Date.now()
  const clocks = clock ? { w: remaining(clock, 'w', now), b: remaining(clock, 'b', now), running: clock.running } : null

  return {
    loaded,
    profile,
    settings,
    setSettings,
    game,
    chess,
    turn,
    userTurn,
    dests,
    thinking,
    engineError,
    promotion,
    announcement,
    clocks,
    canTakeback: !!game && !game.result && !checking && takebackPlies(game) > 0,
    boardKey,
    checking,
    guardRef,
    moveMetaRef,
    resetBoard,
    annotate,
    start,
    userMove,
    cancelPromotion,
    takeback,
    resign,
    exitGame,
  }
}

/** Copy coach reviews from `latest` onto `g` for moves both records share. */
function withAnnotations(g: GameRecord, latest: GameRecord | null): GameRecord {
  if (!latest || latest.id !== g.id) return g
  let changed = false
  const moves = g.moves.map((m, i) => {
    const l = latest.moves[i]
    if (!m.review && l?.review && l.uci === m.uci) {
      changed = true
      return { ...m, review: l.review }
    }
    return m
  })
  return changed ? { ...g, moves } : g
}

function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}
