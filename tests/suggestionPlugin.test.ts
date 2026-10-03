// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { EditorState } from 'prosemirror-state'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from '../src/editor/schema'
import { getSuggestions, getText } from '../src/core/schema'
import { buildDecorations } from '../src/editor/suggestionPlugin'
import { pmPosOf } from '../src/editor/positions'
import { suggestionFor, textType } from './helpers'

function setup() {
  const ydoc = new Y.Doc()
  prosemirrorJSONToYXmlFragment(schema, {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'This is very good.' }] },
    ],
  }, getText(ydoc))
  const state = () => EditorState.create({ schema, doc: yXmlFragmentToProseMirrorRootNode(getText(ydoc), schema) })
  const handlers = { onAccept: vi.fn(), onReject: vi.fn() }
  return { ydoc, state, handlers }
}

describe('buildDecorations', () => {
  it('strikes the original and adds an insert widget at the end', () => {
    const { ydoc, state, handlers } = setup()
    const s = suggestionFor(ydoc, 1, 8, 13, 'quite ', { id: 'a' })
    getSuggestions(ydoc).set('a', s)
    const st = state()
    const decos = buildDecorations(st, ydoc, null, null, handlers).find()
    const inline = decos.find((d) => d.from !== d.to)!
    expect(inline.from).toBe(pmPosOf(ydoc, 1, 8))
    expect(st.doc.textBetween(inline.from, inline.to)).toBe('very ')
    const widget = decos.find((d) => d.from === d.to)!
    expect(widget.from).toBe(pmPosOf(ydoc, 1, 13))
    const el = (widget as unknown as { type: { toDOM: () => HTMLElement } }).type.toDOM()
    expect(el.querySelector('.sg-ins__text')?.textContent).toBe('quite ')
    el.querySelector<HTMLButtonElement>('button[aria-label="Accept suggestion"]')!.click()
    expect(handlers.onAccept).toHaveBeenCalledWith('a')
  })

  it('disables inline accept for conflicts', () => {
    const { ydoc, state, handlers } = setup()
    getSuggestions(ydoc).set('c', suggestionFor(ydoc, 1, 8, 13, '', { id: 'c' }))
    textType(ydoc, 1).insert(10, 'x')
    const widget = buildDecorations(state(), ydoc, null, null, handlers).find().find((d) => d.from === d.to)!
    const el = (widget as unknown as { type: { toDOM: () => HTMLElement } }).type.toDOM()
    expect(el.className).toContain('sg--conflict')
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="Accept suggestion"]')!.disabled).toBe(true)
  })

  it('orphans are skipped without throwing', () => {
    const { ydoc, state, handlers } = setup()
    getSuggestions(ydoc).set('o', suggestionFor(ydoc, 1, 8, 13, '', { id: 'o' }))
    getText(ydoc).delete(1, 1)
    expect(buildDecorations(state(), ydoc, null, null, handlers).find()).toHaveLength(0)
  })

  it('streaming drafts show text but no actions', () => {
    const { ydoc, state, handlers } = setup()
    getSuggestions(ydoc).set('s', suggestionFor(ydoc, 1, 0, 18, 'This is', { id: 's', status: 'streaming' }))
    const widget = buildDecorations(state(), ydoc, null, null, handlers).find().find((d) => d.from === d.to)!
    const el = (widget as unknown as { type: { toDOM: () => HTMLElement } }).type.toDOM()
    expect(el.querySelector('.sg-actions')).toBeNull()
  })
})
