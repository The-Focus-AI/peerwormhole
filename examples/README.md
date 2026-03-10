# Examples Overview

The root package is the current file-share product. These example packages are the staged build-up that led to it, and they remain useful for transport, protocol, and UI reference.

Use them in order:

1. `01-direct-chat`
2. `02-room-chat`
3. `03-file-share`
4. `04-local-workspace`
5. `05-slack-lite`

What each step adds:

- `01-direct-chat`: direct peer-to-peer messaging
- `02-room-chat`: multi-peer room broadcast
- `03-file-share`: file transfer on top of the chat protocol
- `04-local-workspace`: local bridge owned by a CLI process
- `05-slack-lite`: channels and a more app-like interface

Each example has:
- `src/` CLI and local web server entrypoints
- `public/` browser app assets
- its own `package.json`
- its own README

## Running From Inside a Package

```bash
cd examples/01-direct-chat
npm run cli
npm run web
```

## Running From Repository Root

```bash
npm run example:01:cli
npm run example:01:web
```

Use the matching `example:0X:*` scripts for the other examples.
