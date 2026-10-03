import { describe, expect, it } from 'vitest'
import { getSuggestions } from '../src/core/schema'
import { connectAiPeer } from '../src/core/gate'
import { acceptSuggestion, listSuggestionViews, rejectSuggestion } from '../src/core/suggestions'
import { AiPeer, type AiPresence } from '../src/ai/aiPeer'
import { createMockModel } from '../src/ai/mockModel'
import type { TextModel } from '../src/ai/model'
import { blocksOf, makeDoc, textType } from './helpers'

const TEXT = 'This is very good and we utilize it.'

function setup(model: TextModel = createMockModel({ tokenDelayMs: 0 })) {
  const human = makeDoc(['Title', TEXT])
  const ai = new AiPeer({ model, flushMs: 0, now: () => 1 })
  const conn = connectAiPeer(human, ai.doc)
  return { human, ai, conn }
}

/** A model whose stream pauses after the first token until `release()` is called. */
function gatedModel(first: string, rest: string) {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  let reached!: () => void
  const firstSent = new Promise<void>((r) => { reached = r })
  const model: TextModel = {
    id: 'gated',
    label: 'gated',
    async *stream({ signal }) {
      yield first
      reached()
      await gate
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      yield rest
    },
  }
  return { model, release: () => release(), firstSent }
}

describe('AiPeer', () => {
  it('proposes word-level hunks that a human can accept', async () => {
    const { human, ai, conn } = setup()
    const r = await ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'tighten' })
    expect(r.kind).toBe('hunks')
    const views = listSuggestionViews(human)
    expect(views.length).toBe(2)
    views.forEach((v) => expect(v.state).toBe('ready'))
    views.forEach((v) => acceptSuggestion(human, v.suggestion.id))
    expect(blocksOf(human)[1]).toBe('This is good and we use it.')
    expect(conn.stats()).toMatchObject({ blocked: 0 })
    expect(conn.stats().passed).toBeGreaterThan(0)
  })

  it('streams a growing draft before splitting', async () => {
    const { human, ai } = setup()
    const seen: string[] = []
    human.on('update', () => {
      getSuggestions(human).forEach((s) => { if (s.status === 'streaming') seen.push(s.insert) })
    })
    await ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'tighten' })
    const lengths = [...new Set(seen)].map((s) => s.length)
    expect(lengths.length).toBeGreaterThan(2)
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
  })

  it('returns noop and leaves nothing when there is nothing to change', async () => {
    const { human, ai } = setup()
    const r = await ai.propose({ blockIndex: 0, from: 0, to: 5, instruction: 'tighten' })
    expect(r).toMatchObject({ kind: 'noop' })
    expect(getSuggestions(human).size).toBe(0)
  })

  it('keeps one draft (shown as conflict) if the human edits the scope while it streams', async () => {
    const g = gatedModel('This is ', 'good and we use it.')
    const { human, ai } = setup(g.model)
    const pending = ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'tighten' })
    await g.firstSent
    textType(human, 1).insert(5, 'still ')
    g.release()
    expect((await pending).kind).toBe('draft')
    const views = listSuggestionViews(human)
    expect(views).toHaveLength(1)
    expect(views[0].state).toBe('conflict')
  })

  it('reject during streaming stops the AI and the draft never comes back', async () => {
    const g = gatedModel('This ', 'is good.')
    const { human, ai } = setup(g.model)
    const pending = ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'tighten' })
    await g.firstSent
    const id = [...getSuggestions(human).keys()][0]
    rejectSuggestion(human, id)
    g.release()
    expect(await pending).toMatchObject({ kind: 'noop' })
    expect(listSuggestionViews(human)).toHaveLength(0)
  })

  it('abort removes the draft', async () => {
    const g = gatedModel('This ', 'is good.')
    const { human, ai } = setup(g.model)
    const ctl = new AbortController()
    const pending = ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'x' }, ctl.signal)
    await g.firstSent
    ctl.abort()
    g.release()
    expect(await pending).toEqual({ kind: 'aborted' })
    expect(getSuggestions(human).size).toBe(0)
  })

  it('model failure removes the draft and rethrows', async () => {
    const failing: TextModel = {
      id: 'f',
      label: 'f',
      async *stream() {
        yield 'This '
        throw new Error('Could not reach /ollama/v1')
      },
    }
    const { human, ai } = setup(failing)
    await expect(ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'x' })).rejects.toThrow(/Could not reach/)
    expect(getSuggestions(human).size).toBe(0)
  })

  it('publishes presence while working and goes idle after', async () => {
    const g = gatedModel('This ', 'is good.')
    const { ai } = setup(g.model)
    const pending = ai.propose({ blockIndex: 1, from: 0, to: TEXT.length, instruction: 'x' })
    await g.firstSent
    const busy = ai.awareness.getLocalState()?.user as AiPresence
    expect(busy.kind).toBe('ai')
    expect(busy.activity).not.toBe('idle')
    expect(busy.caret).not.toBeNull()
    g.release()
    await pending
    expect((ai.awareness.getLocalState()?.user as AiPresence).activity).toBe('idle')
  })

  it('a direct write attempt is blocked by the gate', () => {
    const { human, ai, conn } = setup()
    const before = blocksOf(human)
    ai.attemptDirectWrite()
    expect(blocksOf(human)).toEqual(before)
    expect(conn.stats()).toMatchObject({ blocked: 1, quarantined: true })
  })
})
