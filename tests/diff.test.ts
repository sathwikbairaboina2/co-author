import { describe, expect, it } from 'vitest'
import { applyHunks, diffWords } from '../src/ai/diff'
import { mulberry32 } from './helpers'

describe('diffWords', () => {
  it('returns no hunks for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([])
  })
  it('finds a single deletion', () => {
    const h = diffWords('This is very good.', 'This is good.')
    expect(h).toEqual([{ from: 8, to: 13, insert: '' }])
  })
  it('finds separate hunks for separate changes', () => {
    const a = 'We really want to utilize the tool in order to ship.'
    const b = 'We want to use the tool to ship.'
    const h = diffWords(a, b)
    expect(h.length).toBe(3)
    expect(applyHunks(a, h)).toBe(b)
  })
  it('handles empty inputs', () => {
    expect(applyHunks('', diffWords('', 'new words'))).toBe('new words')
    expect(applyHunks('old words', diffWords('old words', ''))).toBe('')
  })
  it('round-trips random edits (property)', () => {
    const rand = mulberry32(9)
    const words = ['alpha', 'beta', 'gamma', 'delta', 'very', 'just', 'tool', 'ship']
    const sentence = () => Array.from({ length: 4 + Math.floor(rand() * 10) }, () => words[Math.floor(rand() * words.length)]).join(' ')
    for (let i = 0; i < 200; i++) {
      const a = sentence()
      const b = sentence()
      expect(applyHunks(a, diffWords(a, b))).toBe(b)
    }
  })
})
