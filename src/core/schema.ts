import type * as Y from 'yjs'

export const ROOT = {
  text: 'prosemirror',
  suggestions: 'suggestions',
  resolved: 'resolved',
} as const

export const ORIGIN = {
  accept: 'co-author:accept',
  reject: 'co-author:reject',
  fromAi: 'co-author:from-ai',
  toAi: 'co-author:to-ai',
  seed: 'co-author:seed',
} as const

export const LIMITS = { maxText: 4000, maxInstruction: 500, maxName: 40 } as const

export type RelPosJSON = Record<string, unknown>

export interface AiAuthor {
  kind: 'ai'
  clientId: number
  name: string
}

export type SuggestionStatus = 'streaming' | 'ready'

export interface Suggestion {
  id: string
  groupId: string
  author: AiAuthor
  from: RelPosJSON
  to: RelPosJSON
  original: string
  insert: string
  instruction: string
  status: SuggestionStatus
  createdAt: number
}

export type Verdict = 'accepted' | 'rejected'

export interface Resolution {
  verdict: Verdict
  at: number
  by: number
  original: string
  insert: string
}

export const getText = (doc: Y.Doc) => doc.getXmlFragment(ROOT.text)
export const getSuggestions = (doc: Y.Doc) => doc.getMap<Suggestion>(ROOT.suggestions)
export const getResolved = (doc: Y.Doc) => doc.getMap<Resolution>(ROOT.resolved)

export type Validation = { ok: true } | { ok: false; reason: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isRelPos = (v: unknown) => isRecord(v) && ('item' in v || 'type' in v || 'tname' in v)
const isBoundedString = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

export function validateSuggestion(key: string, value: unknown): Validation {
  if (!isRecord(value)) return { ok: false, reason: `suggestion ${key} is not an object` }
  if (value.id !== key) return { ok: false, reason: `suggestion id ${String(value.id)} does not match key ${key}` }
  if (typeof value.groupId !== 'string' || value.groupId.length === 0) return { ok: false, reason: 'groupId missing' }
  const a = value.author
  if (!isRecord(a) || a.kind !== 'ai' || !Number.isInteger(a.clientId) || !isBoundedString(a.name, LIMITS.maxName)) {
    return { ok: false, reason: 'author must be an ai author' }
  }
  if (!isRelPos(value.from) || !isRelPos(value.to)) return { ok: false, reason: 'anchors must be relative positions' }
  if (!isBoundedString(value.original, LIMITS.maxText) || !isBoundedString(value.insert, LIMITS.maxText)) {
    return { ok: false, reason: `original and insert must be strings up to ${LIMITS.maxText} chars` }
  }
  if (!isBoundedString(value.instruction, LIMITS.maxInstruction)) return { ok: false, reason: 'instruction too long' }
  if (value.status !== 'streaming' && value.status !== 'ready') return { ok: false, reason: 'bad status' }
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return { ok: false, reason: 'bad createdAt' }
  return { ok: true }
}
