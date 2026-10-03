# ADR 0002: Suggestions live in a separate Y.Map anchored by RelativePositions

Date: 2026-10-03. Status: accepted.

## Context
AI edits must never land in the text directly, but they must stay attached to the right words while humans keep typing, across peers.

## Decision
- Root `suggestions`: `Y.Map<Suggestion>` keyed by suggestion id. Values are plain JSON objects (stored as `ContentAny`), not nested Y types, so a suggestion is replaced atomically and the gate only has to reason about one map.
- Each suggestion stores `from` and `to` as `Y.relativePositionToJSON` output, plus `original` (text under the range when proposed) and `insert`.
- Anchor association: `from` uses assoc 0 (sticks to the first character of the range), `to` uses assoc -1 (sticks to the last character). Typing at either boundary stays outside the range. Collapsed ranges use assoc 0 for both. Verified in a prototype on 2026-10-03: inserts at either boundary stay outside, inserts inside grow the range, deleting the range collapses it (from == to), deleting the block makes it unresolvable.
- Root `resolved`: `Y.Map<Resolution>` records each verdict. Resolved ids are filtered from every view and refused by accept, so a late streaming write that races a reject is inert (no visible resurrection). The AI peer also checks `resolved` before each flush and stops.

## Consequences
- Rendering is a pure function of (text, suggestions, resolved).
- What we gave up: suggestions cannot span blocks; the resolved map grows forever (fine for v0.1, compaction is a stretch item).
