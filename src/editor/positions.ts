import * as Y from 'yjs'
import { getText } from '../core/schema'
import { textTypeOf } from '../core/anchors'

/** Valid for the flat schema only (ADR 0001): each block is one XmlElement holding at most one XmlText. */
export function blockLength(el: Y.XmlElement): number {
  const t = textTypeOf(el)
  return t ? t.length : 0
}

export function yDocSize(doc: Y.Doc): number {
  return getText(doc).toArray().reduce((n, el) => n + (el instanceof Y.XmlElement ? blockLength(el) : 0) + 2, 0)
}

export function pmPosOf(doc: Y.Doc, blockIndex: number, offset: number): number {
  const blocks = getText(doc).toArray()
  let pos = 0
  for (let i = 0; i < blockIndex; i++) {
    const el = blocks[i]
    pos += (el instanceof Y.XmlElement ? blockLength(el) : 0) + 2
  }
  return pos + 1 + offset
}
