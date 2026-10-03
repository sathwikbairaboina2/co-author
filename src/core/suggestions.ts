import type * as Y from 'yjs'
import { getResolved, getSuggestions, ORIGIN, type Suggestion } from './schema'
import { plainText, resolveRange, type ResolvedRange } from './anchors'

export type SuggestionState = 'streaming' | 'ready' | 'conflict' | 'orphan'

export interface SuggestionView {
  suggestion: Suggestion
  state: SuggestionState
  range: ResolvedRange | null
  current: string
}

export type ResolveResult = { ok: true } | { ok: false; reason: string }

interface ResolveOptions {
  now?: () => number
}

export function viewSuggestion(doc: Y.Doc, s: Suggestion): SuggestionView {
  const range = resolveRange(doc, s)
  if (!range) return { suggestion: s, state: 'orphan', range: null, current: '' }
  const current = plainText(range.text).slice(range.from, range.to)
  if (s.status === 'streaming') return { suggestion: s, state: 'streaming', range, current }
  return { suggestion: s, state: current === s.original ? 'ready' : 'conflict', range, current }
}

export function listSuggestionViews(doc: Y.Doc): SuggestionView[] {
  const resolved = getResolved(doc)
  const views: SuggestionView[] = []
  getSuggestions(doc).forEach((s, key) => {
    if (!resolved.has(key)) views.push(viewSuggestion(doc, s))
  })
  const blockOf = (v: SuggestionView) => v.range?.blockIndex ?? Number.MAX_SAFE_INTEGER
  return views.sort(
    (a, b) =>
      blockOf(a) - blockOf(b) ||
      (a.range?.from ?? 0) - (b.range?.from ?? 0) ||
      a.suggestion.id.localeCompare(b.suggestion.id),
  )
}

function attributesAt(text: Y.XmlText, index: number): Record<string, unknown> | undefined {
  let pos = 0
  for (const op of text.toDelta() as Array<{ insert?: unknown; attributes?: Record<string, unknown> }>) {
    const len = typeof op.insert === 'string' ? op.insert.length : 1
    if (index < pos + len) return op.attributes
    pos += len
  }
  return undefined
}

export function acceptSuggestion(doc: Y.Doc, id: string, opts: ResolveOptions = {}): ResolveResult {
  const now = opts.now ?? Date.now
  let result: ResolveResult = { ok: false, reason: `No open suggestion ${id}` }
  doc.transact(() => {
    const s = getSuggestions(doc).get(id)
    if (!s || getResolved(doc).has(id)) return
    const view = viewSuggestion(doc, s)
    if (view.state !== 'ready' || !view.range) {
      result = { ok: false, reason: `Suggestion ${id} is ${view.state}` }
      return
    }
    const { text, from, to } = view.range
    const replacing = to > from
    const attrs = replacing ? (attributesAt(text, from) ?? {}) : undefined
    if (replacing) text.delete(from, to - from)
    if (s.insert.length > 0) text.insert(from, s.insert, attrs)
    getResolved(doc).set(id, { verdict: 'accepted', at: now(), by: doc.clientID, original: s.original, insert: s.insert })
    getSuggestions(doc).delete(id)
    result = { ok: true }
  }, ORIGIN.accept)
  return result
}

export function rejectSuggestion(doc: Y.Doc, id: string, opts: ResolveOptions = {}): ResolveResult {
  const now = opts.now ?? Date.now
  let result: ResolveResult = { ok: false, reason: `No open suggestion ${id}` }
  doc.transact(() => {
    const s = getSuggestions(doc).get(id)
    if (!s || getResolved(doc).has(id)) return
    getResolved(doc).set(id, { verdict: 'rejected', at: now(), by: doc.clientID, original: s.original, insert: s.insert })
    getSuggestions(doc).delete(id)
    result = { ok: true }
  }, ORIGIN.reject)
  return result
}
