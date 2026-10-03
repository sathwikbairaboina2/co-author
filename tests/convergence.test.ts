import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getResolved, getSuggestions } from '../src/core/schema'
import { connectAiPeer } from '../src/core/gate'
import { acceptSuggestion, listSuggestionViews, rejectSuggestion } from '../src/core/suggestions'
import { blockText } from '../src/core/anchors'
import { addSuggestion, blocksOf, fork, makeDoc, mulberry32, suggestionFor, syncAll, textType } from './helpers'

const snapshot = (doc: Y.Doc) => ({
  blocks: blocksOf(doc),
  suggestions: getSuggestions(doc).toJSON(),
  resolved: getResolved(doc).toJSON(),
  states: listSuggestionViews(doc).map((v) => [v.suggestion.id, v.state]),
})

const base = () =>
  makeDoc(['A local-first editor.', 'The model proposes and the core disposes.', 'Every edit is very carefully tracked.'], 1)

describe('convergence', () => {
  it('two peers with concurrent edits and a suggestion converge', () => {
    const a = fork(base(), 10)
    const b = fork(a, 11)
    addSuggestion(a, suggestionFor(a, 2, 14, 19, ''))
    textType(b, 2).insert(0, 'Today, ')
    textType(a, 0).insert(0, 'Hello. ')
    syncAll([a, b])
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(listSuggestionViews(a)[0].state).toBe('ready')
  })

  it('three peers converge regardless of delivery order', () => {
    const root = base()
    const peers = [fork(root, 21), fork(root, 22), fork(root, 23)]
    const updates: Uint8Array[] = []
    peers.forEach((p) => p.on('update', (u: Uint8Array) => updates.push(u)))
    const ai = new Y.Doc()
    connectAiPeer(peers[2], ai)
    textType(peers[0], 1).insert(0, 'Rule: ')
    textType(peers[1], 1).delete(10, 9)
    getSuggestions(ai).set('ai-1', suggestionFor(ai, 2, 14, 19, '', { id: 'ai-1', clientId: ai.clientID }))
    const rand = mulberry32(7)
    const results = Array.from({ length: 5 }, () => {
      const d = fork(root)
      const order = [...updates].sort(() => rand() - 0.5)
      order.forEach((u) => Y.applyUpdate(d, u))
      return snapshot(d)
    })
    results.forEach((r) => expect(r).toEqual(results[0]))
  })

  it('a concurrent accept and an edit inside the range converge to one outcome', () => {
    const a = fork(base(), 31)
    addSuggestion(a, suggestionFor(a, 2, 14, 19, '', { id: 'x' }))
    const b = fork(a, 32)
    acceptSuggestion(a, 'x')
    textType(b, 2).insert(16, 'ry ve')
    syncAll([a, b])
    expect(snapshot(a)).toEqual(snapshot(b))
    expect(getResolved(a).get('x')?.verdict).toBe('accepted')
  })

  it('known limitation: a concurrent double accept duplicates the insert, but peers agree', () => {
    const doc = makeDoc(['We utilize it.'], 1)
    addSuggestion(doc, suggestionFor(doc, 0, 3, 10, 'use', { id: 'd' }))
    const a = fork(doc, 41)
    const b = fork(doc, 42)
    acceptSuggestion(a, 'd')
    acceptSuggestion(b, 'd')
    syncAll([a, b])
    expect(blocksOf(a)).toEqual(blocksOf(b))
    expect(blocksOf(a)[0]).toBe('We useuse it.')
  })

  it('seeded fuzz: three peers with AI suggestions, accepts and partial syncs converge', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rand = mulberry32(seed)
      const root = base()
      const peers = [fork(root, 100 + seed), fork(root, 200 + seed), fork(root, 300 + seed)]
      const ais = peers.map((p) => {
        const ai = new Y.Doc()
        connectAiPeer(p, ai)
        return ai
      })
      for (let round = 0; round < 40; round++) {
        const i = Math.floor(rand() * 3)
        const p = peers[i]
        const block = Math.floor(rand() * 3)
        const len = blockText(p, block).length
        const op = rand()
        if (op < 0.35) textType(p, block).insert(Math.floor(rand() * (len + 1)), ['x', 'yz', ' w '][Math.floor(rand() * 3)])
        else if (op < 0.5 && len > 6) textType(p, block).delete(Math.floor(rand() * (len - 3)), 2)
        else if (op < 0.75) {
          const ai = ais[i]
          const alen = blockText(ai, block).length
          const from = Math.floor(rand() * Math.max(1, alen - 4))
          const id = `ai-${ai.clientID}-${round}`
          getSuggestions(ai).set(id, suggestionFor(ai, block, from, Math.min(alen, from + 3), 'Q', { id, clientId: ai.clientID }))
        } else {
          const open = listSuggestionViews(p)
          if (open.length > 0) {
            const v = open[Math.floor(rand() * open.length)]
            if (rand() < 0.5) acceptSuggestion(p, v.suggestion.id)
            else rejectSuggestion(p, v.suggestion.id)
          }
        }
        if (rand() < 0.3) {
          const j = Math.floor(rand() * 3)
          syncAll([peers[i], peers[j]])
        }
      }
      syncAll(peers)
      expect(snapshot(peers[1])).toEqual(snapshot(peers[0]))
      expect(snapshot(peers[2])).toEqual(snapshot(peers[0]))
    }
  })
})
