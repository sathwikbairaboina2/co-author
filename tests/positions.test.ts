import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { schema } from '../src/editor/schema'
import { getText } from '../src/core/schema'
import { blockText } from '../src/core/anchors'
import { pmPosOf, yDocSize } from '../src/editor/positions'

function build() {
  const doc = new Y.Doc()
  prosemirrorJSONToYXmlFragment(schema, {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'ab' }, { type: 'text', marks: [{ type: 'strong' }], text: 'cd' }, { type: 'text', text: 'ef' }] },
    ],
  }, getText(doc))
  return { doc, pm: yXmlFragmentToProseMirrorRootNode(getText(doc), schema) }
}

describe('positions', () => {
  it('matches ProseMirror content size', () => {
    const { doc, pm } = build()
    expect(yDocSize(doc)).toBe(pm.content.size)
  })
  it('maps every block offset to the same ProseMirror position', () => {
    const { doc, pm } = build()
    for (let b = 0; b < 3; b++) {
      const len = blockText(doc, b).length
      for (let o = 0; o <= len; o++) {
        const $p = pm.resolve(pmPosOf(doc, b, o))
        expect($p.index(0)).toBe(b)
        expect($p.parentOffset).toBe(o)
      }
    }
    expect(pm.textBetween(pmPosOf(doc, 2, 1), pmPosOf(doc, 2, 5))).toBe('bcde')
  })
})
