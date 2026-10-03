import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getResolved, getSuggestions, getText, ORIGIN } from '../src/core/schema'
import { acceptSuggestion, listSuggestionViews, rejectSuggestion, viewSuggestion } from '../src/core/suggestions'
import { addSuggestion, blocksOf, fork, makeDoc, suggestionFor, syncAll, textType } from './helpers'

const base = () => makeDoc(['Title', 'This is very good.'])

describe('suggestion state', () => {
  it('is ready when untouched', () => {
    const doc = base()
    const s = addSuggestion(doc, suggestionFor(doc, 1, 8, 13, ''))
    expect(viewSuggestion(doc, s).state).toBe('ready')
  })
  it('is conflict when a human edits inside the range', () => {
    const doc = base()
    const s = addSuggestion(doc, suggestionFor(doc, 1, 8, 13, ''))
    textType(doc, 1).insert(10, 'x')
    expect(viewSuggestion(doc, s).state).toBe('conflict')
  })
  it('is orphan when the block is deleted', () => {
    const doc = base()
    const s = addSuggestion(doc, suggestionFor(doc, 1, 8, 13, ''))
    getText(doc).delete(1, 1)
    expect(viewSuggestion(doc, s).state).toBe('orphan')
  })
  it('is streaming while the AI writes', () => {
    const doc = base()
    const s = addSuggestion(doc, suggestionFor(doc, 1, 8, 13, 'tr', { status: 'streaming' }))
    expect(viewSuggestion(doc, s).state).toBe('streaming')
  })
})

describe('accept and reject', () => {
  it('accept replaces the range and records the verdict', () => {
    const doc = base()
    addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'a' }))
    expect(acceptSuggestion(doc, 'a', { now: () => 5 })).toEqual({ ok: true })
    expect(blocksOf(doc)[1]).toBe('This is good.')
    expect(getSuggestions(doc).has('a')).toBe(false)
    expect(getResolved(doc).get('a')).toMatchObject({ verdict: 'accepted', at: 5, original: 'very ' })
  })
  it('accept inserts replacement text', () => {
    const doc = makeDoc(['We utilize it.'])
    addSuggestion(doc, suggestionFor(doc, 0, 3, 10, 'use', { id: 'u' }))
    acceptSuggestion(doc, 'u')
    expect(blocksOf(doc)[0]).toBe('We use it.')
  })
  it('accept keeps the formatting of the replaced text', () => {
    const doc = base()
    textType(doc, 1).format(8, 4, { strong: true })
    addSuggestion(doc, suggestionFor(doc, 1, 8, 12, 'truly', { id: 'b' }))
    acceptSuggestion(doc, 'b')
    const delta = textType(doc, 1).toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>
    expect(delta.find((op) => op.insert === 'truly')?.attributes).toEqual({ strong: true })
  })
  it('refuses to accept a conflict, an orphan or a streaming draft', () => {
    const doc = base()
    addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'c' }))
    addSuggestion(doc, suggestionFor(doc, 1, 0, 4, 'It', { id: 'st', status: 'streaming' }))
    textType(doc, 1).insert(10, 'x')
    expect(acceptSuggestion(doc, 'c')).toMatchObject({ ok: false })
    expect(acceptSuggestion(doc, 'st')).toMatchObject({ ok: false })
    expect(blocksOf(doc)[1]).toBe('This is vexry good.')
  })
  it('reject leaves the text and records the verdict', () => {
    const doc = base()
    addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'r' }))
    expect(rejectSuggestion(doc, 'r')).toEqual({ ok: true })
    expect(blocksOf(doc)[1]).toBe('This is very good.')
    expect(getResolved(doc).get('r')?.verdict).toBe('rejected')
  })
  it('resolved ids stay hidden and unacceptable even if rewritten later', () => {
    const doc = base()
    const s = addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'z' }))
    rejectSuggestion(doc, 'z')
    getSuggestions(doc).set('z', s)
    expect(listSuggestionViews(doc)).toHaveLength(0)
    expect(acceptSuggestion(doc, 'z')).toMatchObject({ ok: false })
  })
  it('accept is one transaction and undoable with the accept origin tracked', () => {
    const doc = base()
    addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'u' }))
    const um = new Y.UndoManager(getText(doc), { trackedOrigins: new Set([ORIGIN.accept]) })
    let txs = 0
    doc.on('afterTransaction', (tr: Y.Transaction) => { if (tr.origin === ORIGIN.accept) txs++ })
    acceptSuggestion(doc, 'u')
    expect(txs).toBe(1)
    um.undo()
    expect(blocksOf(doc)[1]).toBe('This is very good.')
  })
  it('survives a concurrent edit before the range on another peer', () => {
    const a = base()
    const b = fork(a)
    addSuggestion(a, suggestionFor(a, 1, 8, 13, '', { id: 'p' }))
    textType(b, 1).insert(0, 'Honestly, ')
    syncAll([a, b])
    expect(acceptSuggestion(b, 'p')).toEqual({ ok: true })
    syncAll([a, b])
    expect(blocksOf(a)[1]).toBe('Honestly, This is good.')
    expect(blocksOf(b)).toEqual(blocksOf(a))
  })
  it('lists views sorted by position', () => {
    const doc = base()
    addSuggestion(doc, suggestionFor(doc, 1, 8, 13, '', { id: 'late' }))
    addSuggestion(doc, suggestionFor(doc, 0, 0, 5, 'Heading', { id: 'early' }))
    expect(listSuggestionViews(doc).map((v) => v.suggestion.id)).toEqual(['early', 'late'])
  })
})
