# ADR 0001: Yjs + raw ProseMirror with a flat text-block schema

Date: 2026-10-03. Status: accepted.

## Context
We need a CRDT-backed rich-text editor whose positions we can compute without a DOM, so that the suggestion core can be tested in Node.

## Decision
- Use Yjs with ProseMirror through `y-prosemirror` (`ySyncPlugin`, `yCursorPlugin`, `yUndoPlugin`). No TipTap: we need direct control over decorations and plugin state, and TipTap adds a layer we would mostly bypass.
- Schema is flat: `doc > (heading | paragraph)+`, inline `text` with `strong` and `em` marks. No lists, hard breaks or inline nodes.
- Verified (2026-10-03, y-prosemirror 1.3.7): each text block maps to one `Y.XmlElement` holding at most one `Y.XmlText` (marks are formatting attributes and do not change length). An empty block has no children. So the ProseMirror position of offset `i` in block `k` is `sum(len(block_j) + 2 for j < k) + 1 + i`. We compute this ourselves in `src/editor/positions.ts`.

## Consequences
- The suggestion core (`src/core`) works on `Y.XmlText` + offsets and is fully testable in Node.
- What we gave up: lists, tables, images, and multi-block suggestions. Adding nested nodes later means switching position mapping to y-prosemirror's `relativePositionToAbsolutePosition` with the binding mapping.
