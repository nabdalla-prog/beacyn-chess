// A small model that runs inside the browser on the GPU (WebGPU), via WebLLM.
// Downloaded once after the user agrees, then kept in the browser's cache.
import { CreateMLCEngine, hasModelInCache, type MLCEngine } from '@mlc-ai/web-llm'
import { SYSTEM_PROMPT, userPrompt } from './guard'
import type { AiFacts } from './types'

export const WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC'

let engine: Promise<MLCEngine> | null = null

export function loadEngine(onProgress?: (fraction: number, text: string) => void): Promise<MLCEngine> {
  engine ??= CreateMLCEngine(WEBLLM_MODEL, { initProgressCallback: (p) => onProgress?.(p.progress, p.text) }).catch((e: unknown) => {
    engine = null
    throw e
  })
  return engine
}

export const isDownloaded = () => hasModelInCache(WEBLLM_MODEL)

export async function rewrite(f: AiFacts): Promise<string | null> {
  const e = await loadEngine()
  const reply = await e.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(f) },
    ],
    temperature: 0.3,
    max_tokens: 160,
  })
  return reply.choices[0]?.message?.content ?? null
}
