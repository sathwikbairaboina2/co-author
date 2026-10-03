# ADR 0009: Docker compose for the built app, optional relay, same-origin Ollama proxy

Date: 2026-10-03. Status: accepted.

## Context
The user's rule: everything runs on Docker. Co-author is a static PWA, so "running" means serving the built files. Browsers calling `http://localhost:11434` directly hit CORS and origin checks, and a container cannot reach the host's loopback by that name.

## Decision
- `Dockerfile`: multi-stage. `node:24-alpine` with corepack pnpm builds `dist/`; `nginx:1.29-alpine` serves it on port 5175 with an SPA fallback.
- `deploy/nginx.conf` proxies `/ollama/` to `http://host.docker.internal:11434/` with buffering off (for streaming) and the `Origin` header cleared. The compose service maps `host.docker.internal:host-gateway`.
- In dev, Vite proxies `/ollama` to `http://localhost:11434` the same way. So the default OpenAI-compatible base URL is the relative path `/ollama/v1`, which works in dev, in Docker and in preview. Users can still enter an absolute URL in Settings.
- `docker-compose.yml` has two services: `app` (always) and `relay` (profile `relay`: `node:24-alpine` running the `y-websocket@2.1.0` server on port 1234; `@y/websocket-server@0.1.5` was tried first and crashes on first sync with `store.getClock is not a function`). The relay is published on host port 5492 (container port stays 1234). The client connects only when the URL has `?relay=ws://localhost:5492`.
- No AWS services are used, so LocalStack is not needed.
- The default model mode on first run is the mock, so the public demo works with no Ollama. Settings switches to the OpenAI-compatible backend (default Ollama, `qwen3.8:27b`).

## Consequences
- `docker compose up --build` gives a production-like build on http://localhost:5491 (host port 5491 maps to the container port 5175; see ADR 0010).
- What we gave up: if the host Ollama binds only to 127.0.0.1 and Docker Desktop cannot reach it via `host.docker.internal`, the user must set `OLLAMA_HOST=0.0.0.0`. This is documented in the README.
