import { afterEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { BroadcastChannelProvider } from '../src/sync/broadcast'
import { getSuggestions } from '../src/core/schema'
import { blocksOf, makeDoc, suggestionFor, textType, waitFor } from './helpers'

const open: BroadcastChannelProvider[] = []
afterEach(() => { open.splice(0).forEach((p) => p.destroy()) })

function tab(doc: Y.Doc, name: string) {
  const awareness = new Awareness(doc)
  const p = new BroadcastChannelProvider(doc, awareness, name)
  open.push(p)
  return { doc, awareness, p }
}

describe('BroadcastChannelProvider', () => {
  it('syncs initial state both ways on connect', async () => {
    const name = `t-${Math.random()}`
    const a = tab(makeDoc(['from a'], 1), name)
    const b = tab(new Y.Doc(), name)
    await waitFor(() => blocksOf(b.doc)[0] === 'from a')
    textType(b.doc, 0).insert(0, 'b says ')
    await waitFor(() => blocksOf(a.doc)[0] === 'b says from a')
  })

  it('relays awareness and counts peers', async () => {
    const name = `t-${Math.random()}`
    const a = tab(makeDoc(['x'], 1), name)
    const b = tab(new Y.Doc(), name)
    a.awareness.setLocalStateField('user', { kind: 'human', name: 'Ada', color: '#000' })
    await waitFor(() => b.awareness.getStates().get(a.doc.clientID)?.user?.name === 'Ada')
    await waitFor(() => a.p.peers.size === 1 && b.p.peers.size === 1)
  })

  it('merges edits made while offline, with nothing lost', async () => {
    const name = `t-${Math.random()}`
    const a = tab(makeDoc(['shared line'], 1), name)
    const b = tab(new Y.Doc(), name)
    await waitFor(() => blocksOf(b.doc)[0] === 'shared line')
    a.p.disconnect()
    b.p.disconnect()
    textType(a.doc, 0).insert(0, 'A1 ')
    textType(b.doc, 0).insert(11, ' B1')
    getSuggestions(b.doc).set('s', suggestionFor(b.doc, 0, 0, 6, 'Common', { id: 's' }))
    expect(blocksOf(a.doc)[0]).toBe('A1 shared line')
    a.p.connect()
    b.p.connect()
    await waitFor(() => blocksOf(a.doc)[0] === blocksOf(b.doc)[0] && getSuggestions(a.doc).has('s'))
    expect(blocksOf(a.doc)[0]).toBe('A1 shared line B1')
  })

  it('does not deliver while disconnected', async () => {
    const name = `t-${Math.random()}`
    const a = tab(makeDoc(['quiet'], 1), name)
    const b = tab(new Y.Doc(), name)
    await waitFor(() => blocksOf(b.doc)[0] === 'quiet')
    b.p.disconnect()
    textType(a.doc, 0).insert(0, 'loud ')
    await new Promise((r) => setTimeout(r, 50))
    expect(blocksOf(b.doc)[0]).toBe('quiet')
    expect(b.p.connected).toBe(false)
  })
})
