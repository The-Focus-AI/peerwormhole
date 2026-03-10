# 05 Slack Lite

Builds on local workspace mode and adds channels and a more app-like interface.

## What It Adds Over 04

- channel model (`#general`, `#ops`, `#random`)
- channel switching in browser and CLI
- Slack-style split-pane UI
- slash command-driven CLI workflow

## Run

From this directory:

```bash
npm run cli
npm run web
```

From repo root:

```bash
npm run example:05:cli
npm run example:05:web
```

Web UI runs at `http://127.0.0.1:3105`.

## Modes

- `npm run cli`: starts terminal interface and local bridge
- `npm run web`: starts only local web host/bridge

## CLI Commands

- `/connect <peer-id>` connect to remote peer
- `/channels` show channels
- `/join <channel>` switch channel
- `/send <path>` share file in current channel
- `/peers` list peers
- `/quit` exit

Any non-command line is posted to the current channel.

## Storage

Files are saved to:

- `examples/05-slack-lite/downloads/`
