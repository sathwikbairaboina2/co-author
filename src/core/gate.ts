import * as Y from 'yjs'
import { getSuggestions, ORIGIN, validateSuggestion, type Suggestion, type Validation } from './schema'

export interface GateStats {
  passed: number
  blocked: number
  lastCheckMs: number
  quarantined: boolean
  lastReason: string | null
}

export interface AiConnection {
  stats(): GateStats
  disconnect(): void
}

function describeType(doc: Y.Doc, type: Y.AbstractType<any>): string {
  for (const [name, root] of doc.share) if (root === type) return `root "${name}"`
  return 'a nested type in the document'
}

/**
 * Applies the AI update to a throwaway clone of the target and inspects what changed.
 * Only valid entries of the suggestions map, authored by this AI, may change.
 */
export function validateAiUpdate(target: Y.Doc, update: Uint8Array, aiClientId: number): Validation {
  const clone = new Y.Doc()
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(target))
  const suggestions = getSuggestions(clone)
  let failure: string | null = null
  const fail = (reason: string) => {
    failure ??= reason
  }
  clone.on('afterTransaction', (tr: Y.Transaction) => {
    tr.changed.forEach((keys, type) => {
      if (type !== (suggestions as Y.AbstractType<any>)) {
        fail(`AI update touched ${describeType(clone, type)}; only the suggestions layer is writable`)
        return
      }
      keys.forEach((key) => {
        if (key === null) return fail('AI update used list operations on the suggestions map')
        const value = suggestions.get(key) as Suggestion | undefined
        if (value === undefined) return // withdrawing a suggestion is allowed
        const v = validateSuggestion(key, value)
        if (!v.ok) return fail(v.reason)
        if (value.author.clientId !== aiClientId) {
          fail(`suggestion ${key} claims author ${value.author.clientId}, sender is ${aiClientId}`)
        }
      })
    })
  })
  try {
    Y.applyUpdate(clone, update, ORIGIN.fromAi)
  } catch (err) {
    clone.destroy()
    return { ok: false, reason: `malformed update: ${(err as Error).message}` }
  }
  const store = clone.store as unknown as { pendingStructs: unknown; pendingDs: unknown }
  if (store.pendingStructs !== null || store.pendingDs !== null) {
    fail('AI update depends on state the document does not have')
  }
  clone.destroy()
  return failure === null ? { ok: true } : { ok: false, reason: failure }
}

export function connectAiPeer(
  human: Y.Doc,
  ai: Y.Doc,
  opts: { onBlocked?: (reason: string) => void; onStats?: (s: GateStats) => void } = {},
): AiConnection {
  const stats: GateStats = { passed: 0, blocked: 0, lastCheckMs: 0, quarantined: false, lastReason: null }
  Y.applyUpdate(ai, Y.encodeStateAsUpdate(human), ORIGIN.toAi)

  const toAi = (update: Uint8Array, origin: unknown) => {
    if (origin !== ORIGIN.fromAi) Y.applyUpdate(ai, update, ORIGIN.toAi)
  }
  const fromAi = (update: Uint8Array, origin: unknown) => {
    if (origin === ORIGIN.toAi) return
    if (stats.quarantined) {
      stats.blocked++
      opts.onStats?.({ ...stats })
      return
    }
    const t0 = performance.now()
    const verdict = validateAiUpdate(human, update, ai.clientID)
    stats.lastCheckMs = performance.now() - t0
    if (verdict.ok) {
      stats.passed++
      Y.applyUpdate(human, update, ORIGIN.fromAi)
    } else {
      stats.blocked++
      stats.quarantined = true
      stats.lastReason = verdict.reason
      opts.onBlocked?.(verdict.reason)
    }
    opts.onStats?.({ ...stats })
  }

  human.on('update', toAi)
  ai.on('update', fromAi)
  return {
    stats: () => ({ ...stats }),
    disconnect: () => {
      human.off('update', toAi)
      ai.off('update', fromAi)
    },
  }
}
