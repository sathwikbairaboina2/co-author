# ADR 0010: Host ports 5490-5499

Date: 2026-10-04. Status: accepted.

## Context
The workspace runs 20 repos at once and gives co-author the host port range 5490-5499. The earlier setup used host port 5175 for dev, preview, e2e and Docker, and 1234 for the relay, which collide with sibling repos.

## Decision
- 5490: dev server, preview and the default e2e server.
- 5491: Docker app on the host side. nginx still listens on 5175 inside the container.
- 5492: relay on the host side. The container keeps 1234.
- 5493: demo recording server (`pnpm demo:record`).
- 5494: spare, used to prove the `E2E_PORT` override works.
- `docker-compose.yml` sets `name: co-author`, so containers are `co-author-app-1` and `co-author-relay-1`.
- Playwright never reuses an existing server, so a foreign process on the port cannot be tested by mistake.

## Consequences
- What we gave up: IndexedDB is per origin, so documents saved under the old `localhost:5175` origin do not show up on `localhost:5490`.
