import { useEffect, useRef, useState } from 'react'
import type { AiMode, AppConfig } from '../app/config'
import type { OpenAIConfig } from '../ai/openaiModel'

interface Props {
  open: boolean
  config: AppConfig
  onClose(): void
  onSave(mode: AiMode, openai: OpenAIConfig): void
  onRogueWrite(): void
}

export function SettingsDialog({ open, config, onClose, onSave, onRogueWrite }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<AiMode>(config.aiMode)
  const [baseUrl, setBaseUrl] = useState(config.openai.baseUrl)
  const [model, setModel] = useState(config.openai.model)
  const [apiKey, setApiKey] = useState(config.openai.apiKey ?? '')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="settings" onClose={onClose} aria-labelledby="settings-title">
      <form
        className="settings__core"
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(mode, { baseUrl: baseUrl.trim(), model: model.trim(), ...(apiKey ? { apiKey } : {}) })
          onClose()
        }}
      >
        <h2 id="settings-title">Model</h2>
        <fieldset className="field">
          <legend>Backend</legend>
          <div className="segmented">
            <label><input type="radio" name="mode" checked={mode === 'mock'} onChange={() => setMode('mock')} />Mock editor</label>
            <label><input type="radio" name="mode" checked={mode === 'openai'} onChange={() => setMode('openai')} />OpenAI-compatible</label>
          </div>
          <p className="help">The mock is deterministic and works offline. OpenAI-compatible defaults to the local Ollama daemon.</p>
        </fieldset>
        <div className="field">
          <label htmlFor="base-url">Base URL</label>
          <input id="base-url" type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={mode === 'mock'} />
          <p className="help">/ollama/v1 is proxied to localhost:11434 by the dev server and the Docker image.</p>
        </div>
        <div className="field">
          <label htmlFor="model-name">Model</label>
          <input id="model-name" type="text" value={model} onChange={(e) => setModel(e.target.value)} disabled={mode === 'mock'} />
        </div>
        <div className="field">
          <label htmlFor="api-key">API key (optional)</label>
          <input id="api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={mode === 'mock'} autoComplete="off" />
          <p className="help">Stored only in this browser.</p>
        </div>
        <div className="settings__row">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--accept">Save</button>
        </div>
        <div className="settings__redteam">
          <p className="help">The co-author can only write proposals. This makes it try to edit the text directly, so you can watch the gate block it.</p>
          <button type="button" className="btn btn--ghost" onClick={() => { onRogueWrite(); onClose() }}>Simulate rogue write</button>
        </div>
      </form>
    </dialog>
  )
}
