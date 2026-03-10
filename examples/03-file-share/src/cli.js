import readline from 'readline';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { NodeMesh } from '../../shared/node/mesh.js';
import { createChatMessage, createUser, formatPeerLabel, sanitizeFileName } from '../../shared/common/protocol.js';
import { createTransferAssembler, sendBufferChunks } from '../../shared/common/transfers.js';

const exampleDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const downloadsDir = join(exampleDir, 'downloads');

function parseArgs(argv) {
  let name = 'CLI Courier';
  const peerIds = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--name') {
      name = argv[index + 1] || name;
      index += 1;
      continue;
    }
    peerIds.push(value);
  }

  return { name, peerIds };
}

const { name, peerIds } = parseArgs(process.argv.slice(2));
const user = createUser(name, 'cli');
const mesh = new NodeMesh({ user });

const transfers = createTransferAssembler({
  onStart: ({ meta, context }) => {
    console.log(`Receiving ${meta.name} from ${formatPeerLabel(context.peerId, context.user || meta.user)}...`);
  },
  onProgress: ({ meta, progress }) => {
    console.log(`Receiving ${meta.name}: ${progress}%`);
  },
  onComplete: async ({ meta, bytes, context }) => {
    const savedName = `${Date.now()}-${sanitizeFileName(meta.name)}`;
    const targetPath = join(downloadsDir, savedName);
    await writeFile(targetPath, bytes);
    console.log(`Saved ${meta.name} from ${formatPeerLabel(context.peerId, context.user || meta.user)} to ${targetPath}`);
  },
  onError: (error) => {
    console.error(`Transfer error: ${error.message}`);
  }
});

function printPeers() {
  const peers = mesh.listPeers();
  if (peers.length === 0) {
    console.log('No connected peers.');
    return;
  }

  console.log('Connected peers:');
  for (const peer of peers) {
    console.log(`- ${formatPeerLabel(peer.peerId, peer.user)}`);
  }
}

async function sendFile(filePath) {
  const bytes = await readFile(filePath);
  const fileName = basename(filePath);
  const peers = mesh.listPeers();

  if (peers.length === 0) {
    console.log('No peers connected. Connect first, then send.');
    return;
  }

  for (const peer of peers) {
    const connection = mesh.connections.get(peer.peerId);
    await sendBufferChunks(connection, {
      buffer: bytes,
      fileName,
      user
    });
    console.log(`Sent ${fileName} to ${formatPeerLabel(peer.peerId, peer.user)}`);
  }
}

mesh.on('peer-user', ({ peerId, user: peerUser }) => {
  console.log(`+ ${formatPeerLabel(peerId, peerUser)} joined`);
});

mesh.on('peer-close', ({ peerId, user: peerUser }) => {
  console.log(`- ${formatPeerLabel(peerId, peerUser)} left`);
});

mesh.on('message', ({ peerId, user: peerUser, message }) => {
  if (transfers.handleMessage(message, { peerId, user: peerUser })) {
    return;
  }

  if (message.type !== 'chat') {
    return;
  }

  console.log(`[${new Date(message.sentAt).toLocaleTimeString()}] ${formatPeerLabel(peerId, peerUser || message.user)}: ${message.text}`);
});

mesh.on('error', (error) => {
  console.error(`Peer error: ${error.message}`);
});

async function main() {
  await mkdir(downloadsDir, { recursive: true });
  const peerId = await mesh.start();
  console.log(`Your peer ID: ${peerId}`);
  console.log(`Name: ${user.name}`);
  console.log('Commands: /connect <peer-id>, /peers, /send <path>, /quit');

  for (const targetPeerId of peerIds) {
    mesh.connectTo(targetPeerId);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === '/quit') {
      rl.close();
      return;
    }

    if (trimmed === '/peers') {
      printPeers();
      return;
    }

    if (trimmed.startsWith('/connect ')) {
      const targetPeerId = trimmed.slice('/connect '.length).trim();
      mesh.connectTo(targetPeerId);
      console.log(`Connecting to ${targetPeerId}...`);
      return;
    }

    if (trimmed.startsWith('/send ')) {
      const filePath = trimmed.slice('/send '.length).trim();
      try {
        await sendFile(filePath);
      } catch (error) {
        console.error(`Send failed: ${error.message}`);
      }
      return;
    }

    const message = createChatMessage({
      user,
      text: trimmed
    });
    mesh.broadcast(message);
    console.log(`[${new Date(message.sentAt).toLocaleTimeString()}] You: ${message.text}`);
  });

  rl.on('close', async () => {
    await mesh.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => rl.close());
}

main();
