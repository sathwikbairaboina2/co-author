import { describe, expect, it } from 'vitest'
import { cleanModelOutput } from '../src/ai/model'
import { createMockModel, rewriteDeterministically } from '../src/ai/mockModel'

async function collect(it: AsyncIterable<string>) {
  let s = ''
  for await (const c of it) s += c
  return s
}

describe('mock model', () => {
  it('cuts filler and plain-languages phrases', () => {
    expect(rewriteDeterministically('We really want to utilize the tool in order to ship.')).toBe('We want to use the tool to ship.')
    expect(rewriteDeterministically('Due to the fact that it is very late, we stop.')).toBe('Because it is late, we stop.')
    expect(rewriteDeterministically('Basically the plan works.')).toBe('The plan works.')
  })
  it('leaves clean text alone', () => {
    expect(rewriteDeterministically('The plan works.')).toBe('The plan works.')
  })
  it('streams tokens that join to the rewrite, deterministically', async () => {
    const model = createMockModel({ tokenDelayMs: 0 })
    const text = 'This is just a very small test.'
    const a = await collect(model.stream({ text, instruction: 'tighten' }))
    const b = await collect(model.stream({ text, instruction: 'tighten' }))
    expect(a).toBe(rewriteDeterministically(text))
    expect(a).toBe(b)
  })
  it('stops when aborted', async () => {
    const model = createMockModel({ tokenDelayMs: 5 })
    const ctl = new AbortController()
    const chunks: string[] = []
    await expect(async () => {
      for await (const c of model.stream({ text: 'one two three four five six', instruction: '', signal: ctl.signal })) {
        chunks.push(c)
        if (chunks.length === 2) ctl.abort()
      }
    }).rejects.toThrow(/abort/i)
    expect(chunks.length).toBe(2)
  })
})

describe('cleanModelOutput', () => {
  it('strips think blocks, quotes and whitespace', () => {
    expect(cleanModelOutput('<think>hmm</think>\n  "Tight text."  ')).toBe('Tight text.')
    expect(cleanModelOutput('Plain.')).toBe('Plain.')
    expect(cleanModelOutput('<think>never closed')).toBe('')
  })
})
