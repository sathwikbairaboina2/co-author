import * as Y from 'yjs'
import { getSuggestions, getText, type AiAuthor, type Suggestion, type SuggestionStatus } from '../src/core/schema'
import { blockText, blockCount, blockAt, makeRange, textTypeOf } from '../src/core/anchors'

/** A doc with one paragraph per string, shaped exactly like y-prosemirror output. */
export function makeDoc(blocks: string[], clientID?: number): Y.Doc {
  const doc = new Y.Doc()
  if (clientID !== undefined) doc.clientID = clientID
  const frag = getText(doc)
  doc.transact(() => {
    blocks.forEach((text, i) => {
      const el = new Y.XmlElement('paragraph')
      frag.insert(i, [el])
      if (text.length > 0) {
        const t = new Y.XmlText()
        el.insert(0, [t])
        t.insert(0, text)
      }
    })
  })
  return doc
}

export function fork(base: Y.Doc, clientID?: number): Y.Doc {
  const doc = new Y.Doc()
  if (clientID !== undefined) doc.clientID = clientID
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(base))
  return doc
}

/** Full-mesh exchange of missing updates. */
export function syncAll(docs: Y.Doc[]): void {
  for (const a of docs) for (const b of docs) {
    if (a !== b) Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const aiAuthor = (clientId: number): AiAuthor => ({ kind: 'ai', clientId, name: 'Co-author' })

export async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

export function blocksOf(doc: Y.Doc): string[] {
  return Array.from({ length: blockCount(doc) }, (_, i) => blockText(doc, i))
}

export function textType(doc: Y.Doc, blockIndex: number): Y.XmlText {
  const el = blockAt(doc, blockIndex)
  const t = el && textTypeOf(el)
  if (!t) throw new Error(`block ${blockIndex} has no text`)
  return t
}

export function suggestionFor(
  doc: Y.Doc,
  blockIndex: number,
  from: number,
  to: number,
  insert: string,
  opts: { id?: string; clientId?: number; status?: SuggestionStatus; instruction?: string } = {},
): Suggestion {
  const id = opts.id ?? `s-${blockIndex}-${from}-${to}`
  return {
    id,
    groupId: id,
    author: aiAuthor(opts.clientId ?? 4242),
    ...makeRange(doc, blockIndex, from, to),
    original: blockText(doc, blockIndex).slice(from, to),
    insert,
    instruction: opts.instruction ?? 'tighten',
    status: opts.status ?? 'ready',
    createdAt: 1,
  }
}

export function addSuggestion(doc: Y.Doc, s: Suggestion): Suggestion {
  getSuggestions(doc).set(s.id, s)
  return s
}
