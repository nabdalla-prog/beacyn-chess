// A local Ollama server on the user's own computer (advanced).
import { SYSTEM_PROMPT, userPrompt } from './guard'
import type { AiFacts } from './types'

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

const base = (url?: string) => (url || DEFAULT_OLLAMA_URL).replace(/\/+$/, '')

/** Only plain http(s) URLs. */
export function validOllamaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password
  } catch {
    return false
  }
}

export async function rewrite(f: AiFacts, url: string | undefined, model: string | undefined, signal: AbortSignal): Promise<string | null> {
  if (!model || !validOllamaUrl(base(url))) return null
  const res = await fetch(`${base(url)}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      options: { temperature: 0.3, num_predict: 160 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(f) },
      ],
    }),
    signal,
  })
  if (!res.ok) return null
  const json: unknown = await res.json()
  const content = (json as { message?: { content?: unknown } })?.message?.content
  return typeof content === 'string' ? content : null
}

/** Model names installed on the server, or an error message. */
export async function listModels(url: string): Promise<{ models: string[] } | { error: string }> {
  if (!validOllamaUrl(base(url))) return { error: 'That doesn’t look like a web address (http://…).' }
  try {
    const res = await fetch(`${base(url)}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { error: `Ollama answered with an error (${res.status}).` }
    const json = (await res.json()) as { models?: { name?: unknown }[] }
    const models = (json.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === 'string').slice(0, 50)
    return models.length ? { models } : { error: 'Connected, but no models are installed. Run e.g. “ollama pull llama3.2”.' }
  } catch {
    return { error: 'Couldn’t connect. Is Ollama running, and does OLLAMA_ORIGINS allow this site?' }
  }
}
