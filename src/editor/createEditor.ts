import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { redo, undo, yCursorPlugin, ySyncPlugin, yUndoPlugin } from 'y-prosemirror'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { getText, ORIGIN } from '../core/schema'
import { schema } from './schema'
import { scopeFromSelection, type Scope } from './scope'
import { suggestionPlugin, type SuggestionHandlers } from './suggestionPlugin'

export interface EditorHandlers extends SuggestionHandlers {
  onSelection(scope: Scope | null): void
}

export function createEditor(mount: HTMLElement, session: { doc: Y.Doc; awareness: Awareness }, handlers: EditorHandlers): EditorView {
  const state = EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(getText(session.doc)),
      yCursorPlugin(session.awareness, {
        awarenessStateFilter: (current: number, other: number, st: { user?: { kind?: string } }) =>
          current !== other && st.user?.kind !== 'ai',
      }),
      yUndoPlugin({ trackedOrigins: [ORIGIN.accept] }),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
      }),
      keymap(baseKeymap),
      suggestionPlugin({ ydoc: session.doc, awareness: session.awareness, onAccept: handlers.onAccept, onReject: handlers.onReject }),
    ],
  })
  const view: EditorView = new EditorView(mount, {
    state,
    attributes: { class: 'prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document', spellcheck: 'true' },
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
      if (tr.selectionSet || tr.docChanged) handlers.onSelection(scopeFromSelection(view.state))
    },
  })
  return view
}
