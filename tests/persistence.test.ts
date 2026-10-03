import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { attachPersistence } from '../src/sync/persistence'
import { getSuggestions } from '../src/core/schema'
import { blocksOf, makeDoc, suggestionFor, textType } from './helpers'

describe('persistence', () => {
  it('restores text and suggestions after a reload', async () => {
    const name = `p-${Math.random()}`
    const a = makeDoc(['persist me'], 1)
    const pa = await attachPersistence(a, name)
    textType(a, 0).insert(0, 'please ')
    getSuggestions(a).set('s', suggestionFor(a, 0, 0, 6, 'kindly', { id: 's' }))
    await new Promise((r) => setTimeout(r, 50))
    await pa.destroy()

    const b = new Y.Doc()
    const pb = await attachPersistence(b, name)
    expect(blocksOf(b)[0]).toBe('please persist me')
    expect(getSuggestions(b).has('s')).toBe(true)
    await pb.destroy()
  })
})
