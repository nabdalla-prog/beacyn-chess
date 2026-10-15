// Optional AI wording. Off by default; the app never needs it.
export type AiProvider = 'off' | 'webllm' | 'ollama' | 'byok'
export type ByokVendor = 'anthropic' | 'openai'

export interface AiSettings {
  provider: AiProvider
  /** Ollama server, e.g. http://localhost:11434 */
  ollamaUrl?: string
  ollamaModel?: string
  byokVendor?: ByokVendor
  byokModel?: string
  /** The user agreed to download the in-browser model. */
  webllmConsent?: boolean
}

/** The facts the AI may reword. Everything here was produced by the engine or a board detector. */
export interface AiFacts {
  san: string
  /** "Blunder", "Good move", … */
  verdict: string
  /** The coach's own sentence(s), built from verified facts. */
  text: string
}
