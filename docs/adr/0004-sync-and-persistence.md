# ADR 0004: BroadcastChannel provider + IndexedDB, no server

Date: 2026-10-03. Status: accepted.

## Context
The brief requires local-first behavior, offline use, and cross-tab sync, and allows a dev-only relay. y-webrtc does not work everywhere.

## Decision
- Write a small `BroadcastChannelProvider` (about 120 lines): a two-step sync (hello with state vector, reply with diff plus own state vector, final diff), live update relay, and awareness relay. It has `connect()` / `disconnect()` so the UI can simulate offline.
- Persistence via `y-indexeddb` (`IndexeddbPersistence`), one database per `?doc=` name.
- Node 24 ships a global `BroadcastChannel`, so the provider is tested in Node with real channels.

## Consequences
- Zero infrastructure; the demo works from a static host.
- What we gave up: sync across devices by default. An optional y-websocket relay (`@y/websocket-server` in Docker, `?relay=ws://localhost:1234`) covers it for demos; see ADR 0009.
