import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import { schema } from '../editor/schema'
import { ORIGIN, ROOT } from '../core/schema'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] })

export const SEED_DOC = {
  type: 'doc',
  content: [
    h(1, 'Why the AI should knock first'),
    p('Most AI writing tools just write straight into your document. That is very convenient right up until it is actually wrong, and by then the change is basically mixed into everything else.'),
    p('Co-author treats the model as one more collaborator. It can really only propose. Every edit arrives as a tracked suggestion that you accept or reject, in order to keep the final say with the human.'),
    h(2, 'Try it'),
    p('Select a sentence, write an instruction, and press Propose. The mock editor removes filler words and tends to utilize plain verbs, so this paragraph is quite a good place to start.'),
    p('Open a second tab with the same address to watch edits sync, then turn on Simulate offline and type in both tabs. Due to the fact that the document is a CRDT, nothing is lost when you reconnect.'),
  ],
}

let cached: Uint8Array | null = null

/** Built by a fixed client id so every tab produces identical structs (ADR 0007). */
export function seedUpdate(): Uint8Array {
  if (cached) return cached
  const d = new Y.Doc()
  d.clientID = 1
  prosemirrorJSONToYXmlFragment(schema, SEED_DOC, d.getXmlFragment(ROOT.text))
  cached = Y.encodeStateAsUpdate(d)
  d.destroy()
  return cached
}

export function applySeed(doc: Y.Doc): void {
  Y.applyUpdate(doc, seedUpdate(), ORIGIN.seed)
}
