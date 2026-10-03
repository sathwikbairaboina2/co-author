export interface RewriteRequest {
  text: string
  instruction: string
  signal?: AbortSignal
}

export interface TextModel {
  readonly id: string
  readonly label: string
  stream(req: RewriteRequest): AsyncIterable<string>
}

export const abortError = () => new DOMException('The operation was aborted', 'AbortError')

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(abortError())
    }, { once: true })
  })
}

export function cleanModelOutput(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*$/, '').trim()
  const quoted = /^["'“]([\s\S]*)["'”]$/.exec(s)
  if (quoted) s = quoted[1].trim()
  return s
}
