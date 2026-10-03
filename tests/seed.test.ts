import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { applySeed, seedUpdate } from '../src/app/seed'
import { getText } from '../src/core/schema'
import { blocksOf, syncAll, textType } from './helpers'

describe('seed', () => {
  it('produces heading and paragraph blocks', () => {
    const doc = new Y.Doc()
    applySeed(doc)
    expect(getText(doc).length).toBe(6)
    expect(blocksOf(doc)[0]).toBe('Why the AI should knock first')
  })
  it('is idempotent across peers', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    applySeed(a)
    applySeed(b)
    applySeed(a)
    syncAll([a, b])
    expect(getText(a).length).toBe(6)
    expect(blocksOf(a)).toEqual(blocksOf(b))
  })
  it('does not resurrect deleted seed text', () => {
    const doc = new Y.Doc()
    applySeed(doc)
    textType(doc, 0).delete(0, 4)
    applySeed(doc)
    expect(blocksOf(doc)[0]).toBe('the AI should knock first')
  })
  it('is byte-stable', () => {
    expect(seedUpdate()).toEqual(seedUpdate())
  })
})
