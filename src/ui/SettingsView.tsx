import { createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Settings } from '../storage/db'
import { BOARD_THEMES, PIECE_SETS } from './themes'
import { playSound, setSoundEnabled, soundDefault } from './sound'
import { MAX_BACKUP_BYTES, parseBackup, type BackupData } from '../storage/backup'
import { applyImport, exportFile } from '../storage/dataio'
import { hasWebGpu, WEBLLM_DOWNLOAD_MB } from '../ai'
import { forgetApiKey, getApiKey, setApiKey } from '../ai/key'
import type { AiProvider, AiSettings } from '../ai/types'

type Props = { settings: Settings; onSettings: (s: Settings) => void; onDataChanged: () => Promise<void> | void }

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="card settings-section" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  )
}

/** Chessground's own <piece> element, so previews use exactly the CSS the board uses. */
const Piece = ({ role, color }: { role: string; color: 'white' | 'black' }) => createElement('piece', { className: `${role} ${color}` })

export default function SettingsView({ settings, onSettings, onDataChanged }: Props) {
  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch })
  const soundOn = settings.sound ?? soundDefault()
  return (
    <div className="settings">
      <h2>Settings</h2>

      <Section id="look-title" title="Look">
        <fieldset className="choice-group">
          <legend>Colour theme</legend>
          <div className="segmented" role="radiogroup" aria-label="Colour theme">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={settings.theme === t} className={settings.theme === t ? 'on' : ''} onClick={() => set({ theme: t })}>
                {t === 'system' ? 'Match device' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="choice-group">
          <legend>Board</legend>
          <div className="swatches" role="radiogroup" aria-label="Board colours">
            {BOARD_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={settings.boardTheme === t.id}
                className={`swatch ${settings.boardTheme === t.id ? 'on' : ''}`}
                onClick={() => set({ boardTheme: t.id })}
              >
                <span className={`board-preview board-${t.id}`} aria-hidden="true" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="choice-group">
          <legend>Pieces</legend>
          <div className="swatches" role="radiogroup" aria-label="Piece set">
            {PIECE_SETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={settings.pieceSet === p.id}
                className={`swatch ${settings.pieceSet === p.id ? 'on' : ''}`}
                onClick={() => set({ pieceSet: p.id })}
              >
                <span className={`piece-preview cg-wrap pieces-${p.id} board-preview board-${settings.boardTheme}`} aria-hidden="true">
                  <Piece role="knight" color="white" />
                  <Piece role="queen" color="black" />
                </span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section id="sound-title" title="Sound">
        <div className="row spread">
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={soundOn}
              onChange={(e) => {
                set({ sound: e.target.checked })
                setSoundEnabled(e.target.checked)
                if (e.target.checked) playSound('move')
              }}
            />
            <span>Sound effects</span>
          </label>
          <button type="button" className="small-btn" disabled={!soundOn} onClick={() => playSound('capture')}>
            Test
          </button>
        </div>
        <p className="small muted">Moves, captures, checks, castling, game end and puzzle results. Starts off if your device asks for reduced motion.</p>
      </Section>

      <Section id="kb-title" title="Keyboard and screen readers">
        <ul className="small tips">
          <li>
            <strong>Tab</strong> to the board, then <strong>arrow keys</strong> to choose a square and <strong>Enter</strong> to pick up and put down a piece.{' '}
            <strong>Esc</strong> drops the piece.
          </li>
          <li>Or type moves like <code>e4</code>, <code>Nf3</code> or <code>O-O</code> in the box next to the board.</li>
          <li>Every move is read out in words, followed by the coach’s note.</li>
        </ul>
      </Section>

      <AiSection ai={settings.ai} onAi={(ai) => set({ ai })} />

      <DataSection onDataChanged={onDataChanged} />
    </div>
  )
}

// ---------- AI ----------

const PROVIDERS: { value: AiProvider; label: string; help: string }[] = [
  { value: 'off', label: 'Off', help: 'The coach uses its own words. Everything works without AI.' },
  { value: 'webllm', label: 'In this browser', help: 'Free and private: a small model runs on your device. Needs a recent browser with WebGPU.' },
  { value: 'ollama', label: 'Ollama on my computer', help: 'Advanced: use a model from an Ollama server you run yourself.' },
  { value: 'byok', label: 'My own API key', help: 'Use your Anthropic API key. You pay Anthropic for what you use.' },
]

function AiSection({ ai, onAi }: { ai: AiSettings; onAi: (ai: AiSettings) => void }) {
  return (
    <Section id="ai-title" title="Friendlier wording (optional AI)">
      <p className="small muted">
        The coach’s facts always come from Stockfish and board checks. If you turn this on, an AI only rewords those facts in plainer language — anything that adds a move, number or
        idea is thrown away and you see the coach’s own words instead.
      </p>
      <div className="provider-list" role="radiogroup" aria-label="AI wording">
        {PROVIDERS.map((p) => (
          <label key={p.value} className={`provider ${ai.provider === p.value ? 'on' : ''}`}>
            <input type="radio" name="ai-provider" checked={ai.provider === p.value} onChange={() => onAi({ ...ai, provider: p.value })} />
            <span>
              <strong>{p.label}</strong>
              <span className="small muted block">{p.help}</span>
            </span>
          </label>
        ))}
      </div>
      {ai.provider === 'webllm' && <WebLlmSetup ai={ai} onAi={onAi} />}
      {ai.provider === 'ollama' && <OllamaSetup ai={ai} onAi={onAi} />}
      {ai.provider === 'byok' && <KeySetup ai={ai} onAi={onAi} />}
    </Section>
  )
}

function WebLlmSetup({ ai, onAi }: { ai: AiSettings; onAi: (ai: AiSettings) => void }) {
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<{ f: number; text: string } | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void hasWebGpu().then(setGpu)
    if (ai.webllmConsent) void import('../ai/webllm').then((m) => m.isDownloaded()).then(setReady, () => {})
  }, [ai.webllmConsent])

  if (gpu === null) return <p className="small muted">Checking your browser…</p>
  if (!gpu)
    return (
      <p className="callout small" role="status">
        This browser can’t run the model (it needs WebGPU — recent Chrome, Edge or Safari on a newer device). Try “Ollama” or “My own API key”, or leave AI off.
      </p>
    )
  const download = async () => {
    setError('')
    onAi({ ...ai, webllmConsent: true })
    try {
      const m = await import('../ai/webllm')
      await m.loadEngine((f, text) => setProgress({ f, text }))
      setReady(true)
      setProgress(null)
    } catch {
      setProgress(null)
      setError('The download didn’t finish. Check your connection and free space, then try again.')
    }
  }
  return (
    <div className="ai-setup">
      {ready ? (
        <p className="small good-text" role="status">
          Model ready ✓ It stays in this browser, so it won’t download again.
        </p>
      ) : progress ? (
        <div role="status">
          <progress value={progress.f} max={1} aria-label="Model download" />
          <p className="small muted">Downloading… {Math.round(progress.f * 100)}%. You can keep using the app.</p>
        </div>
      ) : (
        <>
          <p className="small">
            The model (Llama 3.2 1B) is a one-time download of <strong>about {WEBLLM_DOWNLOAD_MB} MB</strong>. Use Wi-Fi if your data plan is limited.
          </p>
          <button type="button" className="primary" onClick={() => void download()}>
            Download {WEBLLM_DOWNLOAD_MB} MB model
          </button>
        </>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function OllamaSetup({ ai, onAi }: { ai: AiSettings; onAi: (ai: AiSettings) => void }) {
  const [url, setUrl] = useState(ai.ollamaUrl ?? 'http://localhost:11434')
  const [models, setModels] = useState<string[]>(ai.ollamaModel ? [ai.ollamaModel] : [])
  const [msg, setMsg] = useState('')
  const connect = async () => {
    setMsg('Connecting…')
    const m = await import('../ai/ollama')
    const r = await m.listModels(url)
    if ('error' in r) return setMsg(r.error)
    setModels(r.models)
    setMsg(`Connected ✓ ${r.models.length} model${r.models.length === 1 ? '' : 's'} found.`)
    onAi({ ...ai, ollamaUrl: url, ollamaModel: ai.ollamaModel && r.models.includes(ai.ollamaModel) ? ai.ollamaModel : r.models[0] })
  }
  return (
    <div className="ai-setup">
      <label className="field">
        <span className="small">Server address</span>
        <div className="row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} />
          <button type="button" onClick={() => void connect()}>
            Connect
          </button>
        </div>
      </label>
      {msg && (
        <p className="small" role="status">
          {msg}
        </p>
      )}
      {models.length > 0 && (
        <label className="field">
          <span className="small">Model</span>
          <select value={ai.ollamaModel ?? ''} onChange={(e) => onAi({ ...ai, ollamaUrl: url, ollamaModel: e.target.value })}>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      )}
      <p className="small muted">
        Ollama must allow this site: start it with <code>OLLAMA_ORIGINS={location.origin}</code>. Your notes go only to that server.
      </p>
    </div>
  )
}

function KeySetup({ ai, onAi }: { ai: AiSettings; onAi: (ai: AiSettings) => void }) {
  const [hasKey, setHasKey] = useState(() => getApiKey() !== '')
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState(ai.byokModel ?? '')
  const [msg, setMsg] = useState('')
  const save = async () => {
    setApiKey(draft)
    setDraft('')
    setHasKey(true)
    setMsg('Checking the key…')
    const m = await import('../ai/anthropic')
    const err = await m.testKey(ai.byokModel)
    setMsg(err ?? 'Key works ✓')
  }
  return (
    <div className="ai-setup">
      <p className="small">
        Your key is stored <strong>only in this browser</strong> (not in backups, not on any server of ours — there isn’t one). It is sent only to Anthropic, with each note to
        reword. Anyone using this browser profile could find it, so don’t use a shared computer.
      </p>
      {hasKey ? (
        <div className="row wrap">
          <span className="small">A key is saved.</span>
          <button
            type="button"
            className="danger small-btn"
            onClick={() => {
              forgetApiKey()
              setHasKey(false)
              setMsg('Key forgotten.')
            }}
          >
            Forget key
          </button>
        </div>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) void save()
          }}
        >
          <label className="sr-only" htmlFor="api-key">
            Anthropic API key
          </label>
          <input id="api-key" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} />
          <button type="submit" disabled={!draft.trim()}>
            Save key
          </button>
        </form>
      )}
      <label className="field">
        <span className="small">Model (optional)</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => onAi({ ...ai, byokModel: model.trim() || undefined })}
          placeholder="claude-opus-5-5"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      {msg && (
        <p className="small" role="status">
          {msg}
        </p>
      )}
    </div>
  )
}

