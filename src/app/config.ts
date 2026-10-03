import { createMockModel } from '../ai/mockModel'
import { createOpenAIModel, DEFAULT_OPENAI, type OpenAIConfig } from '../ai/openaiModel'
import type { TextModel } from '../ai/model'

export type AiMode = 'mock' | 'openai'

export interface AppConfig {
  docName: string
  aiMode: AiMode
  openai: OpenAIConfig
  relayUrl: string | null
}

const KEY = 'co-author:model'

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function parseStored(raw: string | null | undefined): { aiMode?: AiMode; openai?: Partial<OpenAIConfig> } {
  try {
    const v: unknown = raw ? JSON.parse(raw) : {}
    return typeof v === 'object' && v !== null ? (v as { aiMode?: AiMode; openai?: Partial<OpenAIConfig> }) : {}
  } catch {
    return {}
  }
}

export function readConfig(search: string = globalThis.location?.search ?? '', storage: Storage | null = safeStorage()): AppConfig {
  const params = new URLSearchParams(search)
  const stored = parseStored(storage?.getItem(KEY))
  const forced = params.get('ai')
  const docName = (params.get('doc') ?? 'demo').replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'demo'
  const aiMode: AiMode = forced === 'mock' || forced === 'openai' ? forced : stored.aiMode === 'openai' ? 'openai' : 'mock'
  return { docName, aiMode, openai: { ...DEFAULT_OPENAI, ...stored.openai }, relayUrl: params.get('relay') }
}

export function saveModelConfig(aiMode: AiMode, openai: OpenAIConfig, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ aiMode, openai }))
  } catch {
    // storage can be unavailable (private mode); the choice then lasts for this tab only
  }
}

export function modelFor(config: Pick<AppConfig, 'aiMode' | 'openai'>): TextModel {
  return config.aiMode === 'openai' ? createOpenAIModel(config.openai) : createMockModel({ tokenDelayMs: 18 })
}
