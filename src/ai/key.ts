// The user's own API key lives only in this browser's localStorage. It is never put in
// IndexedDB, never exported in backups, and only ever sent to the provider it belongs to.
const KEY = 'beacyn-ai-key-anthropic'

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(value: string) {
  try {
    if (value) localStorage.setItem(KEY, value.trim())
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (private mode): the key simply isn't remembered.
  }
}

export const forgetApiKey = () => setApiKey('')
