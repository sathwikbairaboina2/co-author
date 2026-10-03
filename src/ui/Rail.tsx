import type { CSSProperties } from 'react'
import { GearSix, Sparkle } from '@phosphor-icons/react'
import type { Snapshot } from '../app/session'

interface Props {
  snap: Snapshot
  offline: boolean
  onOffline(offline: boolean): void
  modelLabel: string
  onOpenSettings(): void
}

export function Rail({ snap, offline, onOffline, modelLabel, onOpenSettings }: Props) {
  const tabs = snap.sync.tabs
  return (
    <aside className="rail">
      <div className="brand">
        <img src="/icon.svg" alt="" width={22} height={22} />
        <span>Co-author</span>
      </div>

      <section className="rail__group" aria-labelledby="peers-h">
        <h2 id="peers-h" className="rail__h">In this document</h2>
        <ul className="peers">
          {snap.peers.map((p) => (
            <li key={p.clientId} className={`peer peer--${p.kind}`} title={p.name}>
              <span className="avatar" style={{ '--peer': p.color } as CSSProperties} aria-hidden>
                {p.kind === 'ai' ? <Sparkle size={15} /> : p.name[0]}
              </span>
              <span className="peer__name">{p.name}{p.isLocal ? ' (you)' : ''}</span>
              {p.kind === 'ai' && <span className="peer__activity mono">{p.activity}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rail__group" aria-labelledby="sync-h">
        <h2 id="sync-h" className="rail__h">Sync</h2>
        <label className="switch">
          <input type="checkbox" role="switch" checked={offline} onChange={(e) => onOffline(e.target.checked)} />
          <span className="switch__track" aria-hidden><span className="switch__thumb" /></span>
          <span>Simulate offline</span>
        </label>
        <p className="mono stat">{offline ? 'Offline. Edits stay on this device.' : `${tabs} ${tabs === 1 ? 'tab' : 'tabs'} connected`}</p>
        <p className="mono stat">{snap.saved ? 'Saved on this device' : 'Not saved'}</p>
      </section>

      <section className="rail__group" aria-labelledby="gate-h">
        <h2 id="gate-h" className="rail__h">AI write gate</h2>
        <p className="gate">
          <span><span className="gate__num">{snap.gate.passed}</span>passed</span>
          <span><span className="gate__num">{snap.gate.blocked}</span>blocked</span>
        </p>
        <p className="mono stat">Last check {snap.gate.lastCheckMs.toFixed(2)} ms</p>
      </section>

      <button type="button" className="model-chip" onClick={onOpenSettings} aria-label={`Model settings, current model ${modelLabel}`}>
        <span className="mono">{modelLabel}</span>
        <GearSix aria-hidden />
      </button>
    </aside>
  )
}
