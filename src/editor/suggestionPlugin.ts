import { Plugin, PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import checkSvg from '@phosphor-icons/core/assets/light/check-light.svg?raw'
import xSvg from '@phosphor-icons/core/assets/light/x-light.svg?raw'
import { getResolved, getSuggestions } from '../core/schema'
import { resolveRange } from '../core/anchors'
import { listSuggestionViews, type SuggestionView } from '../core/suggestions'
import type { AiPresence } from '../ai/aiPeer'
import { pmPosOf, yDocSize } from './positions'

export interface SuggestionHandlers {
  onAccept(id: string): void
  onReject(id: string): void
}

interface PluginState {
  decorations: DecorationSet
  focusedId: string | null
}

export const suggestionKey = new PluginKey<PluginState>('co-author-suggestions')

function iconButton(svg: string, label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'sg-btn'
  b.setAttribute('aria-label', label)
  b.title = label
  b.innerHTML = svg
  b.disabled = disabled
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', (e) => {
    e.preventDefault()
    onClick()
  })
  return b
}

function renderInsert(view: SuggestionView, focused: boolean, handlers: SuggestionHandlers): HTMLElement {
  const s = view.suggestion
  const wrap = document.createElement('span')
  wrap.className = `sg-ins sg--${view.state}${focused ? ' is-focused' : ''}`
  wrap.dataset.sg = s.id
  wrap.contentEditable = 'false'
  const text = document.createElement('span')
  text.className = 'sg-ins__text'
  text.textContent = s.insert
  wrap.append(text)
  if (view.state === 'ready' || view.state === 'conflict') {
    const actions = document.createElement('span')
    actions.className = 'sg-actions'
    actions.append(
      iconButton(checkSvg, 'Accept suggestion', () => handlers.onAccept(s.id), view.state !== 'ready'),
      iconButton(xSvg, 'Reject suggestion', () => handlers.onReject(s.id), false),
    )
    wrap.append(actions)
  }
  return wrap
}

function renderAiCaret(name: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'ai-caret'
  el.setAttribute('aria-hidden', 'true')
  const flag = document.createElement('span')
  flag.className = 'ai-caret__flag'
  flag.textContent = name
  el.append(flag)
  return el
}

export function buildDecorations(
  state: EditorState,
  ydoc: Y.Doc,
  awareness: Awareness | null,
  focusedId: string | null,
  handlers: SuggestionHandlers,
): DecorationSet {
  const size = state.doc.content.size
  const decos: Decoration[] = []
  for (const view of listSuggestionViews(ydoc)) {
    if (view.state === 'orphan' || !view.range) continue
    const from = pmPosOf(ydoc, view.range.blockIndex, view.range.from)
    const to = pmPosOf(ydoc, view.range.blockIndex, view.range.to)
    if (from < 0 || to > size || from > to) continue
    const id = view.suggestion.id
    const focused = id === focusedId
    if (to > from) {
      decos.push(Decoration.inline(from, to, { class: `sg sg-del sg--${view.state}${focused ? ' is-focused' : ''}`, 'data-sg': id }))
    }
    decos.push(
      Decoration.widget(to, () => renderInsert(view, focused, handlers), {
        side: 1,
        key: `${id}|${view.state}|${view.suggestion.insert}|${focused}`,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    )
  }
  awareness?.getStates().forEach((st, clientId) => {
    const user = st.user as AiPresence | undefined
    if (!user || user.kind !== 'ai' || !user.caret || user.activity === 'idle') return
    const r = resolveRange(ydoc, { from: user.caret, to: user.caret })
    if (!r) return
    const pos = pmPosOf(ydoc, r.blockIndex, r.from)
    if (pos > size) return
    decos.push(Decoration.widget(pos, () => renderAiCaret(user.name), { side: -1, key: `ai-caret-${clientId}` }))
  })
  return DecorationSet.create(state.doc, decos)
}

export function suggestionPlugin(opts: SuggestionHandlers & { ydoc: Y.Doc; awareness: Awareness }): Plugin<PluginState> {
  return new Plugin<PluginState>({
    key: suggestionKey,
    state: {
      init: (_config, state) => ({ focusedId: null, decorations: buildDecorations(state, opts.ydoc, opts.awareness, null, opts) }),
      apply: (tr, prev, _old, state) => {
        const meta = tr.getMeta(suggestionKey) as { focusedId?: string | null } | undefined
        const focusedId = meta && 'focusedId' in meta ? (meta.focusedId ?? null) : prev.focusedId
        // ySyncPlugin may not have applied the latest Yjs change to ProseMirror yet; keep mapped decorations until both agree.
        if (yDocSize(opts.ydoc) !== state.doc.content.size) {
          return { focusedId, decorations: prev.decorations.map(tr.mapping, tr.doc) }
        }
        return { focusedId, decorations: buildDecorations(state, opts.ydoc, opts.awareness, focusedId, opts) }
      },
    },
    props: {
      decorations: (state) => suggestionKey.getState(state)?.decorations,
    },
    view: (view) => {
      let queued = false
      const refresh = () => {
        if (queued) return
        queued = true
        queueMicrotask(() => {
          queued = false
          if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(suggestionKey, {}))
        })
      }
      const suggestions = getSuggestions(opts.ydoc)
      const resolved = getResolved(opts.ydoc)
      suggestions.observe(refresh)
      resolved.observe(refresh)
      opts.awareness.on('change', refresh)
      return {
        destroy: () => {
          suggestions.unobserve(refresh)
          resolved.unobserve(refresh)
          opts.awareness.off('change', refresh)
        },
      }
    },
  })
}

export function setFocusedSuggestion(view: EditorView, id: string | null) {
  view.dispatch(view.state.tr.setMeta(suggestionKey, { focusedId: id }))
}
