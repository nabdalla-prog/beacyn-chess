import { useEffect } from 'react'
import { GameView } from './ui/GameView'
import { NewGamePanel } from './ui/NewGamePanel'
import { usePlay } from './ui/usePlay'
import { useCoach } from './ui/useCoach'
import type { Settings } from './storage/db'
import { PieceIcon, ThemeIcon } from './ui/icons'

const THEMES: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System theme' },
  { value: 'light', label: 'Light theme' },
  { value: 'dark', label: 'Dark theme' },
]

export default function App() {
  const play = usePlay()
  const coach = useCoach(play)
  const { settings, setSettings } = play

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = settings.theme
  }, [settings.theme])

  const theme = THEMES.find((t) => t.value === settings.theme) ?? THEMES[0]
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">
            <PieceIcon role="n" color="w" />
          </span>
          Beacyn Chess
        </a>
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
      <main>
        {!play.loaded ? (
          <p className="muted center">Loading…</p>
        ) : play.game ? (
          <GameView play={play} coach={coach} onNewGame={play.exitGame} />
        ) : (
          <NewGamePanel profile={play.profile} settings={settings} onSettings={setSettings} onStart={play.start} />
        )}
      </main>
      <footer className="footer muted small">
        Free & open source (GPL-3.0) · Engine: Stockfish · Your data stays in this browser
      </footer>
    </div>
  )
}
