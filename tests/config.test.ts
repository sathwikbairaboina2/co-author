import { describe, expect, it } from 'vitest'
import { readConfig, saveModelConfig } from '../src/app/config'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, v) },
  }
}

describe('config', () => {
  it('defaults to the mock model, demo doc and proxied Ollama', () => {
    const c = readConfig('', memoryStorage())
    expect(c).toEqual({ docName: 'demo', aiMode: 'mock', openai: { baseUrl: '/ollama/v1', model: 'qwen3.8:27b' }, relayUrl: null })
  })
  it('reads doc, ai and relay from the URL and sanitizes the doc name', () => {
    const c = readConfig('?doc=My Doc!&ai=openai&relay=ws://localhost:1234', memoryStorage())
    expect(c).toMatchObject({ docName: 'MyDoc', aiMode: 'openai', relayUrl: 'ws://localhost:1234' })
  })
  it('persists the model choice, and ?ai= overrides it', () => {
    const s = memoryStorage()
    saveModelConfig('openai', { baseUrl: 'http://h/v1', model: 'm' }, s)
    expect(readConfig('', s)).toMatchObject({ aiMode: 'openai', openai: { baseUrl: 'http://h/v1', model: 'm' } })
    expect(readConfig('?ai=mock', s).aiMode).toBe('mock')
  })
  it('survives corrupt storage', () => {
    const s = memoryStorage()
    s.setItem('co-author:model', '{not json')
    expect(readConfig('', s).aiMode).toBe('mock')
  })
})
