// IndexedDB storage. Everything stays in this browser; nothing is sent anywhere.
// If IndexedDB is unavailable (some private modes) we fall back to memory.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CoachMode, GameRecord } from '../game/session'
import type { BoardTheme, PieceSet } from '../ui/themes'
import type { AiSettings } from '../ai/types'

export interface Profile {
  /** Opponent strength / user's estimated rating. */
  rating: number
  gamesPlayed: number
  ratingHistory: { at: number; rating: number; gameId: string }[]
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  userColor: 'w' | 'b' | 'random'
  timeControl: number // index into TIME_CONTROLS
  adaptive: boolean
  coachMode: CoachMode
  /** Undefined until the user chooses; then the default depends on reduced motion. */
  sound?: boolean
  boardTheme: BoardTheme
  pieceSet: PieceSet
  ai: AiSettings
}

export const DEFAULT_PROFILE: Profile = { rating: 800, gamesPlayed: 0, ratingHistory: [] }
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  userColor: 'w',
  timeControl: 0,
  adaptive: true,
  coachMode: 'guided',
  boardTheme: 'beacyn',
  pieceSet: 'cburnett',
  ai: { provider: 'off' },
}

interface CoachDB extends DBSchema {
  games: { key: string; value: GameRecord; indexes: { startedAt: number } }
  kv: { key: string; value: unknown }
}

const DB_NAME = 'beacyn-chess'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CoachDB> | null> | null = null
const memory: { games: Map<string, GameRecord>; kv: Map<string, unknown> } = { games: new Map<string, GameRecord>(), kv: new Map<string, unknown>() }

function db(): Promise<IDBPDatabase<CoachDB> | null> {
  dbPromise ??= openDB<CoachDB>(DB_NAME, DB_VERSION, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        const games = d.createObjectStore('games', { keyPath: 'id' })
        games.createIndex('startedAt', 'startedAt')
        d.createObjectStore('kv')
      }
    },
  }).catch((e) => {
    console.warn('IndexedDB unavailable, progress will not be saved:', e)
    return null
  })
  return dbPromise
}

export async function storageAvailable(): Promise<boolean> {
  return (await db()) !== null
}

export async function getKv<T>(key: string, fallback: T): Promise<T> {
  const d = await db()
  const v = d ? await d.get('kv', key) : memory.kv.get(key)
  return v === undefined ? fallback : (v as T)
}

export async function setKv(key: string, value: unknown): Promise<void> {
  const d = await db()
  if (d) await d.put('kv', value, key)
  else memory.kv.set(key, value)
}

export async function deleteKv(key: string): Promise<void> {
  const d = await db()
  if (d) await d.delete('kv', key)
  else memory.kv.delete(key)
}

export async function saveGame(game: GameRecord): Promise<void> {
  const d = await db()
  if (d) await d.put('games', game)
  else memory.games.set(game.id, game)
}

export async function getGame(id: string): Promise<GameRecord | null> {
  const d = await db()
  return (d ? await d.get('games', id) : memory.games.get(id)) ?? null
}

export async function listGames(): Promise<GameRecord[]> {
  const d = await db()
  const all = d ? await d.getAllFromIndex('games', 'startedAt') : [...memory.games.values()]
  return all.sort((a, b) => b.startedAt - a.startedAt)
}

export const loadProfile = async () => ({ ...DEFAULT_PROFILE, ...(await getKv<Partial<Profile>>('profile', {})) })
export const saveProfile = (p: Profile) => setKv('profile', p)
export const loadSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await getKv<Partial<Settings>>('settings', {})) })
export const saveSettings = (s: Settings) => setKv('settings', s)
export const loadCurrentGame = () => getKv<GameRecord | null>('currentGame', null)
export const saveCurrentGame = (g: GameRecord | null) => (g ? setKv('currentGame', g) : deleteKv('currentGame'))

/** Replaces every saved game (used by "Import → Replace"). */
export async function replaceGames(games: GameRecord[]): Promise<void> {
  const d = await db()
  if (!d) {
    memory.games = new Map(games.map((g) => [g.id, g]))
    return
  }
  const tx = d.transaction('games', 'readwrite')
  await tx.store.clear()
  for (const g of games) await tx.store.put(g)
  await tx.done
}

export const loadBadges = () => getKv<Record<string, number>>('badges', {})
export const saveBadges = (b: Record<string, number>) => setKv('badges', b)
