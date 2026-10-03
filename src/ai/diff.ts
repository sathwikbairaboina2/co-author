export interface Hunk {
  from: number
  to: number
  insert: string
}

export const tokenize = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? []

/** LCS over whitespace and word tokens. Offsets refer to `a`. */
export function diffWords(a: string, b: string): Hunk[] {
  const A = tokenize(a)
  const B = tokenize(b)
  const n = A.length
  const m = B.length
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const hunks: Hunk[] = []
  let open: Hunk | null = null
  let i = 0
  let j = 0
  let offset = 0
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      if (open) hunks.push(open)
      open = null
      offset += A[i].length
      i++
      j++
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      open ??= { from: offset, to: offset, insert: '' }
      open.insert += B[j]
      j++
    } else {
      open ??= { from: offset, to: offset, insert: '' }
      offset += A[i].length
      open.to = offset
      i++
    }
  }
  if (open) hunks.push(open)
  return hunks
}

export function applyHunks(a: string, hunks: Hunk[]): string {
  let out = ''
  let pos = 0
  for (const h of hunks) {
    out += a.slice(pos, h.from) + h.insert
    pos = h.to
  }
  return out + a.slice(pos)
}
