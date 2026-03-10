# 03 File Share

Builds on room chat and adds chunked file transfer.

## What It Adds Over 02

- file metadata + chunk + completion protocol messages
- browser drag/drop and file picker uploads
- CLI file sending with `/send <path>`
- transfer progress tracking

## Run

From this directory:

```bash
npm run cli
npm run web
```

From repo root:

```bash
npm run example:03:cli
npm run example:03:web
```

Web UI runs at `http://127.0.0.1:3103`.

## CLI Commands

- `/connect <peer-id>` connect to a peer
- `/peers` list peers
- `/send <path>` send file to connected peers
- `/quit` exit

Any non-command line is sent as chat.

## Storage

Files received by the CLI are saved to:

- `examples/03-file-share/downloads/`
