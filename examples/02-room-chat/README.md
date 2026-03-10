# 02 Room Chat

Builds on example 01 by broadcasting chat across multiple connected peers.

## What It Adds Over 01

- multi-peer room mesh
- join/leave presence events
- room-wide broadcast behavior in CLI and browser

## Run

From this directory:

```bash
npm run cli
npm run web
```

From repo root:

```bash
npm run example:02:cli
npm run example:02:web
```

Web UI runs at `http://127.0.0.1:3102`.

## CLI Commands

- `/connect <peer-id>` connect to another room participant
- `/peers` list connected peers
- `/quit` exit

Any non-command line is broadcast to the room.

## Browser Flow

1. Open multiple browser tabs or mix browser + CLI.
2. Connect peers using IDs.
3. Send room messages and observe presence updates.
