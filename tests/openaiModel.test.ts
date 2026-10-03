import { describe, expect, it, vi } from 'vitest'
import { createThinkFilter } from '../src/ai/sse'
import { createOpenAIModel, DEFAULT_OPENAI, extractDelta } from '../src/ai/openaiModel'

const enc = new TextEncoder()
function sseResponse(chunks: string[], status = 200) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch))
        c.close()
      },
    }),
    { status, headers: { 'content-type': 'text/event-stream' } },
  )
}
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

async function collect(it: AsyncIterable<string>) {
  let s = ''
  for await (const c of it) s += c
  return s
}

describe('openai-compatible model', () => {
  it('defaults to the proxied Ollama endpoint and qwen3.8:27b', () => {
    expect(DEFAULT_OPENAI).toEqual({ baseUrl: '/ollama/v1', model: 'qwen3.8:27b' })
  })

  it('streams deltas split at awkward boundaries and strips think blocks', async () => {
    const body = delta('<thi') + delta('nk>plan</th') + delta('ink>Hello') + delta(' world') + 'data: [DONE]\n\n'
    const chunks = [body.slice(0, 17), body.slice(17, 50), body.slice(50, 51), body.slice(51)]
    const fetchImpl = vi.fn(async () => sseResponse(chunks))
    const model = createOpenAIModel({ baseUrl: 'http://x/v1/', model: 'm' }, fetchImpl as unknown as typeof fetch)
    expect(await collect(model.stream({ text: 'Hi', instruction: 'tighten' }))).toBe('Hello world')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://x/v1/chat/completions')
    const sent = JSON.parse(String(init.body))
    expect(sent).toMatchObject({ model: 'm', stream: true })
    expect(sent.messages[0].role).toBe('system')
    expect(sent.messages[1].content).toContain('Hi')
  })

  it('sends the API key only when configured', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n']))
    await collect(createOpenAIModel({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'k' }, fetchImpl as unknown as typeof fetch).stream({ text: 'a', instruction: 'b' }))
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k')
  })

  it('reports HTTP errors with the status', async () => {
    const fetchImpl = vi.fn(async () => new Response('model not found', { status: 404 }))
    const model = createOpenAIModel({ baseUrl: 'http://x/v1', model: 'm' }, fetchImpl as unknown as typeof fetch)
    await expect(collect(model.stream({ text: 'a', instruction: 'b' }))).rejects.toThrow(/returned 404/)
  })

  it('explains unreachable endpoints', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    const model = createOpenAIModel({ baseUrl: 'http://x/v1', model: 'm' }, fetchImpl as unknown as typeof fetch)
    await expect(collect(model.stream({ text: 'a', instruction: 'b' }))).rejects.toThrow(/Could not reach/)
  })
})

describe('helpers', () => {
  it('extractDelta ignores unexpected shapes', () => {
    expect(extractDelta({ choices: [{ delta: { content: 'a' } }] })).toBe('a')
    expect(extractDelta({})).toBe('')
    expect(extractDelta(null)).toBe('')
  })
  it('think filter handles tags split across chunks', () => {
    const f = createThinkFilter()
    expect(f.push('A<th') + f.push('ink>x</thi') + f.push('nk>B<') + f.flush()).toBe('AB<')
  })
})
