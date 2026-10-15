import { useEffect, useState } from 'react'
import { describeResult, importPgn, MAX_PGN_CHARS, opponentLabel, PgnImportError, userScore, type Color, type GameRecord } from '../game/session'
import { listGames, saveGame } from '../storage/db'

export function RecentGames({ onReview }: { onReview: (id: string) => void }) {
  const [games, setGames] = useState<GameRecord[] | null>(null)
  useEffect(() => {
    void listGames().then((g) => setGames(g.filter((x) => x.result).slice(0, 8)))
  }, [])
  if (!games || games.length === 0) return null
  return (
    <section className="card recent" aria-labelledby="recent-title">
      <h2 id="recent-title">Your games</h2>
      <ul className="recent-list" data-testid="recent-games">
        {games.map((g) => (
          <RecentGameRow key={g.id} game={g} onReview={onReview} />
        ))}
      </ul>
    </section>
  )
}

/** One saved game. Imported names are shown as plain text (React escapes them). */
export function RecentGameRow({ game: g, onReview }: { game: GameRecord; onReview: (id: string) => void }) {
  const s = userScore(g)
  const tag = s === 1 ? 'win' : s === 0 ? 'loss' : 'draw'
  return (
    <li>
      <span className={`result-tag ${tag}`}>{tag === 'win' ? 'Win' : tag === 'loss' ? 'Loss' : 'Draw'}</span>
      <span className="recent-main">
        <span>
          vs {g.imported ? opponentLabel(g) : `Coach ≈${g.rating}`} · {g.moves.length} moves
        </span>
        <span className="small muted">
          {new Date(g.startedAt).toLocaleDateString()} · {describeResult(g)}
        </span>
      </span>
      <button type="button" className="small-btn" onClick={() => onReview(g.id)}>
        Review
      </button>
    </li>
  )
}

const GENERIC_IMPORT_ERROR = 'Something went wrong reading that game. Check that it is PGN text for one game.'

export function ImportPgn({ onImported }: { onImported: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [side, setSide] = useState<Color>('w')
  const [err, setErr] = useState('')
  const submit = async () => {
    setErr('')
    try {
      const g = importPgn(text, side)
      await saveGame(g)
      onImported(g.id)
    } catch (e) {
      // Only our own messages are shown; anything unexpected gets a generic one.
      setErr(e instanceof PgnImportError ? e.message : GENERIC_IMPORT_ERROR)
    }
  }
  const pickFile = async (file: File | undefined) => {
    setErr('')
    if (!file) return
    // Check the size before reading, so a huge file is never loaded into memory.
    if (file.size > MAX_PGN_CHARS * 4) {
      setErr(`That file is too big for one game (limit ${Math.round(MAX_PGN_CHARS / 1000)} KB). Choose a file with a single game.`)
      return
    }
    try {
      setText(await file.text())
    } catch {
      setErr('That file couldn’t be read.')
    }
  }
  return (
    <section className="card import" aria-labelledby="import-title">
      <button type="button" className="link import-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} id="import-title">
        {open ? '▾' : '▸'} Review a game from elsewhere (PGN)
      </button>
      {open && (
        <div className="import-body">
          <label htmlFor="pgn-text" className="small">
            Paste the PGN of a game you played (from Lichess, Chess.com, etc.). Imported games don’t change your rating.
          </label>
          <textarea id="pgn-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'[White "You"]\n[Black "Friend"]\n\n1. e4 e5 2. Nf3 …'} />
          <label className="file-pick small">
            Or choose a file:{' '}
            <input type="file" accept=".pgn,text/plain,application/x-chess-pgn" onChange={(e) => void pickFile(e.target.files?.[0])} />
          </label>
          <div className="segmented" role="radiogroup" aria-label="Which side did you play?">
            {(['w', 'b'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={side === c} className={side === c ? 'on' : ''} onClick={() => setSide(c)}>
                <span className={`side-dot side-${c}`} aria-hidden="true" /> I was {c === 'w' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
          {err && (
            <p className="error small" role="alert">
              {err}
            </p>
          )}
          <button type="button" className="primary" onClick={() => void submit()} disabled={!text.trim()}>
            Import and review
          </button>
        </div>
      )}
    </section>
  )
}
