import { useEffect, useState } from 'react'
import { Check, WarningCircle, X } from '@phosphor-icons/react'
import type { Resolution } from '../core/schema'
import type { SuggestionView } from '../core/suggestions'
import { relativeTime } from './time'

interface Props {
  views: SuggestionView[]
  resolved: Array<Resolution & { id: string }>
  onAccept(id: string): void
  onReject(id: string): void
  onFocus(id: string | null): void
  onReveal(id: string): void
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function ProposalsPanel({ views, resolved, onAccept, onReject, onFocus, onReveal }: Props) {
  const now = useNow()
  const visible = views.filter((v) => v.state !== 'orphan')
  return (
    <aside className="panel" aria-labelledby="proposals-title">
      <header className="panel__head">
        <h2 id="proposals-title">Proposals</h2>
        <span className="mono panel__count">{visible.length}</span>
      </header>
      {visible.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No open proposals</p>
          <p className="empty__body">Select a passage, write an instruction, and press Propose. Suggestions show up here and inline in the text.</p>
        </div>
      ) : (
        <ol className="cards">
          {visible.map((v) => (
            <li key={v.suggestion.id}>
              <ProposalCard view={v} now={now} onAccept={onAccept} onReject={onReject} onFocus={onFocus} onReveal={onReveal} />
            </li>
          ))}
        </ol>
      )}
      {resolved.length > 0 && (
        <section className="resolved" aria-label="Resolved proposals">
          <h3>Resolved</h3>
          <ul>
            {resolved.slice(0, 6).map((r) => (
              <li key={r.id} className="mono">
                <span className={`verdict verdict--${r.verdict}`}>{r.verdict}</span>
                <span className="resolved__text">{clip(r.insert ? `${r.original || '(insert)'} to ${r.insert}` : `removed ${r.original}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

interface CardProps {
  view: SuggestionView
  now: number
  onAccept(id: string): void
  onReject(id: string): void
  onFocus(id: string | null): void
  onReveal(id: string): void
}

function ProposalCard({ view, now, onAccept, onReject, onFocus, onReveal }: CardProps) {
  const { suggestion: s, state } = view
  const label =
    state === 'streaming' ? 'Writing' : state === 'conflict' ? 'Text changed since proposed' : s.author.name
  return (
    <article
      data-testid="proposal-card"
      className={`card card--${state}`}
      aria-label={`Proposal from ${s.author.name}`}
      onMouseEnter={() => onFocus(s.id)}
      onMouseLeave={() => onFocus(null)}
    >
      <div className="card__core">
        <button type="button" className="card__diff" onClick={() => onReveal(s.id)} onFocus={() => onFocus(s.id)} onBlur={() => onFocus(null)}>
          <span className="visually-hidden">Show in document: </span>
          {s.original && <del>{s.original}</del>}
          {s.insert && <ins>{s.insert}</ins>}
        </button>
        <p className="card__meta mono">
          {state === 'conflict' && <WarningCircle aria-hidden size={14} />}
          <span>{label}</span>
          <span aria-hidden>·</span>
          <time dateTime={new Date(s.createdAt).toISOString()}>{relativeTime(s.createdAt, now)}</time>
        </p>
        {state !== 'streaming' && (
          <div className="card__actions">
            <button type="button" className="btn btn--accept" onClick={() => onAccept(s.id)} disabled={state !== 'ready'}>
              <Check aria-hidden size={16} /> Accept
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => onReject(s.id)}>
              <X aria-hidden size={16} /> Reject
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
