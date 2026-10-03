import { describe, expect, it } from 'vitest'
import { humanPresence } from '../src/app/presence'

describe('humanPresence', () => {
  it('picks a name no other peer is using', () => {
    const first = humanPresence(6)
    const second = humanPresence(14, [first.name])
    expect(second.name).not.toBe(first.name)
  })

  it('adds a short suffix once every name is taken', () => {
    const all = Array.from({ length: 8 }, (_, i) => humanPresence(i).name)
    const p = humanPresence(0x3f, all)
    expect(all).not.toContain(p.name)
    expect(p.name).toMatch(/ [0-9a-f]{2}$/)
  })
})
