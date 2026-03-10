# 04 Local Workspace

Architecture shift: the CLI process owns the peer connection and exposes a local web control panel.

## What It Adds Over 03

- local HTTP + SSE bridge between CLI and browser
- browser actions route through the local CLI companion
- download list persisted through local files

## Run

From this directory:

```bash
npm run cli
npm run web
```

From repo root:

```bash
npm run example:04:cli
npm run example:04:web
```

Web UI runs at `http://127.0.0.1:3104`.

## Modes

- `npm run cli`: starts terminal interface and local web bridge together
- `npm run web`: starts only the local web host/bridge process

## CLI Commands

- `/connect <peer-id>` connect local CLI peer to remote peer
- `/send <path>` relay file through local CLI peer
- `/peers` list peers
- `/quit` exit

Any non-command line is sent as chat via the local bridge.

## Storage

Files are saved to:

- `examples/04-local-workspace/downloads/`
