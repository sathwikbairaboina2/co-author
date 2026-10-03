import { useState } from 'react'
import { ArrowUpRight, Sparkle, Stop } from '@phosphor-icons/react'
import type { Scope } from '../editor/scope'

interface Props {
  scope: Scope | null
  running: boolean
  onPropose(instruction: string): void
  onStop(): void
}

export function CommandIsland({ scope, running, onPropose, onStop }: Props) {
  const [instruction, setInstruction] = useState('Tighten this. Cut filler words.')
  const empty = !scope || scope.to <= scope.from
  const scopeLabel = !scope ? 'No paragraph' : scope.label === 'selection' ? 'Selection' : 'This paragraph'
  return (
    <form
      className="island"
      onSubmit={(e) => {
        e.preventDefault()
        if (running) onStop()
        else if (!empty) onPropose(instruction.trim() || 'Tighten this.')
      }}
    >
      <span className="island__glyph" aria-hidden><Sparkle /></span>
      <label className="island__label" htmlFor="instruction">Instruction</label>
      <input
        id="instruction"
        className="island__input"
        value={instruction}
        maxLength={500}
        autoComplete="off"
        onChange={(e) => setInstruction(e.target.value)}
      />
      <span className="island__scope" aria-live="polite">{scopeLabel}</span>
      <button type="submit" className={`btn btn--primary${running ? ' is-running' : ''}`} disabled={!running && empty}>
        <span>{running ? 'Stop' : 'Propose'}</span>
        <span className="btn__orb" aria-hidden>{running ? <Stop /> : <ArrowUpRight />}</span>
      </button>
    </form>
  )
}
