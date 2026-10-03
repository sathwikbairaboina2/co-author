import * as Y from 'yjs'
import { getText, type RelPosJSON } from './schema'

export interface AnchoredRange {
  from: RelPosJSON
  to: RelPosJSON
}

export interface ResolvedRange {
  text: Y.XmlText
  blockIndex: number
  from: number
  to: number
}

export function blockAt(doc: Y.Doc, blockIndex: number): Y.XmlElement | null {
  const frag = getText(doc)
  if (blockIndex < 0 || blockIndex >= frag.length) return null
  const el = frag.get(blockIndex)
  return el instanceof Y.XmlElement ? el : null
}

export function textTypeOf(el: Y.XmlElement): Y.XmlText | null {
  const first = el.firstChild
  return first instanceof Y.XmlText ? first : null
}

export function plainText(text: Y.XmlText): string {
  return (text.toDelta() as Array<{ insert?: unknown }>)
    .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
    .join('')
}

export function blockText(doc: Y.Doc, blockIndex: number): string {
  const el = blockAt(doc, blockIndex)
  const t = el && textTypeOf(el)
  return t ? plainText(t) : ''
}

export function blockCount(doc: Y.Doc): number {
  return getText(doc).length
}

/** from sticks to the first char of the range (assoc 0), to sticks to the last (assoc -1). */
export function makeRange(doc: Y.Doc, blockIndex: number, from: number, to: number): AnchoredRange {
  const el = blockAt(doc, blockIndex)
  if (!el) throw new RangeError(`No block at index ${blockIndex}`)
  const text = textTypeOf(el)
  if (!text) throw new RangeError(`Block ${blockIndex} is empty`)
  if (from < 0 || to < from || to > text.length) {
    throw new RangeError(`Range ${from}..${to} is outside block ${blockIndex} (length ${text.length})`)
  }
  const collapsed = from === to
  return {
    from: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, from, 0)) as RelPosJSON,
    to: Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, to, collapsed ? 0 : -1)) as RelPosJSON,
  }
}

export function resolveRange(doc: Y.Doc, range: AnchoredRange): ResolvedRange | null {
  const a = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(range.from), doc)
  const b = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(range.to), doc)
  if (!a || !b || a.type !== b.type || !(a.type instanceof Y.XmlText)) return null
  const text = a.type
  if (text._item?.deleted) return null
  const el = text.parent
  if (!(el instanceof Y.XmlElement)) return null
  const blockIndex = getText(doc).toArray().indexOf(el)
  if (blockIndex === -1 || a.index > b.index) return null
  return { text, blockIndex, from: a.index, to: b.index }
}
