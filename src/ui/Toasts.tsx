import { useCallback, useRef, useState } from 'react'

export interface Toast {
  id: number
  tone: 'info' | 'error' | 'block'
  text: string
  detail?: string
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(1)
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = next.current++
    setToasts((all) => [...all.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 5000)
  }, [])
  return { toasts, push }
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
          {t.detail && <span className="toast__detail">{t.detail}</span>}
        </div>
      ))}
    </div>
  )
}
