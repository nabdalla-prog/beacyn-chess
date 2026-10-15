import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import { GameView } from './ui/GameView'
import { NewGamePanel } from './ui/NewGamePanel'
import { usePlay } from './ui/usePlay'
import { useCoach } from './ui/useCoach'
import { getGame, type Settings } from './storage/db'
import type { GameRecord } from './game/session'
import { ImportPgn, RecentGames } from './ui/HomeExtras'
import { ThemeIcon } from './ui/icons'
import logoMark from './assets/beacyn-mark-dark-bg.svg'

// The review screen (and its chart and opening data) loads only when needed.
const ReviewView = lazy(() => import('./ui/ReviewView'))
const SkillsView = lazy(() => import('./ui/SkillsView'))

type Route = { page: 'home' } | { page: 'skills' } | { page: 'review'; id: string; ply: number | null }

/** Tiny hash router: "#/review/<gameId>[/<ply>]", "#/skills" or home. Keeps the back button working. */
function useHashRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb)
      return () => window.removeEventListener('hashchange', cb)
    },
    () => location.hash,
  )
  const m = /^#\/review\/([\w-]+)(?:\/(\d+))?$/.exec(hash)
  if (m) return { page: 'review', id: m[1], ply: m[2] != null ? Number(m[2]) : null }
  if (hash === '#/skills') return { page: 'skills' }
  return { page: 'home' }
}

/** True once the user has navigated inside the app, so "Back" can use browser history. */
let navigatedInApp = false
const openReview = (id: string, ply?: number) => {
  navigatedInApp = true
  location.hash = `#/review/${id}${ply != null ? `/${ply}` : ''}`
}
const back = () => {
  if (navigatedInApp) history.back()
  else goHome()
}
const goHome = () => {
  if (location.hash) history.pushState(null, '', location.pathname + location.search)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function ReviewRoute({ id, ply }: { id: string; ply: number | null }) {
  const [game, setGame] = useState<GameRecord | null | undefined>(undefined)
  useEffect(() => {
    void getGame(id).then((g) => setGame(g))
  }, [id])
  if (game === undefined) return <p className="muted center">Loading…</p>
  if (game === null)
    return (
      <div className="card new-game">
        <p>That game isn’t saved in this browser.</p>
        <button type="button" className="primary" onClick={goHome}>
          Home
        </button>
      </div>
    )
  return (
    <Suspense fallback={<p className="muted center">Loading review…</p>}>
      <ReviewView key={`${game.id}/${ply}`} game={game} initialPly={ply} onBack={back} />
    </Suspense>
  )
}

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System theme' },
  { value: 'light', label: 'Light theme' },
  { value: 'dark', label: 'Dark theme' },
]

export default function App() {
  const play = usePlay()
  const coach = useCoach(play)
  const { settings, setSettings } = play
  const route = useHashRoute()

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  const theme = THEMES.find((t) => t.value === settings.theme) ?? THEMES[0]
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <div className="app">
      <div className="topbar-wrap">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img className="brand-mark" src={logoMark} alt="" width="34" height="34" />
          <span className="wordmark">
            <span className="wm-strong">Beacyn</span> Chess
          </span>
        </a>
        <nav className="topnav" aria-label="Main">
          <a href="#/" aria-current={route.page === 'home' ? 'page' : undefined} onClick={(e) => (e.preventDefault(), goHome())}>
            Play
          </a>
          <a href="#/skills" aria-current={route.page === 'skills' ? 'page' : undefined} onClick={() => (navigatedInApp = true)}>
            Skills
          </a>
        </nav>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettings({ ...settings, theme: nextTheme.value })}
          aria-label={`${theme.label}. Switch to ${nextTheme.label.toLowerCase()}`}
          title={theme.label}
        >
          <ThemeIcon theme={theme.value} />
        </button>
      </header>
      </div>
      <main>
        {!play.loaded ? (
          <p className="muted center">Loading…</p>
        ) : route.page === 'review' ? (
          <ReviewRoute id={route.id} ply={route.ply} />
        ) : route.page === 'skills' ? (
          <Suspense fallback={<p className="muted center">Loading…</p>}>
            <SkillsView onOpenReview={openReview} onPlay={goHome} />
          </Suspense>
        ) : play.game ? (
          <GameView
            play={play}
            coach={coach}
            onNewGame={play.exitGame}
            onReview={() => {
              const id = play.game!.id
              play.exitGame()
              openReview(id)
            }}
          />
        ) : (
          <div className="home">
            <NewGamePanel profile={play.profile} settings={settings} onSettings={setSettings} onStart={play.start} />
            <RecentGames onReview={openReview} />
            <ImportPgn onImported={openReview} />
          </div>
        )}
      </main>
      <footer className="footer muted small">
        Free & open source (GPL-3.0) · Engine: Stockfish · Your data stays in this browser
      </footer>
    </div>
  )
}
