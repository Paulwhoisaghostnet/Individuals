# Contributing

Individuals is both an artwork and a long-running system. Changes must preserve the
conceptual causal loop as carefully as they preserve type safety.

## Local setup

Requirements: Node.js 22.12 or newer and npm 10.

```sh
cp .env.example .env
npm ci
npm run dev
```

The public client runs at `http://127.0.0.1:4174`; the private runtime API listens
at `http://127.0.0.1:4175` and is proxied by Vite. Without provider credentials the
runtime uses its procedural cognition fallback.

Before opening a pull request, run:

```sh
npm run check
npm audit --audit-level=high
```

## Change rules

- Put behavior in the domain that owns it. See
  [`docs/architecture/issue-routing.md`](docs/architecture/issue-routing.md).
- Change shared contracts deliberately and test both sides of a boundary.
- Keep the public projection allow-listed; never serialize an internal snapshot.
- Never commit `.env`, provider credentials, curator tokens, `.data/`, captured
  frames, generated portraits, or visitor data.
- A visual change must remain portrait-first and work with motion reduction,
  keyboard navigation, narrow viewports, and a disconnected runtime.
- A cognition, perception, drawing, or feedback change needs a causal test proving
  that its input materially affects the result.
- A persistence change needs corruption and interrupted-write coverage.

## Commit scope

Prefer small commits with one domain-level purpose. Documentation and tests should
ship with the behavior they describe. Generated build output and runtime state do
not belong in commits.
