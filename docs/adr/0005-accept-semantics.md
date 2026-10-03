# ADR 0005: Accept only applies to the text the AI actually saw

Date: 2026-10-03. Status: accepted.

## Context
Between proposal and decision, humans may edit inside the suggested range. Applying a stale rewrite would silently overwrite their work.

## Decision
- Suggestion state is derived, never stored: `streaming` (AI still writing), `ready` (range resolves and current text equals `original`), `conflict` (range resolves but text differs), `orphan` (anchors do not resolve, for example the block was deleted).
- `acceptSuggestion` re-derives the state inside the transaction and refuses anything but `ready`. It deletes the range, inserts `insert` with the formatting attributes of the first replaced character, deletes the suggestion and records a resolution, all in one transaction with origin `co-author:accept`.
- That origin is added to `yUndoPlugin` tracked origins, so Ctrl+Z undoes an accept.

## Consequences
- Deterministic and testable: same inputs, same verdict on every peer.
- What we gave up: no automatic rebase of stale suggestions. The user rejects and asks again.
- Known limitation: if two tabs accept the same suggestion concurrently (before syncing), both deletes merge idempotently but both inserts survive, so the insert appears twice. A convergence test pins that peers still agree; deduplication is an open question.
