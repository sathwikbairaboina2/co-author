import { describe, expect, it } from 'vitest'
import { getText } from '../src/core/schema'
import { blockText, makeRange, plainText, resolveRange } from '../src/core/anchors'
import { fork, makeDoc, textType } from './helpers'

// 'This is very good.'  indices: v=8 ... the range 8..13 is 'very '
const doc2 = () => makeDoc(['Title', 'This is very good.'])

describe('anchors', () => {
  it('round-trips a range', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    expect(resolveRange(doc, r)).toMatchObject({ blockIndex: 1, from: 8, to: 13 })
  })

  it('shifts when text is inserted before the range', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    textType(doc, 1).insert(0, 'Oh, ')
    expect(resolveRange(doc, r)).toMatchObject({ from: 12, to: 17 })
  })

  it('keeps typing at either boundary outside the range', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    textType(doc, 1).insert(13, 'YY')
    textType(doc, 1).insert(8, 'XX')
    const res = resolveRange(doc, r)!
    expect(plainText(res.text).slice(res.from, res.to)).toBe('very ')
  })

  it('grows when text is inserted inside the range', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    textType(doc, 1).insert(10, 'ZZ')
    expect(resolveRange(doc, r)).toMatchObject({ from: 8, to: 15 })
  })

  it('collapses when the range text is deleted', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    textType(doc, 1).delete(8, 5)
    expect(resolveRange(doc, r)).toMatchObject({ from: 8, to: 8 })
  })

  it('returns null when the block is deleted', () => {
    const doc = doc2()
    const r = makeRange(doc, 1, 8, 13)
    getText(doc).delete(1, 1)
    expect(resolveRange(doc, r)).toBeNull()
  })

  it('resolves on another peer', () => {
    const doc = doc2()
    const peer = fork(doc)
    const r = makeRange(doc, 1, 8, 13)
    expect(resolveRange(peer, r)).toMatchObject({ blockIndex: 1, from: 8, to: 13 })
  })

  it('rejects ranges outside the block or in empty blocks', () => {
    const doc = makeDoc(['abc', ''])
    expect(() => makeRange(doc, 0, 2, 9)).toThrow(RangeError)
    expect(() => makeRange(doc, 5, 0, 0)).toThrow(RangeError)
    expect(() => makeRange(doc, 1, 0, 0)).toThrow(RangeError)
  })

  it('ignores formatting when reading text', () => {
    const doc = doc2()
    textType(doc, 1).format(8, 4, { strong: true })
    expect(blockText(doc, 1)).toBe('This is very good.')
  })
})
