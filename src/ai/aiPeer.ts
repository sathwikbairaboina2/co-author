import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { getResolved, getSuggestions, getText, LIMITS, type AiAuthor, type RelPosJSON, type Suggestion } from '../core/schema'
import { blockText, makeRange, plainText, resolveRange } from '../core/anchors'
import { diffWords } from './diff'
import { cleanModelOutput, type TextModel } from './model'

export interface ProposeTarget {
  blockIndex: number
  from: number
  to: number
  instruction: string
}

export type ProposeResult =
  | { kind: 'hunks'; groupId: string; ids: string[] }
  | { kind: 'draft'; groupId: string }
  | { kind: 'noop'; reason: string }
  | { kind: 'aborted' }

export type AiActivity = 'idle' | 'thinking' | 'streaming'

export interface AiPresence {
  kind: 'ai'
  name: string
  color: string
  activity: AiActivity
  caret: RelPosJSON | null
}

export const AI_NAME = 'Co-author'
export const AI_COLOR = '#2b54e0'

export interface AiPeerOptions {
  model: TextModel
  now?: () => number
  flushMs?: number
  name?: string
}

export class AiPeer {
  readonly doc = new Y.Doc()
  readonly awareness: Awareness
  private model: TextModel
  private readonly now: () => number
  private readonly flushMs: number
  private readonly author: AiAuthor
  private seq = 0

  constructor(opts: AiPeerOptions) {
    this.model = opts.model
    this.now = opts.now ?? Date.now
    this.flushMs = opts.flushMs ?? 60
    this.author = { kind: 'ai', clientId: this.doc.clientID, name: opts.name ?? AI_NAME }
    this.awareness = new Awareness(this.doc)
    this.setPresence('idle', null)
  }

  setModel(model: TextModel) {
    this.model = model
  }

  private setPresence(activity: AiActivity, caret: RelPosJSON | null) {
    const user: AiPresence = { kind: 'ai', name: this.author.name, color: AI_COLOR, activity, caret }
    this.awareness.setLocalStateField('user', user)
  }

  async propose(target: ProposeTarget, signal?: AbortSignal): Promise<ProposeResult> {
    const original = blockText(this.doc, target.blockIndex).slice(target.from, target.to)
    if (original.trim().length === 0) return { kind: 'noop', reason: 'Nothing to edit in that range.' }
    if (original.length > LIMITS.maxText) return { kind: 'noop', reason: `Select at most ${LIMITS.maxText} characters.` }

    const range = makeRange(this.doc, target.blockIndex, target.from, target.to)
    const id = `ai-${this.doc.clientID}-${++this.seq}`
    const instruction = target.instruction.slice(0, LIMITS.maxInstruction)
    const draft: Suggestion = {
      id, groupId: id, author: this.author, ...range,
      original, insert: '', instruction, status: 'streaming', createdAt: this.now(),
    }
    const map = getSuggestions(this.doc)
    const resolved = getResolved(this.doc)
    const dismissed = () => resolved.has(id)
    map.set(id, draft)
    this.setPresence('thinking', range.to)

    let acc = ''
    let lastFlush = -Infinity
    try {
      for await (const chunk of this.model.stream({ text: original, instruction, signal })) {
        if (dismissed()) break
        acc += chunk
        if (this.now() - lastFlush >= this.flushMs) {
          map.set(id, { ...draft, insert: acc.slice(0, LIMITS.maxText) })
          lastFlush = this.now()
          this.setPresence('streaming', range.to)
        }
      }
    } catch (err) {
      if (!dismissed()) map.delete(id)
      this.setPresence('idle', null)
      if ((err as Error).name === 'AbortError') return { kind: 'aborted' }
      throw err
    }
    this.setPresence('idle', null)
    if (dismissed()) return { kind: 'noop', reason: 'The draft was dismissed.' }

    const lead = /^\s*/.exec(original)![0]
    const trail = /\s*$/.exec(original)![0]
    const cleaned = cleanModelOutput(acc)
    const final = (cleaned.length ? lead + cleaned + trail : '').slice(0, LIMITS.maxText)
    if (final === original || final.length === 0) {
      map.delete(id)
      return { kind: 'noop', reason: 'No changes suggested.' }
    }

    const live = resolveRange(this.doc, range)
    const unchanged = live !== null && plainText(live.text).slice(live.from, live.to) === original
    if (!live || !unchanged) {
      map.set(id, { ...draft, insert: final, status: 'ready' })
      return { kind: 'draft', groupId: id }
    }

    const ids: string[] = []
    this.doc.transact(() => {
      map.delete(id)
      diffWords(original, final).forEach((h, k) => {
        const hid = `${id}.${k + 1}`
        map.set(hid, {
          id: hid, groupId: id, author: this.author,
          ...makeRange(this.doc, live.blockIndex, live.from + h.from, live.from + h.to),
          original: original.slice(h.from, h.to), insert: h.insert, instruction,
          status: 'ready', createdAt: this.now(),
        })
        ids.push(hid)
      })
    })
    return { kind: 'hunks', groupId: id, ids }
  }

  /** Demo only: tries to edit the text directly. The gate must block it. */
  attemptDirectWrite(text = 'The AI wrote this directly. ') {
    const el = getText(this.doc).get(0)
    const t = el instanceof Y.XmlElement ? el.firstChild : null
    if (t instanceof Y.XmlText) t.insert(0, text)
  }

  destroy() {
    this.awareness.destroy()
    this.doc.destroy()
  }
}
