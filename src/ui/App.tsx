import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconContext } from '@phosphor-icons/react'
import type { EditorView } from 'prosemirror-view'
import { Session } from '../app/session'
import { modelFor, readConfig, saveModelConfig, type AiMode, type AppConfig } from '../app/config'
import type { OpenAIConfig } from '../ai/openaiModel'
import { scopeFromSelection, type Scope } from '../editor/scope'
import { setFocusedSuggestion } from '../editor/suggestionPlugin'
import { Paper } from './Paper'
import { ProposalsPanel } from './ProposalsPanel'
import { CommandIsland } from './CommandIsland'
import { Rail } from './Rail'
import { SettingsDialog } from './SettingsDialog'
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

function Workspace({ session, config, onConfig }: WorkspaceProps) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const viewRef = useRef<EditorView | null>(null)
  const [scope, setScope] = useState<Scope | null>(null)
  const [running, setRunning] = useState<AbortController | null>(null)
  const [offline, setOffline] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { toasts, push } = useToasts()

  useEffect(() => session.onBlocked((reason) => {
    push({ tone: 'block', text: 'Blocked a direct write from the co-author. The peer was restarted.', detail: reason })
  }), [session, push])

  const toggleOffline = (next: boolean) => {
    setOffline(next)
    session.setOffline(next)
  }

  const saveModel = (aiMode: AiMode, openai: OpenAIConfig) => {
    const next = { ...config, aiMode, openai }
    saveModelConfig(aiMode, openai)
    session.setModel(modelFor(next))
    onConfig(next)
  }

  const modelLabel = config.aiMode === 'mock' ? 'Mock editor' : config.openai.model

  const accept = useCallback((id: string) => {
    const r = session.accept(id)
    if (!r.ok) push({ tone: 'info', text: 'That proposal no longer matches the text.', detail: r.reason })
  }, [session, push])
  const reject = useCallback((id: string) => { session.reject(id) }, [session])

  const propose = useCallback(async (instruction: string) => {
    const view = viewRef.current
    const sc = view ? scopeFromSelection(view.state) : null
    if (!sc || sc.to <= sc.from) {
      push({ tone: 'info', text: 'Place the caret in a paragraph with text first.' })
      return
    }
    const ctl = new AbortController()
    setRunning(ctl)
    try {
      const r = await session.propose({ ...sc, instruction }, ctl.signal)
      if (r.kind === 'noop') push({ tone: 'info', text: r.reason })
      if (r.kind === 'draft') push({ tone: 'info', text: 'The text changed while the co-author was writing, so the draft is kept whole.' })
    } catch (e) {
      push({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(null)
    }
  }, [session, push])

  const focus = useCallback((id: string | null) => {
    if (viewRef.current) setFocusedSuggestion(viewRef.current, id)
  }, [])

  const reveal = useCallback((id: string) => {
    const el = viewRef.current?.dom.querySelector(`[data-sg="${CSS.escape(id)}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    focus(id)
  }, [focus])

  return (
    <div className="app">
      <Rail snap={snap} offline={offline} onOffline={toggleOffline} modelLabel={modelLabel} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="stage">
        <Paper session={session} viewRef={viewRef} onScope={setScope} onAccept={accept} onReject={reject} />
        <CommandIsland scope={scope} running={running !== null} onPropose={propose} onStop={() => running?.abort()} />
      </main>
      <ProposalsPanel views={snap.views} resolved={snap.resolved} onAccept={accept} onReject={reject} onFocus={focus} onReveal={reveal} />
      <SettingsDialog open={settingsOpen} config={config} onClose={() => setSettingsOpen(false)} onSave={saveModel} onRogueWrite={() => session.simulateRogueWrite()} />
      <Toasts toasts={toasts} />
    </div>
  )
}
