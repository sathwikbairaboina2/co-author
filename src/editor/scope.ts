import type { EditorState } from 'prosemirror-state'

export interface Scope {
  blockIndex: number
  from: number
  to: number
  label: 'selection' | 'paragraph'
}

export function scopeFromSelection(state: EditorState): Scope | null {
  const { $from, $to, empty } = state.selection
  if ($from.depth !== 1) return null
  const blockIndex = $from.index(0)
  const end = $from.parent.content.size
  if (empty) return { blockIndex, from: 0, to: end, label: 'paragraph' }
  const to = $from.sameParent($to) ? $to.parentOffset : end
  return { blockIndex, from: $from.parentOffset, to, label: 'selection' }
}
