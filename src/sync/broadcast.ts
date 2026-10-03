import * as Y from 'yjs'
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates, type Awareness } from 'y-protocols/awareness'

export const REMOTE_ORIGIN = 'co-author:broadcast'

type Message =
  | { t: 'hello'; from: number; sv: Uint8Array }
  | { t: 'sync'; from: number; to: number; update: Uint8Array; sv: Uint8Array }
  | { t: 'update'; from: number; update: Uint8Array }
  | { t: 'awareness'; from: number; update: Uint8Array }
  | { t: 'bye'; from: number }

export interface ProviderStatus {
  connected: boolean
  peers: number
}

interface AwarenessChanges {
  added: number[]
  updated: number[]
  removed: number[]
}

/** Cross-tab Yjs sync. All tabs on one channel see every message, so there is no relaying. */
export class BroadcastChannelProvider {
  readonly peers = new Set<number>()
  private channel: BroadcastChannel | null = null
  private readonly remoteClients = new Set<number>()
  /** Awareness client ids each remote tab has announced, so a bye or a timeout can clear them. */
  private readonly clientsByPeer = new Map<number, Set<number>>()
  private applyingFrom: number | null = null
  private readonly listeners = new Set<(s: ProviderStatus) => void>()

  constructor(readonly doc: Y.Doc, readonly awareness: Awareness, readonly name: string) {
    this.connect()
  }

  get connected() {
    return this.channel !== null
  }

  connect() {
    if (this.channel) return
    const ch = new BroadcastChannel(`co-author:${this.name}`)
    ch.onmessage = (e: MessageEvent<Message>) => this.receive(e.data)
    this.channel = ch
    this.doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    this.post({ t: 'hello', from: this.doc.clientID, sv: Y.encodeStateVector(this.doc) })
    this.postAwareness()
    this.emit()
  }

  disconnect() {
    if (!this.channel) return
    this.post({ t: 'bye', from: this.doc.clientID })
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
    this.channel.close()
    this.channel = null
    this.peers.clear()
    if (this.remoteClients.size > 0) removeAwarenessStates(this.awareness, [...this.remoteClients], REMOTE_ORIGIN)
    this.remoteClients.clear()
    this.clientsByPeer.clear()
    this.emit()
  }

  onStatus(cb: (s: ProviderStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  destroy() {
    this.disconnect()
    this.listeners.clear()
  }

  private post(msg: Message) {
    this.channel?.postMessage(msg)
  }

  private postAwareness() {
    const clients = [...this.awareness.getStates().keys()].filter((c) => !this.remoteClients.has(c))
    if (clients.length > 0) {
      this.post({ t: 'awareness', from: this.doc.clientID, update: encodeAwarenessUpdate(this.awareness, clients) })
    }
  }

  private emit() {
    const s: ProviderStatus = { connected: this.connected, peers: this.peers.size }
    this.listeners.forEach((l) => l(s))
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE_ORIGIN) this.post({ t: 'update', from: this.doc.clientID, update })
  }

  private onAwarenessUpdate = ({ added, updated, removed }: AwarenessChanges, origin: unknown) => {
    if (removed.length > 0) this.forgetClients(removed)
    if (origin === REMOTE_ORIGIN) {
      added.concat(updated).forEach((c) => {
        this.remoteClients.add(c)
        if (this.applyingFrom !== null) this.claim(this.applyingFrom, c)
      })
      removed.forEach((c) => this.remoteClients.delete(c))
      return
    }
    const changed = added.concat(updated, removed)
    this.post({ t: 'awareness', from: this.doc.clientID, update: encodeAwarenessUpdate(this.awareness, changed) })
  }

  private claim(peer: number, client: number) {
    let set = this.clientsByPeer.get(peer)
    if (!set) this.clientsByPeer.set(peer, (set = new Set()))
    set.add(client)
  }

  /** A peer whose awareness states are all gone (timeout or bye) no longer counts as a tab. */
  private forgetClients(clients: number[]) {
    let changed = false
    for (const [peer, set] of this.clientsByPeer) {
      clients.forEach((c) => set.delete(c))
      if (set.size === 0) {
        this.clientsByPeer.delete(peer)
        if (this.peers.delete(peer)) changed = true
      }
    }
    if (changed) this.emit()
  }

  private receive(msg: Message) {
    const me = this.doc.clientID
    if (msg.from === me) return
    switch (msg.t) {
      case 'hello':
        this.peers.add(msg.from)
        this.post({ t: 'sync', from: me, to: msg.from, update: Y.encodeStateAsUpdate(this.doc, msg.sv), sv: Y.encodeStateVector(this.doc) })
        this.postAwareness()
        break
      case 'sync': {
        this.peers.add(msg.from)
        if (msg.to !== me) break
        Y.applyUpdate(this.doc, msg.update, REMOTE_ORIGIN)
        const back = Y.encodeStateAsUpdate(this.doc, msg.sv)
        if (back.length > 2) this.post({ t: 'update', from: me, update: back })
        break
      }
      case 'update':
        this.peers.add(msg.from)
        Y.applyUpdate(this.doc, msg.update, REMOTE_ORIGIN)
        break
      case 'awareness':
        this.applyingFrom = msg.from
        try {
          applyAwarenessUpdate(this.awareness, msg.update, REMOTE_ORIGIN)
        } finally {
          this.applyingFrom = null
        }
        break
      case 'bye': {
        this.peers.delete(msg.from)
        const ids = this.clientsByPeer.get(msg.from)
        this.clientsByPeer.delete(msg.from)
        if (ids && ids.size > 0) removeAwarenessStates(this.awareness, [...ids], REMOTE_ORIGIN)
        break
      }
    }
    this.emit()
  }
}
