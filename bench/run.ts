import os from 'node:os'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { getSuggestions, getResolved } from '../src/core/schema'
import { blockText } from '../src/core/anchors'
import { connectAiPeer, validateAiUpdate } from '../src/core/gate'
import { BroadcastChannelProvider } from '../src/sync/broadcast'
import { fork, makeDoc, mulberry32, suggestionFor, textType } from '../tests/helpers'

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]
const round = (x: number, d = 2) => Number(x.toFixed(d))

const PARAS = Array.from({ length: 5 }, (_, i) =>
  `Paragraph ${i + 1} of the benchmark document holds enough plain words to edit at random positions without running out of text, which keeps every peer busy.`)

// Canonical form: the encoded state vector and map JSON depend on per-replica insertion order, so sort both.
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
  : v

const fingerprint = (d: Y.Doc) =>
  JSON.stringify(canon([[...Y.decodeStateVector(Y.encodeStateVector(d))].sort(([a], [b]) => a - b), getSuggestions(d).toJSON(), getResolved(d).toJSON(), Array.from({ length: 5 }, (_, i) => blockText(d, i))]))

function randomEdits(doc: Y.Doc, n: number, rand: () => number) {
  for (let k = 0; k < n; k++) {
    const b = Math.floor(rand() * 5)
    const len = blockText(doc, b).length
    if (rand() < 0.7 || len < 20) textType(doc, b).insert(Math.floor(rand() * (len + 1)), 'word ')
    else textType(doc, b).delete(Math.floor(rand() * (len - 5)), 3)
  }
}

function convergence(peers: number, editsPerPeer: number, seed: number) {
  const rand = mulberry32(seed)
  const root = makeDoc(PARAS, 1)
  const docs = Array.from({ length: peers }, (_, i) => fork(root, 1000 + i))
  docs.forEach((d, i) => {
    randomEdits(d, editsPerPeer, rand)
    const ai = new Y.Doc()
    connectAiPeer(d, ai)
    for (let s = 0; s < 2; s++) {
      const id = `ai-${i}-${s}`
      getSuggestions(ai).set(id, suggestionFor(ai, s, 0, 9, 'Section', { id, clientId: ai.clientID }))
    }
  })
  let bytes = 0
  const t0 = performance.now()
  for (const a of docs) for (const b of docs) {
    if (a === b) continue
    const u = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b))
    bytes += u.byteLength
    Y.applyUpdate(b, u)
  }
  const ms = performance.now() - t0
  const fp = fingerprint(docs[0])
  if (!docs.every((d) => fingerprint(d) === fp)) throw new Error(`peers=${peers} did not converge`)
  return { ms, bytes }
}

function offlineMerge(edits: number, seed: number) {
  const rand = mulberry32(seed)
  const root = makeDoc(PARAS, 1)
  const a = fork(root, 2001)
  const b = fork(root, 2002)
  randomEdits(a, edits, rand)
  randomEdits(b, edits, rand)
  const t0 = performance.now()
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b))
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a))
  Y.applyUpdate(b, ua)
  Y.applyUpdate(a, ub)
  const ms = performance.now() - t0
  if (fingerprint(a) !== fingerprint(b)) throw new Error('offline merge diverged')
  return { ms, bytes: ua.byteLength + ub.byteLength }
}

function gateCost(chars: number) {
  const paras = Math.max(1, Math.round(chars / PARAS[0].length))
  const human = makeDoc(Array.from({ length: paras }, (_, i) => PARAS[i % 5]), 1)
  const ai = new Y.Doc()
  Y.applyUpdate(ai, Y.encodeStateAsUpdate(human))
  let last: Uint8Array | null = null
  ai.on('update', (u: Uint8Array) => { last = u })
  getSuggestions(ai).set('g', suggestionFor(ai, 0, 0, 9, 'Section', { id: 'g', clientId: ai.clientID }))
  const legal = last!
  textType(ai, 0).insert(0, 'EVIL ')
  const illegal = last!
  const legalMs: number[] = []
  const illegalMs: number[] = []
  for (let i = 0; i < 50; i++) {
    let t = performance.now()
    if (!validateAiUpdate(human, legal, ai.clientID).ok) throw new Error('legal update rejected')
    legalMs.push(performance.now() - t)
    t = performance.now()
    if (validateAiUpdate(human, illegal, ai.clientID).ok) throw new Error('illegal update accepted')
    illegalMs.push(performance.now() - t)
  }
  return { chars: paras * PARAS[0].length, legalMedianMs: median(legalMs), illegalMedianMs: median(illegalMs) }
}

