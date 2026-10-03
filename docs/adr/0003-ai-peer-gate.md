# ADR 0003: The AI peer is a separate Y.Doc behind a fail-closed gate

Date: 2026-10-03. Status: accepted.

## Context
"The model proposes, the core disposes" must be enforced by structure, not by convention. A bug or prompt injection in the AI layer must not be able to edit the document.

## Decision
- The AI peer owns its own `Y.Doc` (own client id) and `Awareness`. Human updates flow into it freely (origin `co-author:to-ai`).
- Every update the AI doc emits goes through `validateAiUpdate(humanDoc, update, aiClientId)` before it touches the human doc:
  1. Clone the human doc (`encodeStateAsUpdate` into a fresh `Y.Doc`).
  2. Apply the AI update to the clone and inspect `transaction.changed` in `afterTransaction`.
  3. Reject if any changed type is not the `suggestions` map, if any written value fails `validateSuggestion`, if the author client id is not the AI's, or if the update leaves pending structs or deletes (missing dependencies).
- Writes to ids already in `resolved` are allowed through on purpose: they are inert (ADR 0002), and rejecting them would desync the AI replica and quarantine a peer for a benign race.
- On the first rejection the connection is quarantined: further AI updates are dropped until a fresh AI peer is created. Stats (passed, blocked, last check duration) are exposed for the UI.
- Verified in a prototype (2026-10-03, yjs 13.6.33): suggestion set, overwrite and delete pass; text insert, text delete and writes to another map are rejected.

## Consequences
- What we gave up: speed. Each AI update costs a doc clone (measured in the bench, reported in the README). AI writes are throttled to one per `flushMs` (default 60 ms) during streaming.
- Trust boundary is the tab that hosts the AI peer. Remote human tabs are trusted. Gating remote peers per sender is a stretch item.
- Reading `doc.store.pendingStructs` and `pendingDs` touches Yjs internals; pinned by tests so an upgrade that breaks it fails loudly.
