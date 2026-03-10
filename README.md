# Peerwormhole

`peerwormhole` is a wormhole-style file share built on PeerJS/WebRTC. It ships a CLI sender/receiver, a static browser companion that can also send and receive, and a static export path so the browser UI can be hosted on any static site.

- one file per share session
- one active receiver per sender
- share invite exposed as a compact code, a spoken phrase, a URL, or a QR code
- direct peer-to-peer transfer after PeerJS/WebRTC signaling

The invite token currently encodes the sender peer ID directly. There is no custom rendezvous backend and no transfer relay in the data path.

## Requirements

- Node.js 18+
- npm
- internet access for the PeerJS broker and STUN servers
- a modern browser for the web UI
- `BarcodeDetector` support only if you want in-browser camera QR scanning

## Install

```bash
npm install
```

After install, use either the package binary or the repo scripts:

```bash
npx peerwormhole help
npx peerdrop help
```

```bash
npm run share:send -- ./path/to/file.pdf
npm run share:receive -- "<share code, phrase, or URL>"
```

## Quick Start

### CLI to CLI

Sender:

```bash
npm run share:send -- ./path/to/file.pdf
```

The sender prints:

- a share code
- a spoken phrase
- a share URL
- a terminal QR code

Receiver:

```bash
npm run share:receive -- "<share code, phrase, or URL>"
```

The receiver prompts before accepting the file and saves into `./downloads/` by default. Use `--output-dir` to change that location.

### CLI to Browser

Serve the browser companion locally:

```bash
npm start
```

Open `http://127.0.0.1:3106` and either:

- paste the share code, phrase, or URL into the receive panel
- click `Scan QR` and scan the QR printed by the CLI

When the transfer finishes, the browser exposes a download link for the received file.

### Browser to CLI or Browser to Browser

1. Open the web app.
2. Choose a file in the Send panel.
3. Copy the generated code, phrase, URL, or QR.
4. Receive it in another browser tab or with `npm run share:receive -- "<invite>"`.

The sending browser tab must stay open until the transfer completes.

## Static Web Export

Export a fully static copy of the browser app:

```bash
npm run share:web:export -- ./dist/share-web
```

The export copies:

- `web/` assets
- `lib/common/` and `lib/web/` browser modules
- vendored `peerjs.min.js`
- a bundled QR helper

Serve that directory from any static host:

```bash
npx live-server ./dist/share-web
```

If the CLI should print links for your deployed site instead of the default local URL, set:

```bash
export PEERWORMHOLE_WEB_BASE_URL="https://your-host.example/share/"
```

For backward compatibility, the CLI also still reads `NODE_PEERJS_WEB_BASE_URL`.

The browser app itself derives its base URL from the page it is loaded from.

## Commands

Binary names:

- `peerwormhole`
- `peerdrop`

Available commands:

- `peerwormhole send <file> [--name <name>] [--web-base-url <url>]`
- `peerwormhole receive [code-or-url] [--name <name>] [--output-dir <dir>]`
- `peerwormhole web [--port <port>]`
- `peerwormhole web:export <dir>`

Defaults and behavior:

- `web` binds to `127.0.0.1:3106`
- `receive` writes to `./downloads/`
- `--name` controls the display name shown to the remote peer
- `--web-base-url` changes the URL embedded in the sender output and QR
- only the first receiver is accepted for a given send session

Useful package scripts:

- `npm test`
- `npm start`
- `npm run share:send -- ./path/to/file.pdf`
- `npm run share:receive -- "<invite>"`
- `npm run share:web`
- `npm run share:web:export -- ./dist/share-web`

## Invite Formats

- share code: compact base64url token
- spoken phrase: checksum-protected word list
- share URL: `?mode=receive&code=...`
- QR code: the same share URL encoded visually

All four forms decode to the sender peer ID.

## Repo Layout

- `bin/peerwormhole.js`: CLI entrypoint
- `web/`: static browser UI
- `lib/common/`: shared protocol, invite, and transfer logic
- `lib/node/`: Node runtime helpers, mesh, and web export/server code
- `lib/web/`: browser runtime helpers and mesh
- `examples/`: step-by-step reference apps

## Examples

The current package entrypoint lives in `bin/peerwormhole.js`, but the earlier example ladder is still available as a reference path:

- `01-direct-chat`
- `02-room-chat`
- `03-file-share`
- `04-local-workspace`
- `05-slack-lite`

Start with `examples/README.md` if you want the staged build-up instead of the packaged file-share tool.