// ---------- data ----------

function DataSection({ onDataChanged }: { onDataChanged: Props['onDataChanged'] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: BackupData; skipped: string[] } | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const download = async () => {
    const file = await exportFile()
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `beacyn-chess-backup-${file.exportedAt.slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setMsg({ text: `Saved ${file.data.games.length} games and all your training to a file.` })
  }

  const pick = async (f: File | undefined) => {
    setPending(null)
    if (!f) return
    if (f.size > MAX_BACKUP_BYTES) return setMsg({ text: 'That file is too big to be a Beacyn Chess backup (the limit is 25 MB).', error: true })
    const r = parseBackup(await f.text())
    if (!r.ok) return setMsg({ text: r.error, error: true })
    setMsg(null)
    setPending({ data: r.data, skipped: r.skipped })
  }

  const confirm = async () => {
    if (!pending) return
    setBusy(true)
    try {
      await applyImport(pending.data, mode)
      await onDataChanged()
      setMsg({ text: mode === 'merge' ? 'Imported ✓ Your data now includes the backup.' : 'Imported ✓ This browser now has the backup’s data.' })
    } catch {
      setMsg({ text: 'Saving the import failed, so nothing was changed. Your browser may be out of space.', error: true })
    }
    setBusy(false)
    setPending(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const d = pending?.data
  return (
    <Section id="data-title" title="Your data">
      <p className="small muted">Everything stays in this browser: no account, no server, no tracking. Save a backup to move to another device or keep it safe.</p>
      <div className="row wrap">
        <button type="button" onClick={() => void download()}>
          Export my data
        </button>
        <label className="button-like">
          Import a backup…
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} data-testid="import-file" />
        </label>
      </div>
      {d && (
        <div className="callout import-confirm" role="dialog" aria-labelledby="import-title" data-testid="import-confirm">
          <p id="import-title">
            <strong>
              This backup has {d.games.length} game{d.games.length === 1 ? '' : 's'}, {d.training.results.length} puzzle result{d.training.results.length === 1 ? '' : 's'} and{' '}
              {d.training.lessonsDone.length} finished lesson{d.training.lessonsDone.length === 1 ? '' : 's'}.
            </strong>
          </p>
          {pending.skipped.length > 0 && <p className="small">Some records looked damaged and will be skipped: {pending.skipped.join(', ')}.</p>}
          <div className="provider-list" role="radiogroup" aria-label="How to import">
            <label className={`provider ${mode === 'merge' ? 'on' : ''}`}>
              <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span>
                <strong>Merge</strong>
                <span className="small muted block">Keep what’s here and add what’s in the backup.</span>
              </span>
            </label>
            <label className={`provider ${mode === 'replace' ? 'on' : ''}`}>
              <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span>
                <strong>Replace</strong>
                <span className="small muted block">Delete this browser’s games and progress and use the backup instead.</span>
              </span>
            </label>
          </div>
          <div className="row">
            <button type="button" className={mode === 'replace' ? 'danger' : 'primary'} disabled={busy} onClick={() => void confirm()}>
              {mode === 'replace' ? 'Replace my data' : 'Merge'}
            </button>
            <button type="button" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p className={`small ${msg.error ? 'error' : 'good-text'}`} role={msg.error ? 'alert' : 'status'} data-testid="data-msg">
          {msg.text}
        </p>
      )}
    </Section>
  )
}
