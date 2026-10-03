import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

describe('toolchain', () => {
  it('runs yjs in node', () => {
    const doc = new Y.Doc()
    doc.getText('t').insert(0, 'hi')
    expect(doc.getText('t').toString()).toBe('hi')
  })
})
