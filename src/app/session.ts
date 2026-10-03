import * as Y from 'yjs'
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { WebsocketProvider } from 'y-websocket'
import type { IndexeddbPersistence } from 'y-indexeddb'
import { getResolved, type Resolution } from '../core/schema'
import { connectAiPeer, type AiConnection, type GateStats } from '../core/gate'
import { acceptSuggestion, listSuggestionViews, rejectSuggestion, type ResolveResult, type SuggestionView } from '../core/suggestions'
import { AiPeer, type ProposeResult, type ProposeTarget } from '../ai/aiPeer'
import type { TextModel } from '../ai/model'
import { BroadcastChannelProvider } from '../sync/broadcast'
import { attachPersistence } from '../sync/persistence'
import { applySeed } from './seed'
import { humanPresence, peersFrom, type PeerEntry } from './presence'

export const AI_PRESENCE_ORIGIN = 'co-author:ai-presence'

export interface Snapshot {
  views: SuggestionView[]
  resolved: Array<Resolution & { id: string }>
  peers: PeerEntry[]
  gate: GateStats
  sync: { connected: boolean; tabs: number }
  saved: boolean
}

export interface SessionOptions {
  docName: string
  model: TextModel
  persist?: boolean
  relayUrl?: string | null
}

interface AwarenessChanges {
  added: number[]
  updated: number[]
  removed: number[]
}

export class Session {
  readonly doc = new Y.Doc()
  readonly awareness = new Awareness(this.doc)
  ai!: AiPeer
  private provider!: BroadcastChannelProvider
  private persistence: IndexeddbPersistence | null = null
  private relay: WebsocketProvider | null = null
  private conn!: AiConnection
  private stopAiPresence: () => void = () => {}
  private model: TextModel
  private gateBase = { passed: 0, blocked: 0 }
  private gateNow: GateStats = { passed: 0, blocked: 0, lastCheckMs: 0, quarantined: false, lastReason: null }
  private readonly listeners = new Set<() => void>()
  private readonly blockedListeners = new Set<(reason: string) => void>()
  private snapshot: Snapshot | null = null
  private destroyed = false

  private constructor(readonly docName: string, model: TextModel) {
    this.model = model
  }

  static async create(opts: SessionOptions): Promise<Session> {
    const s = new Session(opts.docName, opts.model)
    s.awareness.setLocalStateField('user', humanPresence(s.doc.clientID))
    applySeed(s.doc)
    if (opts.persist !== false) s.persistence = await attachPersistence(s.doc, opts.docName)
    s.provider = new BroadcastChannelProvider(s.doc, s.awareness, opts.docName)
    if (opts.relayUrl) s.relay = new WebsocketProvider(opts.relayUrl, `co-author-${opts.docName}`, s.doc, { awareness: s.awareness })
    s.startAi()
    s.doc.on('update', s.bump)
    s.awareness.on('change', s.bump)
    s.provider.onStatus(s.bump)
    return s
  }

  private startAi() {
    const ai = new AiPeer({ model: this.model })
    this.ai = ai
    this.gateNow = { passed: 0, blocked: 0, lastCheckMs: this.gateNow.lastCheckMs, quarantined: false, lastReason: this.gateNow.lastReason }
    this.conn = connectAiPeer(this.doc, ai.doc, {
      onStats: (st) => {
        this.gateNow = st
        this.bump()
      },
      onBlocked: (reason) => {
        this.blockedListeners.forEach((l) => l(reason))
        queueMicrotask(() => this.restartAi())
      },
    })
    const forward = ({ added, updated, removed }: AwarenessChanges) => {
      applyAwarenessUpdate(this.awareness, encodeAwarenessUpdate(ai.awareness, added.concat(updated, removed)), AI_PRESENCE_ORIGIN)
    }
    ai.awareness.on('update', forward)
    forward({ added: [ai.doc.clientID], updated: [], removed: [] })
    this.stopAiPresence = () => {
      ai.awareness.off('update', forward)
      removeAwarenessStates(this.awareness, [ai.doc.clientID], AI_PRESENCE_ORIGIN)
    }
  }

  restartAi() {
    if (this.destroyed) return
    this.gateBase.passed += this.gateNow.passed
    this.gateBase.blocked += this.gateNow.blocked
    this.conn.disconnect()
    this.stopAiPresence()
    this.ai.destroy()
    this.startAi()
    this.bump()
  }

  propose(target: ProposeTarget, signal?: AbortSignal): Promise<ProposeResult> {
    return this.ai.propose(target, signal)
  }

  accept(id: string): ResolveResult {
    return acceptSuggestion(this.doc, id)
  }

  reject(id: string): ResolveResult {
    return rejectSuggestion(this.doc, id)
  }

  setModel(model: TextModel) {
    this.model = model
    this.ai.setModel(model)
    this.bump()
  }

  setOffline(offline: boolean) {
    if (offline) {
      this.provider.disconnect()
      this.relay?.disconnect()
    } else {
      this.provider.connect()
      this.relay?.connect()
    }
    this.bump()
  }

  simulateRogueWrite() {
    this.ai.attemptDirectWrite()
  }

  onBlocked(cb: (reason: string) => void): () => void {
    this.blockedListeners.add(cb)
    return () => this.blockedListeners.delete(cb)
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): Snapshot => {
    this.snapshot ??= this.computeSnapshot()
    return this.snapshot
  }

  private bump = () => {
    this.snapshot = null
    this.listeners.forEach((l) => l())
  }

  private computeSnapshot(): Snapshot {
    const resolved: Array<Resolution & { id: string }> = []
    getResolved(this.doc).forEach((r, id) => resolved.push({ ...r, id }))
    resolved.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    return {
      views: listSuggestionViews(this.doc),
      resolved,
      peers: peersFrom(this.awareness, this.doc.clientID),
      gate: {
        ...this.gateNow,
        passed: this.gateBase.passed + this.gateNow.passed,
        blocked: this.gateBase.blocked + this.gateNow.blocked,
      },
      sync: { connected: this.provider.connected, tabs: this.provider.peers.size + 1 },
      saved: this.persistence !== null,
    }
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.conn.disconnect()
    this.stopAiPresence()
    this.ai.destroy()
    this.provider.destroy()
    this.relay?.destroy()
    void this.persistence?.destroy()
    this.awareness.destroy()
    this.doc.destroy()
    this.listeners.clear()
    this.blockedListeners.clear()
  }
}
