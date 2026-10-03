import { describe, expect, it } from 'vitest'
import { LIMITS, validateSuggestion } from '../src/core/schema'

const valid = {
  id: 's1',
  groupId: 's1',
  author: { kind: 'ai', clientId: 7, name: 'Co-author' },
  from: { item: { client: 1, clock: 3 }, assoc: 0 },
  to: { item: { client: 1, clock: 8 }, assoc: -1 },
  original: 'very ',
  insert: '',
  instruction: 'tighten',
  status: 'ready',
  createdAt: 1,
}

describe('validateSuggestion', () => {
  it('accepts a well-formed suggestion', () => {
    expect(validateSuggestion('s1', valid)).toEqual({ ok: true })
  })
  it('rejects an id that does not match the key', () => {
    expect(validateSuggestion('other', valid).ok).toBe(false)
  })
  it('rejects non-ai authors', () => {
    expect(validateSuggestion('s1', { ...valid, author: { kind: 'human', clientId: 7, name: 'x' } }).ok).toBe(false)
  })
  it('rejects missing anchors', () => {
    expect(validateSuggestion('s1', { ...valid, from: null }).ok).toBe(false)
    expect(validateSuggestion('s1', { ...valid, to: { foo: 1 } }).ok).toBe(false)
  })
  it('rejects oversized text', () => {
    expect(validateSuggestion('s1', { ...valid, insert: 'x'.repeat(LIMITS.maxText + 1) }).ok).toBe(false)
  })
  it('rejects a non-string insert and a bad status', () => {
    expect(validateSuggestion('s1', { ...valid, insert: 42 }).ok).toBe(false)
    expect(validateSuggestion('s1', { ...valid, status: 'applied' }).ok).toBe(false)
  })
  it('rejects non-objects', () => {
    expect(validateSuggestion('s1', 'nope').ok).toBe(false)
    expect(validateSuggestion('s1', [valid]).ok).toBe(false)
  })
})
