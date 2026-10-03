import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Session } from '../src/app/session'
import { createMockModel } from '../src/ai/mockModel'
import { blockText } from '../src/core/anchors'
import { waitFor } from './helpers'

const live: Session[] = []
afterEach(() => { live.splice(0).forEach((s) => s.destroy()) })

async function open(docName: string) {
  const s = await Session.create({ docName, model: createMockModel({ tokenDelayMs: 0 }) })
  live.push(s)
  return s
}

describe('Session', () => {
  it('seeds, proposes, and syncs proposals and accepts across tabs', async () => {
    const name = `s-${Math.random()}`
    const a = await open(name)
    const b = await open(name)
    expect(blockText(a.doc, 0)).toBe('Why the AI should knock first')
    const text = blockText(a.doc, 1)
    const r = await a.propose({ blockIndex: 1, from: 0, to: text.length, instruction: 'tighten' })
    expect(r.kind).toBe('hunks')
    await waitFor(() => b.getSnapshot().views.length === a.getSnapshot().views.length)
    const first = b.getSnapshot().views[0].suggestion.id
    expect(b.accept(first)).toEqual({ ok: true })
    await waitFor(() => blockText(a.doc, 1) === blockText(b.doc, 1))
    expect(blockText(a.doc, 1)).not.toBe(text)
    expect(a.getSnapshot().resolved[0]).toMatchObject({ id: first, verdict: 'accepted' })
  })

  it('shows peers including the AI with its own identity', async () => {
    const name = `s-${Math.random()}`
    const a = await open(name)
    await open(name)
    await waitFor(() => a.getSnapshot().peers.length === 4)
    const kinds = a.getSnapshot().peers.map((p) => p.kind)
    expect(kinds.filter((k) => k === 'ai')).toHaveLength(2)
    expect(a.getSnapshot().peers[0].isLocal).toBe(true)
  })

  it('blocks a rogue write, restarts the AI, and keeps the text', async () => {
    const a = await open(`s-${Math.random()}`)
    const before = blockText(a.doc, 0)
    const oldAi = a.ai.doc.clientID
    const reasons: string[] = []
    a.onBlocked((r) => reasons.push(r))
    a.simulateRogueWrite()
    await waitFor(() => a.ai.doc.clientID !== oldAi)
    expect(blockText(a.doc, 0)).toBe(before)
    expect(reasons).toHaveLength(1)
    expect(a.getSnapshot().gate.blocked).toBe(1)
  })

  it('caches the snapshot until something changes', async () => {
    const a = await open(`s-${Math.random()}`)
    expect(a.getSnapshot()).toBe(a.getSnapshot())
  })

  it('removes presence of a destroyed session from other tabs', async () => {
    const name = `s-${Math.random()}`
    const a = await open(name)
    const b = await open(name)
    await waitFor(() => a.getSnapshot().peers.filter((p) => p.kind === 'human').length === 2)
    b.destroy()
    await waitFor(() => a.getSnapshot().peers.filter((p) => p.kind === 'human').length === 1)
    expect(a.getSnapshot().sync.tabs).toBe(1)
    expect(a.getSnapshot().peers.filter((p) => p.kind === 'ai')).toHaveLength(1)
  })

  it('gives tabs with clashing names different names', async () => {
    const name = `s-${Math.random()}`
    const tabs = await Promise.all(Array.from({ length: 6 }, () => open(name)))
    await waitFor(() => tabs.every((t) => t.getSnapshot().peers.filter((p) => p.kind === 'human').length === 6))
    await waitFor(() => new Set(tabs[0].getSnapshot().peers.filter((p) => p.kind === 'human').map((p) => p.name)).size === 6)
  })

  it('leaves the channel on pagehide and stops listening after destroy', async () => {
    const page = new EventTarget()
    vi.stubGlobal('addEventListener', page.addEventListener.bind(page))
    vi.stubGlobal('removeEventListener', page.removeEventListener.bind(page))
    try {
      const a = await open(`s-${Math.random()}`)
      page.dispatchEvent(new Event('pagehide'))
      expect(a.getSnapshot().sync.connected).toBe(false)
      const b = await open(`s-${Math.random()}`)
      b.destroy()
      page.dispatchEvent(new Event('pagehide'))
      expect(b.getSnapshot().sync.connected).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
