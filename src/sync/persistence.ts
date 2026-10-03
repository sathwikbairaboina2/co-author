import type * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export async function attachPersistence(doc: Y.Doc, name: string, timeoutMs = 3000): Promise<IndexeddbPersistence> {
  const persistence = new IndexeddbPersistence(`co-author:${name}`, doc)
  await Promise.race([persistence.whenSynced, new Promise((r) => setTimeout(r, timeoutMs))])
  return persistence
}
