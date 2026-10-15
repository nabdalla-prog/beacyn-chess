import { useEffect, useState } from 'react'
import { rewriteNote } from './index'
import type { AiFacts, AiSettings } from './types'

/** The AI's wording of a note once it arrives (and passes the checks), else null. */
export function useAiNote(f: AiFacts | null, s: AiSettings): string | null {
  const [result, setResult] = useState<{ key: string; text: string | null } | null>(null)
  const key = f ? `${s.provider}|${f.san}|${f.text}` : ''
  useEffect(() => {
    if (!f || s.provider === 'off') return
    let alive = true
    void rewriteNote(f, s).then((text) => alive && setResult({ key, text }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.provider, s.ollamaModel, s.byokModel, s.webllmConsent])
  return result?.key === key ? result.text : null
}
