#!/usr/bin/env node
import os from 'os';
import readline from 'readline/promises';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { createUser, sanitizeFileName } from '../lib/common/protocol.js';
import { formatBytes, getMimeType } from '../lib/common/format.js';
import { createShareUrl, parseShareInput } from '../lib/common/share-code.js';
import { ShareReceiver, ShareSender } from '../lib/common/share-session.js';
import { NodeMesh } from '../lib/node/mesh.js';
import { exportShareWebApp, startShareWebServer } from '../lib/node/web-app.js';

const DEFAULT_WEB_BASE_URL =
  process.env.PEERWORMHOLE_WEB_BASE_URL ||
  process.env.NODE_PEERJS_WEB_BASE_URL ||
  'http://127.0.0.1:3106/';

async function getVersion() {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  return pkg.version;
}

function printUsage() {
  console.log(`Usage:
  peerwormhole send <file> [--name <name>] [--web-base-url <url>] [--verbose]
  peerwormhole receive [code-or-url] [--name <name>] [--output-dir <dir>] [--verbose]
  peerwormhole web [--port <port>]
  peerwormhole web:export <dir>
  peerwormhole --version
`);
}

function parseArgv(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h') {
      options.help = true;
      continue;
    }

    if (value === '-v' || value === '-V') {
      options.version = true;
      continue;
    }

    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }

    const name = value.slice(2);
    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      options[name] = true;
      continue;
    }

    options[name] = nextValue;
    index += 1;
  }

  return {
    positionals,
    options
  };
}

function getUserName(options, fallback) {
  return options.name || fallback || os.userInfo().username || 'CLI User';
}

function wrapPhrase(phrase) {
  const words = phrase.split(' ');
  const rows = [];
  for (let index = 0; index < words.length; index += 4) {
    rows.push(words.slice(index, index + 4).join(' '));
  }
  return rows.join('\n');
}

function createProgressLogger(prefix) {
  let lastBucket = -1;
  return ({ progress, fileName }) => {
    const bucket = progress === 100 ? 10 : Math.floor(progress / 10);
    if (bucket === lastBucket) {
      return;
    }

    lastBucket = bucket;
    console.log(`${prefix} ${fileName}: ${progress}%`);
  };
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function renderTerminalQr(text) {
  return QRCode.toString(text, {
    type: 'terminal',
    small: true,
    margin: 1
  });
}

async function runSend(positionals, options) {
  const filePath = positionals[1];
  if (!filePath) {
    throw new Error('Missing file path.');
  }

  const verbose = !!options.verbose;
  const absolutePath = resolve(filePath);
  const buffer = await readFile(absolutePath);
  const fileName = basename(absolutePath);
  const mimeType = getMimeType(fileName);
  const user = createUser(getUserName(options, 'CLI Sender'), 'cli');
  const debug = verbose ? 2 : 0;
  const mesh = new NodeMesh({ user, debug });

  if (verbose) {
    mesh.on('error', (err) => console.error('[verbose] mesh error:', err.message || err));
  }

  console.log('Connecting to signaling server...');
  const sender = new ShareSender({
    mesh,
    user,
    buffer,
    fileName,
    mimeType
  });
  const cleanup = async () => {
    sender.stop();
    await mesh.stop();
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(1);
  });

  await mesh.start();
  if (verbose) {
    console.log('[verbose] Connected to signaling server');
  }
  const invite = sender.createInvite();
  const webBaseUrl = options['web-base-url'] || DEFAULT_WEB_BASE_URL;
  const shareUrl = createShareUrl(webBaseUrl, invite.code);
  const qr = await renderTerminalQr(shareUrl);

  console.log(`Ready to send ${fileName} (${formatBytes(buffer.byteLength)})`);
  if (verbose) {
    console.log(`Peer ID: ${invite.peerId}`);
  }
  console.log(`Share code: ${invite.code}`);
  console.log('Speak this phrase:');
  console.log(wrapPhrase(invite.phrase));
  console.log(`Share URL: ${shareUrl}`);
  console.log('QR code:');
  console.log(qr);
  console.log('Waiting for a receiver...');

  sender.on('offer', ({ peerId }) => {
    console.log(`Receiver connected${verbose ? ': ' + peerId : ''}`);
  });
  sender.on('accepted', ({ peerId, user: receiverUser }) => {
    console.log(`Receiver accepted. Sending...`);
  });
  sender.on('rejected', ({ reason }) => {
    console.log(`Receiver declined: ${reason}`);
  });
  sender.on('progress', createProgressLogger('Sending'));

  await new Promise((resolvePromise, reject) => {
    sender.on('complete', async () => {
      console.log('Transfer complete.');
      await cleanup();
      resolvePromise();
    });
    sender.on('error', async (error) => {
      await cleanup();
      reject(error);
    });
  });
}

