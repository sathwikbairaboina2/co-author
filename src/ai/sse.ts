export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const dataOf = (event: string) =>
    event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let match: RegExpExecArray | null
      while ((match = /\r?\n\r?\n/.exec(buf)) !== null) {
        const data = dataOf(buf.slice(0, match.index))
        buf = buf.slice(match.index + match[0].length)
        if (data) yield data
      }
    }
    buf += decoder.decode()
    const tail = dataOf(buf.trim())
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

const OPEN = '<think>'
const CLOSE = '</think>'

function partialSuffix(s: string, tag: string): number {
  for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) if (tag.startsWith(s.slice(-k))) return k
  return 0
}

/** Removes <think>...</think> from a token stream, even when tags are split across chunks. */
export function createThinkFilter() {
  let inThink = false
  let pending = ''
  return {
    push(chunk: string): string {
      let s = pending + chunk
      pending = ''
      let out = ''
      for (;;) {
        const tag = inThink ? CLOSE : OPEN
        const idx = s.indexOf(tag)
        if (idx === -1) {
          const keep = partialSuffix(s, tag)
          if (!inThink) out += s.slice(0, s.length - keep)
          pending = s.slice(s.length - keep)
          return out
        }
        if (!inThink) out += s.slice(0, idx)
        s = s.slice(idx + tag.length)
        inThink = !inThink
      }
    },
    flush(): string {
      const rest = inThink ? '' : pending
      pending = ''
      return rest
    },
  }
}
