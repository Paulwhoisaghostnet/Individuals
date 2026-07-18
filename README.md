# Individuals

Individuals is a digital art installation about the tension between an ideal self,
a self-perceived identity, and the identity reflected by others.

This repository contains the digital exhibition prototype. It is intentionally
isolated from other applications that may share its host: it has its own build,
container, loopback-bound port, and Docker network.

## Local development

```sh
npm install
npm run dev
```

The exhibition is available at `http://localhost:4174`.

## Production container

```sh
cp .env.example .env
docker compose -f compose.production.yml up -d --build
```

The container binds only to `127.0.0.1:4174` by default. A host-level reverse
proxy can route the eventual public domain to that port without exposing the
container directly.

## Project direction

The first complete prototype will contain three persistent Individuals. Each will
create a self-portrait, perceive and redraw its peers through distinctive visual
constraints, receive a composite peer portrait, and adapt its next self-image.
