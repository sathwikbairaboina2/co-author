import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getResolved, getSuggestions, getText } from '../src/core/schema'
import { connectAiPeer, validateAiUpdate } from '../src/core/gate'
import { blocksOf, makeDoc, mulberry32, suggestionFor, textType } from './helpers'

const human = () => makeDoc(['Title', 'This is very good.'])

function connected() {
  const h = human()
  const ai = new Y.Doc()
  const reasons: string[] = []
  const conn = connectAiPeer(h, ai, { onBlocked: (r) => reasons.push(r) })
  return { h, ai, conn, reasons }
}

describe('gate', () => {
  it('lets a valid suggestion through to the human doc', () => {
    const { h, ai, conn } = connected()
    const s = suggestionFor(ai, 1, 8, 13, '', { id: 'ok', clientId: ai.clientID })
    getSuggestions(ai).set(s.id, s)
    expect(getSuggestions(h).get('ok')).toMatchObject({ insert: '' })
    expect(conn.stats()).toMatchObject({ passed: 1, blocked: 0, quarantined: false })
  })

  it('lets the AI overwrite and withdraw its own suggestion', () => {
    const { h, ai, conn } = connected()
    const s = suggestionFor(ai, 1, 8, 13, '', { id: 'w', clientId: ai.clientID })
    getSuggestions(ai).set('w', s)
    getSuggestions(ai).set('w', { ...s, insert: 'quite ' })
    expect(getSuggestions(h).get('w')?.insert).toBe('quite ')
    getSuggestions(ai).delete('w')
    expect(getSuggestions(h).has('w')).toBe(false)
    expect(conn.stats().blocked).toBe(0)
  })

  it.each([
    ['inserting text', (ai: Y.Doc) => textType(ai, 1).insert(0, 'EVIL ')],
    ['deleting text', (ai: Y.Doc) => textType(ai, 1).delete(0, 4)],
    ['formatting text', (ai: Y.Doc) => textType(ai, 1).format(0, 4, { strong: true })],
    ['deleting a block', (ai: Y.Doc) => getText(ai).delete(0, 1)],
    ['adding a block', (ai: Y.Doc) => getText(ai).insert(0, [new Y.XmlElement('paragraph')])],
    ['writing the resolved map', (ai: Y.Doc) => getResolved(ai).set('x', { verdict: 'accepted', at: 1, by: 1, original: '', insert: '' })],
    ['creating another root', (ai: Y.Doc) => ai.getMap('notes').set('a', 1)],
  ])('blocks %s and leaves the human text untouched', (_name, attack) => {
    const { h, ai, conn, reasons } = connected()
    const before = blocksOf(h)
    attack(ai)
    expect(blocksOf(h)).toEqual(before)
    expect(getResolved(h).size).toBe(0)
    expect(conn.stats()).toMatchObject({ blocked: 1, quarantined: true })
    expect(reasons).toHaveLength(1)
  })

  it('blocks malformed and spoofed suggestions', () => {
    for (const bad of [
      (ai: Y.Doc) => getSuggestions(ai).set('m', { id: 'm', insert: 42 } as never),
      (ai: Y.Doc) => getSuggestions(ai).set('sp', suggestionFor(ai, 1, 8, 13, '', { id: 'sp', clientId: 1 })),
    ]) {
      const { h, ai, conn } = connected()
      bad(ai)
      expect(getSuggestions(h).size).toBe(0)
      expect(conn.stats().blocked).toBe(1)
    }
  })

  it('quarantines the peer after a violation', () => {
    const { h, ai, conn } = connected()
    textType(ai, 1).insert(0, 'EVIL ')
    getSuggestions(ai).set('later', suggestionFor(ai, 1, 0, 4, 'It', { id: 'later', clientId: ai.clientID }))
    expect(getSuggestions(h).has('later')).toBe(false)
    expect(conn.stats().blocked).toBe(2)
  })

  it('rejects updates that depend on state the human doc lacks', () => {
    const h = human()
    const ai = new Y.Doc()
    Y.applyUpdate(ai, Y.encodeStateAsUpdate(h))
    const updates: Uint8Array[] = []
    ai.on('update', (u: Uint8Array) => updates.push(u))
    const s = suggestionFor(ai, 1, 8, 13, '', { id: 'd', clientId: ai.clientID })
    getSuggestions(ai).set('d', s)
    getSuggestions(ai).set('d', { ...s, insert: 'x' })
    const v = validateAiUpdate(h, updates[1], ai.clientID)
    expect(v.ok).toBe(false)
  })

  it('never mutates the target while validating', () => {
    const h = human()
    const sv = Y.encodeStateVector(h)
    const ai = new Y.Doc()
    Y.applyUpdate(ai, Y.encodeStateAsUpdate(h))
    let u: Uint8Array | null = null
    ai.on('update', (x: Uint8Array) => { u = x })
    textType(ai, 1).insert(0, 'EVIL ')
    validateAiUpdate(h, u!, ai.clientID)
    expect(Y.encodeStateVector(h)).toEqual(sv)
  })

  it('holds under 200 random AI operations (property)', () => {
    const h = human()
    const before = blocksOf(h)
    const rand = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      const ai = new Y.Doc()
      const conn = connectAiPeer(h, ai)
      const pick = Math.floor(rand() * 5)
      if (pick === 0) getSuggestions(ai).set(`p${i}`, suggestionFor(ai, 1, 0, 4, 'It', { id: `p${i}`, clientId: ai.clientID }))
      if (pick === 1) textType(ai, 1).insert(Math.floor(rand() * 10), 'x')
      if (pick === 2) textType(ai, 1).delete(0, 1)
      if (pick === 3) textType(ai, 0).format(0, 2, { em: true })
      if (pick === 4) ai.getArray('junk').push([i])
      conn.disconnect()
      expect(blocksOf(h)).toEqual(before)
    }
  })
})
