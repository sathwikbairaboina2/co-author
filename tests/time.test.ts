import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/ui/time'

describe('relativeTime', () => {
  it('formats recent times compactly', () => {
    expect(relativeTime(1000, 4000)).toBe('just now')
    expect(relativeTime(0, 42_000)).toBe('42s ago')
    expect(relativeTime(0, 3 * 60_000)).toBe('3m ago')
    expect(relativeTime(0, 2 * 3_600_000)).toBe('2h ago')
    expect(relativeTime(0, 3 * 86_400_000)).toBe('3d ago')
  })
})
