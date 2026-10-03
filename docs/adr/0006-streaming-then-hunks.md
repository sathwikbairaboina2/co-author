# ADR 0006: Stream one draft suggestion, then split into word-level hunks

Date: 2026-10-03. Status: accepted.

## Context
Streaming is the visible "AI is working" moment, but one big replace-the-paragraph suggestion makes poor tracked changes.

## Decision
- While the model streams, the AI peer keeps one suggestion with `status: 'streaming'` over the whole scope and overwrites its `insert` at most every `flushMs`.
- When the stream ends, the peer cleans the output (strip `<think>` blocks, wrapping quotes, surrounding whitespace), diffs `original` against it at word level (LCS over whitespace and word tokens), and in one transaction replaces the draft with one `ready` suggestion per hunk, all sharing the draft id as `groupId`.
- If the scope text changed during streaming, the draft is kept as a single `ready` suggestion (which then shows as conflict).

## Consequences
- What we gave up: hunks are word-granular, not sentence-aware. The LCS is O(n*m) over tokens, fine for paragraph-sized scopes (scope is capped at 4000 chars).
