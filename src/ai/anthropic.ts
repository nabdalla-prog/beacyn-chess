// "Bring your own key": calls Anthropic directly from this browser with the user's key.
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from './key'
import { SYSTEM_PROMPT, userPrompt } from './guard'
import type { AiFacts } from './types'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

export async function rewrite(f: AiFacts, model: string | undefined, signal: AbortSignal): Promise<string | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null
  // The key belongs to the user and stays in their browser, so a browser client is what we want here.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 })
  const response = await client.beta.messages.create(
    {
      model: model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' }, // a two-sentence rewrite needs little thinking
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt(f) }],
    },
    { signal },
  )
  if (response.stop_reason === 'refusal') return null
  return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim() || null
}

/** A tiny call to check the key works. */
export async function testKey(model: string | undefined): Promise<string | null> {
  try {
    const out = await rewrite({ san: 'e4', verdict: 'Good move', text: 'Good move: it takes space in the centre.' }, model, AbortSignal.timeout(20000))
    return out ? null : 'The model gave no answer.'
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return 'That key was not accepted.'
    if (e instanceof Anthropic.NotFoundError) return 'That model name wasn’t found.'
    if (e instanceof Anthropic.RateLimitError) return 'Rate limited — try again in a minute.'
    if (e instanceof Anthropic.APIError) return `Anthropic said: ${e.message}`
    return 'Couldn’t reach Anthropic.'
  }
}