async function runReceive(positionals, options) {
  let shareInput = positionals[1];
  if (!shareInput) {
    shareInput = (await prompt('Enter the share code, phrase, or URL: ')).trim();
  }

  const verbose = !!options.verbose;
  const parsed = parseShareInput(shareInput);
  const outputDir = resolve(options['output-dir'] || join(process.cwd(), 'downloads'));
  await mkdir(outputDir, { recursive: true });

  const user = createUser(getUserName(options, 'CLI Receiver'), 'cli');
  const debug = verbose ? 2 : 0;
  const mesh = new NodeMesh({ user, debug });
  const receiver = new ShareReceiver({ mesh });
  const cleanup = async () => {
    receiver.stop();
    await mesh.stop();
  };

  if (verbose) {
    mesh.on('error', (err) => console.error('[verbose] mesh error:', err.message || err));
  }

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(1);
  });

  console.log('Connecting to signaling server...');
  const logReceiveProgress = createProgressLogger('Receiving');
  receiver.on('connected', () => {
    console.log(`Connected to sender. Waiting for offer...`);
  });
  receiver.on('progress', ({ meta, progress }) => {
    logReceiveProgress({
      progress,
      fileName: meta.name
    });
  });

  await mesh.start();
  if (verbose) {
    console.log('[verbose] Connected to signaling server');
  }
  console.log('Connecting to sender...');
  receiver.connectTo(parsed.peerId);

  await new Promise((resolvePromise, reject) => {
    let localDecline = false;

    receiver.on('offer', async (offer) => {
      const answer = (await prompt(`Accept ${offer.fileName} (${formatBytes(offer.size)}) from ${offer.user?.name || offer.peerId}? [Y/n] `)).trim().toLowerCase();
      if (answer && answer !== 'y' && answer !== 'yes') {
        localDecline = true;
        receiver.reject('Receiver declined the transfer.');
        return;
      }

      receiver.accept();
      console.log('Transfer accepted. Receiving...');
    });

    receiver.on('transfer-start', ({ meta }) => {
      if (verbose) {
        console.log(`[verbose] Transfer started: ${meta.name} (${meta.totalChunks} chunks)`);
      }
    });

    receiver.on('complete', async ({ meta, bytes }) => {
      const targetPath = join(outputDir, `${Date.now()}-${sanitizeFileName(meta.name)}`);
      await writeFile(targetPath, bytes);
      console.log(`Saved ${meta.name} to ${targetPath}`);
      await cleanup();
      resolvePromise();
    });

    receiver.on('rejected', async ({ reason }) => {
      await cleanup();
      if (localDecline) {
        console.log(reason);
        resolvePromise();
        return;
      }
      console.error(reason);
      reject(new Error(reason));
    });

    receiver.on('error', async (error) => {
      await cleanup();
      reject(error);
    });
  });
}

async function runWeb(positionals, options) {
  const port = Number(options.port || 3106);
  const server = await startShareWebServer({ port });
  console.log(`Share web app: ${server.url}`);
  console.log('Press Ctrl+C to stop.');
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

async function runWebExport(positionals) {
  const targetDir = positionals[1];
  if (!targetDir) {
    throw new Error('Missing export directory.');
  }

  const result = await exportShareWebApp(targetDir);
  console.log(`Exported static web app to ${result.outputDir}`);
  console.log(`Open ${result.entrypoint} or serve the directory with any static host.`);
}

async function main() {
  const { positionals, options } = parseArgv(process.argv.slice(2));
  const command = positionals[0];

  if (options.version || command === 'version') {
    console.log(`peerwormhole ${await getVersion()}`);
    return;
  }

  if (!command || command === '--help' || command === 'help' || options.help) {
    printUsage();
    return;
  }

  if (command === 'send') {
    await runSend(positionals, options);
    process.exit(0);
    return;
  }

  if (command === 'receive') {
    await runReceive(positionals, options);
    process.exit(0);
    return;
  }

  if (command === 'web') {
    await runWeb(positionals, options);
    return;
  }

  if (command === 'web:export') {
    await runWebExport(positionals, options);
    process.exit(0);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
