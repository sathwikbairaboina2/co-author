import { useEffect, useRef, type MutableRefObject } from 'react'
import type { EditorView } from 'prosemirror-view'
import type { Session } from '../app/session'
import { createEditor } from '../editor/createEditor'
import { scopeFromSelection, type Scope } from '../editor/scope'

interface Props {
  session: Session
  viewRef: MutableRefObject<EditorView | null>
  onScope(scope: Scope | null): void
  onAccept(id: string): void
  onReject(id: string): void
}

export function Paper({ session, viewRef, onScope, onAccept, onReject }: Props) {
  const mount = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onScope, onAccept, onReject })
  handlers.current = { onScope, onAccept, onReject }

  useEffect(() => {
    if (!mount.current) return
    const view = createEditor(mount.current, session, {
      onAccept: (id) => handlers.current.onAccept(id),
      onReject: (id) => handlers.current.onReject(id),
      onSelection: (scope) => handlers.current.onScope(scope),
    })
    viewRef.current = view
    handlers.current.onScope(scopeFromSelection(view.state))
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [session, viewRef])

  return (
    <section className="paper-shell" aria-label="Editor">
      <div className="paper-core">
        <div ref={mount} className="paper-mount" />
      </div>
    </section>
  )
}
