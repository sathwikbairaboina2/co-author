import { createThinkFilter, readSSE } from './sse'
import type { RewriteRequest, TextModel } from './model'

export interface OpenAIConfig {
  baseUrl: string
  model: string
  apiKey?: string
  temperature?: number
}

export const DEFAULT_OPENAI: OpenAIConfig = { baseUrl: '/ollama/v1', model: 'qwen3.8:27b' }

export const SYSTEM_PROMPT =
  'You are a careful copy editor. Rewrite the passage according to the instruction. ' +
  'Return only the rewritten passage, with no preface, quotes, markdown or commentary. ' +
  'Keep the meaning and the voice. Do not add facts.'

export function buildRequestBody(config: OpenAIConfig, req: RewriteRequest) {
  return {
    model: config.model,
    stream: true,
    temperature: config.temperature ?? 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Instruction: ${req.instruction}\n\nPassage:\n${req.text}\n\n/no_think` },
    ],
  }
}

export function extractDelta(json: unknown): string {
  const c = (json as { choices?: Array<{ delta?: { content?: unknown } }> } | null)?.choices?.[0]?.delta?.content
  return typeof c === 'string' ? c : ''
}

export function createOpenAIModel(config: OpenAIConfig, fetchImpl?: typeof fetch): TextModel {
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis)
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  return {
    id: 'openai',
    label: config.model,
    async *stream(req) {
      let res: Response
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify(buildRequestBody(config, req)),
          signal: req.signal,
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err
        throw new Error(`Could not reach ${config.baseUrl}. Is Ollama running and allowed for this origin? (${(err as Error).message})`)
      }
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Model endpoint returned ${res.status}: ${detail.slice(0, 200)}`)
      }
      const filter = createThinkFilter()
      for await (const data of readSSE(res.body)) {
        if (data === '[DONE]') break
        let json: unknown
        try {
          json = JSON.parse(data)
        } catch {
          continue
        }
        const piece = filter.push(extractDelta(json))
        if (piece) yield piece
      }
      const tail = filter.flush()
      if (tail) yield tail
    },
  }
}
