import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { schema } from '../src/editor/schema'
import { scopeFromSelection } from '../src/editor/scope'

const doc = schema.node('doc', null, [
  schema.node('paragraph', null, [schema.text('first block')]),
  schema.node('paragraph', null, [schema.text('second block')]),
])

describe('scopeFromSelection', () => {
  it('uses the whole paragraph for a caret', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) })
    expect(scopeFromSelection(state)).toEqual({ blockIndex: 0, from: 0, to: 11, label: 'paragraph' })
  })
  it('uses the selection inside one block', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 15, 21) })
    expect(scopeFromSelection(state)).toEqual({ blockIndex: 1, from: 1, to: 7, label: 'selection' })
  })
  it('clamps a cross-block selection to the first block', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7, 18) })
    expect(scopeFromSelection(state)).toEqual({ blockIndex: 0, from: 6, to: 11, label: 'selection' })
  })
})
