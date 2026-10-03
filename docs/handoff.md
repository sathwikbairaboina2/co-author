# Handoff

## 2026-10-03, Claude (Sonnet builder), branch main

- Changed: plan Tasks 1 to 23 built, one commit per task (see `git log --oneline`). Nothing pushed.
- Verified: `pnpm test` (19 files, 102 tests passed), `pnpm typecheck` (ok), `pnpm build` (ok, `dist/sw.js` and `dist/manifest.webmanifest` exist), `pnpm e2e` (2 passed in Chromium), `pnpm bench` (wrote `bench/results.json`), `docker compose up -d --build` (app returned 200 on http://localhost:5175/, `/sw.js` 200, `/ollama/api/tags` 200 with Ollama running on the host and a streamed chat completion through the proxy worked), relay profile (two separate Chromium contexts synced through ws://localhost:1234), and a real Ollama proposal through the Docker proxy with `ai=openai` (7 proposal cards, no error toast).
- Manual checks done with headless Chromium (Playwright): conflict state disables Accept inline and in the panel, accept then Ctrl+Z restores the text, rogue write shows the cobalt block toast and the gate counts 1 blocked, offline in both tabs then reconnect converges, no horizontal scroll at 390px (light and dark) and 1024px.
- Offline PWA reload: from `pnpm preview`, with the service worker ready and the Playwright context set offline, a reload still showed the edited content from IndexedDB.
- Not verified: the README GIF is a placeholder comment because no recording could be made; layout was inspected through screenshots at 1440 and 390 px only.
- Left: stretch items from DEVDOCS Milestones.
- How to verify: `pnpm install && pnpm test && pnpm build && pnpm e2e && pnpm bench`

### Deviations from the plan

1. Task 5, `src/core/gate.ts`: TypeScript 7 rejected the `AbstractType<unknown>` comparison and parameter. Typed `describeType` with `Y.AbstractType<any>` and compared `type !== (suggestions as Y.AbstractType<any>)`. Behavior unchanged.
2. Task 9, `src/ai/sse.ts`: `body.pipeThrough(new TextDecoderStream())` did not typecheck under TS 7 (BufferSource vs Uint8Array). Replaced with a manual `TextDecoder` using `decode(value, { stream: true })` and a final `decode()`. Same behavior, tests unchanged and passing.
3. Task 19, `package.json`: added `workbox-window` as a devDependency. `virtual:pwa-register` could not resolve it under pnpm and the build failed. `pnpm-lock.yaml` changed accordingly.
4. Task 20, `src/editor/createEditor.ts`: the plan's `const view = new EditorView(...)` with `dispatchTransaction` referring to `view` threw "Cannot access 'view' before initialization" at runtime, because ySyncPlugin dispatches during construction. This crashed the whole editor and was invisible to vitest. Fixed by using `this` inside `dispatchTransaction(this: EditorView, tr)`. Found by the e2e run.
5. Task 20, `e2e/happy-path.spec.ts` second test: the h1 wraps to two lines, so `End` only reached the end of the first visual line and the plan's `knock first now` assertion could not hold. The test now presses `Control+End` and asserts `when you reconnect. now` in the second tab. The intent (typing in tab A appears in tab B) is unchanged.
6. Task 21, `bench/run.ts`: the plan's fingerprint serialized the raw encoded state vector and map JSON, which depend on per-replica insertion order, so the convergence check failed for peers=2 although the replicas were equal. The fingerprint now sorts the decoded state vector and canonicalizes map key order. The check still compares text, suggestions, resolved and state vector, and still throws on divergence.
7. Task 22, `docker-compose.yml`: `@y/websocket-server@0.1.5` crashes on the first sync with `TypeError: store.getClock is not a function` (it mixes the `@y/y` and `yjs` packages). The relay now runs `npx -y y-websocket@2.1.0`, which still ships the server binary and syncs correctly with the `y-websocket` 3.x client used by the app.

## 2026-10-03, Claude (Opus review), branch main

- Changed: reviewed the builder's 24 commits against the spec; fixed stale relay package references in ADR 0004 and 0009 (docs only). No code changes needed.
- Verified independently: `pnpm test` (19 files, 102 tests passed), `pnpm build` (ok, `dist/sw.js` generated), `pnpm e2e` (2 passed, Chromium). Bench numbers in README match `bench/results.json`.
- Not run by the reviewer: Docker compose and `pnpm bench` (the builder ran them, see its entry above).
- Left: record the README GIF; stretch items in DEVDOCS Milestones (remote-tab gating, double-accept dedup, multi-block suggestions, npm package for the core).
- How to verify: `pnpm install && pnpm test && pnpm build && pnpm e2e && pnpm bench`

## 2026-10-04, Claude (Sonnet builder), branch main

- Changed: host ports moved into 5490-5499 (ADR 0010): dev, preview and e2e 5490, Docker app 5491 (container still 5175), relay 5492 (container 1234), demo recording 5493, spare 5494. Compose project is named `co-author`. Playwright takes `E2E_PORT` and never reuses a foreign server. Added `pnpm demo:record` (two peers plus an AI suggestion, mock model) and `pnpm demo:gif` (ffmpeg), `docs/demo.gif` at the top of the README, and `.github/workflows/ci.yml` (actionlint clean).
- Measured: `pnpm test` 19 files, 102 passed. `pnpm build` ok. `pnpm e2e` 2 passed (also with `E2E_PORT=5494`). GIF is 2,649,290 bytes, 10.6 s. Docker app returned 200 on http://localhost:5491 (and 200 on `/ollama/api/tags`) as `co-author-app-1`, then stopped.
- Not run: the CI workflow on GitHub (no remote), a GIF recording against a real Ollama model.
- Left for the user: GitHub remote and push, a LICENSE, an optional Ollama-backed re-record, DEVDOCS stretch milestones. Existing IndexedDB documents from the old localhost:5175 origin do not appear on 5490.
- How to verify: `pnpm install && pnpm test && pnpm build && pnpm e2e`, then `pnpm demo:record && pnpm demo:gif` (needs ffmpeg).

## 2026-10-04, Claude (Opus verify), branch main

- Changed: confirmed the two review fixes in `5b86762`. Destroy clears local awareness before the channel closes. A `bye` removes every awareness state that tab announced. `pagehide` sends a `bye`. A peer whose states time out drops from the tab count. Re-recorded `docs/demo.gif` shows exactly 2 humans and 2 Co-author peers and "2 tabs connected" in both rails (checked on the last frame). Rewrote `docs/DEVDOCS.md` as a short developer guide. Fixed the README test count (20 files, 109 tests) and added the ADR 0010 link.
- Measured: `pnpm test` 20 files, 109 passed. `pnpm build` ok (`dist/sw.js` generated). `pnpm e2e` 2 passed in Chromium. `docs/demo.gif` is 2,744,775 bytes (limit 5,242,880), 12.0 s.
- Not run in this pass: `pnpm bench` (numbers unchanged from 2026-10-03), Docker compose, the CI workflow (no remote).
- Left for the user: GitHub remote and push, a LICENSE, a hosted demo, an optional Ollama-backed GIF. Stretch items are listed in DEVDOCS section 7.
- How to verify: `pnpm install && pnpm test && pnpm build && pnpm e2e`.