async function broadcastLatency(tabs: number, edits: number) {
  const name = `bench-${Date.now()}`
  const docs = Array.from({ length: tabs }, (_, i) => (i === 0 ? makeDoc(PARAS, 1) : new Y.Doc()))
  const providers = docs.map((d) => new BroadcastChannelProvider(d, new Awareness(d), name))
  const wait = (cond: () => boolean) => new Promise<void>((res, rej) => {
    const start = Date.now()
    const tick = () => (cond() ? res() : Date.now() - start > 5000 ? rej(new Error('timeout')) : setImmediate(tick))
    tick()
  })
  await wait(() => docs.every((d) => blockText(d, 0) === PARAS[0]))
  const samples: number[] = []
  for (let k = 0; k < edits; k++) {
    const marker = `m${k} `
    const t0 = performance.now()
    textType(docs[0], 0).insert(0, marker)
    await wait(() => docs.every((d) => blockText(d, 0).startsWith(marker)))
    samples.push(performance.now() - t0)
  }
  providers.forEach((p) => p.destroy())
  return { tabs, edits, medianMs: median(samples), p95Ms: p95(samples) }
}

async function main() {
  const runs = 5
  const results = {
    machine: { cpu: os.cpus()[0]?.model ?? 'unknown', cores: os.cpus().length, node: process.version, platform: `${os.platform()} ${os.release()}` },
    date: new Date().toISOString(),
    convergence: [2, 4, 8, 16, 32].map((peers) => {
      const samples = Array.from({ length: runs }, (_, r) => convergence(peers, 100, peers * 10 + r))
      return { peers, editsPerPeer: 100, aiSuggestionsPerPeer: 2, medianMs: round(median(samples.map((s) => s.ms))), bytes: samples[0].bytes }
    }),
    offlineMerge: [100, 1000, 5000].map((edits) => {
      const samples = Array.from({ length: runs }, (_, r) => offlineMerge(edits, edits + r))
      return { editsPerSide: edits, medianMs: round(median(samples.map((s) => s.ms))), bytes: samples[0].bytes }
    }),
    gate: [10_000, 50_000, 200_000].map((c) => {
      const g = gateCost(c)
      return { chars: g.chars, legalMedianMs: round(g.legalMedianMs, 3), illegalMedianMs: round(g.illegalMedianMs, 3) }
    }),
    broadcast: await broadcastLatency(4, 200),
  }
  results.broadcast = { ...results.broadcast, medianMs: round(results.broadcast.medianMs, 3), p95Ms: round(results.broadcast.p95Ms, 3) }
  writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n')
  console.log(`Machine: ${results.machine.cpu}, ${results.machine.cores} cores, Node ${results.machine.node}, ${results.machine.platform}`)
  console.log('\nConvergence (full mesh, 100 random edits + 2 gated AI suggestions per peer, median of 5)')
  console.log('| peers | median ms | bytes exchanged |\n|---|---|---|')
  results.convergence.forEach((r) => console.log(`| ${r.peers} | ${r.medianMs} | ${r.bytes} |`))
  console.log('\nOffline divergence merge (two replicas, median of 5)')
  console.log('| edits per side | median ms | bytes |\n|---|---|---|')
  results.offlineMerge.forEach((r) => console.log(`| ${r.editsPerSide} | ${r.medianMs} | ${r.bytes} |`))
  console.log('\nGate cost per AI update (median of 50)')
  console.log('| doc chars | legal ms | illegal ms |\n|---|---|---|')
  results.gate.forEach((r) => console.log(`| ${r.chars} | ${r.legalMedianMs} | ${r.illegalMedianMs} |`))
  console.log(`\nBroadcastChannel in Node, ${results.broadcast.tabs} providers, ${results.broadcast.edits} edits: median ${results.broadcast.medianMs} ms, p95 ${results.broadcast.p95Ms} ms`)
  process.exit(0)
}

void main()
