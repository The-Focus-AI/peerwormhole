# 01 Direct Chat

Baseline example: one direct message target at a time.

## What It Demonstrates

- browser peer can connect to CLI peer
- shared message schema between web and CLI
- local static hosting for the browser app

## Run

From this directory:

```bash
npm run cli
npm run web
```

From repo root:

```bash
npm run example:01:cli
npm run example:01:web
```

Web UI runs at `http://127.0.0.1:3101`.

## CLI Commands

- `/connect <peer-id>` connect to a peer
- `/to <peer-id>` switch active direct message target
- `/peers` list current connections
- `/quit` exit

## Browser Flow

1. Open the web URL.
2. Copy the browser peer ID.
3. Connect from CLI or another browser tab.
4. Send direct messages.
