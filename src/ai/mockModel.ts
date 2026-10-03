import { tokenize } from './diff'
import { abortError, sleep, type TextModel } from './model'

const RULES: Array<[RegExp, string]> = [
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bin order to\b/gi, 'to'],
  [/\ba lot of\b/gi, 'many'],
  [/\butilizes\b/gi, 'uses'],
  [/\butilized\b/gi, 'used'],
  [/\butilizing\b/gi, 'using'],
  [/\butilize\b/gi, 'use'],
  [/\b(?:very|really|just|actually|basically|quite|simply)\s+/gi, ''],
  [/ {2,}/g, ' '],
]

function preserveCase(match: string, replacement: string): string {
  if (replacement.length === 0) return replacement
  const first = match[0]
  return first === first.toUpperCase() && first !== first.toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement
}

export function rewriteDeterministically(text: string): string {
  let out = text
  for (const [re, rep] of RULES) out = out.replace(re, (m) => preserveCase(m, rep))
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase())
}

export function createMockModel(opts: { tokenDelayMs?: number } = {}): TextModel {
  const delay = opts.tokenDelayMs ?? 18
  return {
    id: 'mock',
    label: 'Mock editor',
    async *stream({ text, signal }) {
      for (const token of tokenize(rewriteDeterministically(text))) {
        if (signal?.aborted) throw abortError()
        if (delay > 0) await sleep(delay, signal)
        yield token
      }
    },
  }
}
