import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconContext } from '@phosphor-icons/react'
import type { EditorView } from 'prosemirror-view'
import { Session } from '../app/session'
import { modelFor, readConfig, type AppConfig } from '../app/config'
import type { Scope } from '../editor/scope'
import { Paper } from './Paper'
import { Toasts, useToasts } from './Toasts'

export function App() {
  const [config, setConfig] = useState<AppConfig>(() => readConfig())
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let created: Session | null = null
    Session.create({ docName: config.docName, model: modelFor(config), relayUrl: config.relayUrl })
      .then((s) => {
        if (!live) return s.destroy()
        created = s
        setSession(s)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
      created?.destroy()
      setSession(null)
    }
    // the model is swapped in place by Workspace; only doc and relay changes need a new session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.docName, config.relayUrl])

  return (
    <IconContext.Provider value={{ weight: 'light', size: 18 }}>
      {error ? (
        <main className="fatal">
          <h1>Co-author could not start</h1>
          <p>{error}</p>
        </main>
      ) : session ? (
        <Workspace session={session} config={config} onConfig={setConfig} />
      ) : (
        <Loading />
      )}
    </IconContext.Provider>
  )
}

function Loading() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading">
      <div className="rail">
        <div className="skeleton" style={{ height: 22, width: 120 }} />
        <div className="skeleton" style={{ height: 64 }} />
        <div className="skeleton" style={{ height: 48 }} />
      </div>
      <div className="stage">
        <div className="paper-shell">
          <div className="paper-core">
            <div className="skeleton-lines">
              <div className="skeleton" style={{ height: 36, width: '70%' }} />
              {[96, 88, 92, 60].map((w) => <div key={w} className="skeleton" style={{ height: 16, width: `${w}%` }} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface WorkspaceProps {
  session: Session
  config: AppConfig
  onConfig(c: AppConfig): void
}

function Workspace({ session }: WorkspaceProps) {
  useSyncExternalStore(session.subscribe, session.getSnapshot)
  const viewRef = useRef<EditorView | null>(null)
  const [, setScope] = useState<Scope | null>(null)
  const { toasts, push } = useToasts()

  const accept = useCallback((id: string) => {
    const r = session.accept(id)
    if (!r.ok) push({ tone: 'info', text: 'That proposal no longer matches the text.', detail: r.reason })
  }, [session, push])
  const reject = useCallback((id: string) => { session.reject(id) }, [session])

  return (
    <div className="app">
      <aside className="rail" />
      <main className="stage">
        <Paper session={session} viewRef={viewRef} onScope={setScope} onAccept={accept} onReject={reject} />
      </main>
      <aside className="panel" />
      <Toasts toasts={toasts} />
    </div>
  )
}
