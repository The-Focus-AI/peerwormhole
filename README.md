# Peerwormhole

`peerwormhole` is a wormhole-style file share built on PeerJS/WebRTC. It ships:

- a CLI sender and receiver
- a browser companion that can send and receive
- a static web export path for hosting the browser UI anywhere
- share invites as a compact code, spoken phrase, URL, or QR code

Current constraints:

- one file per share session
- one active receiver per sender
- the invite token encodes the sender peer ID directly
- signaling uses the public PeerJS broker and STUN servers
- file data stays peer-to-peer after signaling

## Requirements

- Node.js 18+
- npm
- internet access for the PeerJS broker and STUN servers
- a modern browser for the web UI
- `BarcodeDetector` support only if you want in-browser camera QR scanning

## Install

Run it directly without installing:

```bash
npx peerwormhole help
```

Install globally if you use it often:

```bash
npm install -g peerwormhole
peerwormhole help
```

Install it into a project and use `npx`:

```bash
npm install peerwormhole
npx peerwormhole help
```

## Quick Start

### Terminal to Terminal

Sender:

```bash
npx peerwormhole send ./path/to/file.pdf
```

The sender prints:

- a share code
- a spoken phrase
- a share URL
- a terminal QR code

Receiver:

```bash
npx peerwormhole receive "<share code, phrase, or URL>"
```

The receiver prompts before accepting the file and saves into `./downloads/` by default. Use `--output-dir` to change that location.

If you omit the invite, `receive` prompts for it interactively.

### Terminal to Browser

Serve the browser companion locally:

```bash
npx peerwormhole web
```

Open `http://127.0.0.1:3106` and either:

- paste the share code, phrase, or URL into the receive panel
- click `Scan QR` and scan the QR printed by the CLI

When the transfer finishes, the browser exposes a download link for the received file.

### Browser to CLI or Browser to Browser

1. Open the web app.
2. Choose a file in the Send panel.
3. Copy the generated code, phrase, URL, or QR.
4. Receive it in another browser tab or with `npx peerwormhole receive "<invite>"`.

The sending browser tab must stay open until the transfer completes.

## Static Web Export

Export a fully static copy of the browser app:

```bash
npx peerwormhole web:export ./dist/share-web
```

The export copies:

- `web/` assets
- `lib/common/` and `lib/web/` browser modules
- vendored `peerjs.min.js`
- a bundled QR helper

Serve that directory from any static host.

If the CLI should print links for your deployed site instead of the default local URL, set:

```bash
export PEERWORMHOLE_WEB_BASE_URL="https://your-host.example/share/"
```

For backward compatibility, the CLI also still reads `NODE_PEERJS_WEB_BASE_URL`.

The browser app itself derives its base URL from the page it is loaded from.

## Commands

Available commands:

- `peerwormhole help`
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

You can also pass `--help` after any command.

## Invite Formats

- share code: compact base64url token
- spoken phrase: checksum-protected word list
- share URL: `?mode=receive&code=...`
- QR code: the same share URL encoded visually

All four forms decode to the sender peer ID.

## JavaScript API

The package also exports a low-level `NodePeer` class for Node-side PeerJS work:

```js
import { NodePeer } from 'peerwormhole';

const peer = new NodePeer();
peer.once('open', (id) => {
  console.log(`Ready as ${id}`);
});

// Later:
await peer.destroy();
```

For the file-sharing workflow, prefer the CLI and web app over this low-level API.

## Repository Development

If you are working from a git clone instead of the published package:

```bash
npm install
npm test
npm start
```

## Examples

Reference examples live in the GitHub repo:

- `01-direct-chat`
- `02-room-chat`
- `03-file-share`
- `04-local-workspace`
- `05-slack-lite`

Start with <https://github.com/The-Focus-AI/peerwormhole/tree/main/examples> if you want the staged build-up instead of the packaged file-share tool.
