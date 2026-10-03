import type { Awareness } from 'y-protocols/awareness'
import type { AiActivity, AiPresence } from '../ai/aiPeer'

export interface HumanPresence {
  kind: 'human'
  name: string
  color: string
}

const NAMES = ['Ada', 'Grace', 'Radia', 'Edsger', 'Frances', 'Barbara', 'Donald', 'Margaret']
// Presence colors are data colors for human carets, not UI accents.
const COLORS = ['#b4532a', '#2f7d5b', '#8a5cb8', '#b0306a', '#3b7c8c', '#7a6a2e']

export function humanPresence(clientId: number): HumanPresence {
  return { kind: 'human', name: NAMES[clientId % NAMES.length], color: COLORS[clientId % COLORS.length] }
}

export interface PeerEntry {
  clientId: number
  isLocal: boolean
  kind: 'human' | 'ai'
  name: string
  color: string
  activity?: AiActivity
}

export function peersFrom(awareness: Awareness, localId: number): PeerEntry[] {
  const out: PeerEntry[] = []
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as HumanPresence | AiPresence | undefined
    if (!user) return
    out.push({
      clientId,
      isLocal: clientId === localId,
      kind: user.kind,
      name: user.name,
      color: user.color,
      activity: user.kind === 'ai' ? user.activity : undefined,
    })
  })
  const rank = (p: PeerEntry) => (p.isLocal ? 0 : p.kind === 'human' ? 1 : 2)
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.clientId - b.clientId)
}
