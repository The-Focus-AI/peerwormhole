import readline from 'readline';
import { NodeMesh } from '../../shared/node/mesh.js';
import { createChatMessage, createUser, formatPeerLabel } from '../../shared/common/protocol.js';

function parseArgs(argv) {
  let name = 'CLI Operator';
  let targetPeerId = '';

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--name') {
      name = argv[index + 1] || name;
      index += 1;
      continue;
    }

    if (!targetPeerId) {
      targetPeerId = value;
    }
  }

  return { name, targetPeerId };
}

const { name, targetPeerId } = parseArgs(process.argv.slice(2));
const user = createUser(name, 'cli');
const mesh = new NodeMesh({ user });
let activePeerId = targetPeerId;

function printHelp() {
  console.log('Commands:');
  console.log('  /connect <peer-id>   connect to a peer');
  console.log('  /to <peer-id>        switch the active direct message target');
  console.log('  /peers               list connected peers');
  console.log('  /quit                exit');
  console.log('');
}

function printPeers() {
  const peers = mesh.listPeers();
  if (peers.length === 0) {
    console.log('No connected peers yet.');
    return;
  }

  for (const peer of peers) {
    const marker = peer.peerId === activePeerId ? '*' : ' ';
    console.log(`${marker} ${formatPeerLabel(peer.peerId, peer.user)}`);
  }
}

mesh.on('peer-open', ({ peerId }) => {
  activePeerId ||= peerId;
  console.log(`Connected socket: ${peerId}`);
});

mesh.on('peer-user', ({ peerId, user: peerUser }) => {
  activePeerId ||= peerId;
  console.log(`Peer ready: ${formatPeerLabel(peerId, peerUser)}`);
});

mesh.on('peer-close', ({ peerId, user: peerUser }) => {
  console.log(`Peer disconnected: ${formatPeerLabel(peerId, peerUser)}`);
  if (activePeerId === peerId) {
    activePeerId = '';
  }
});

mesh.on('message', ({ peerId, user: peerUser, message }) => {
  if (message.type !== 'chat') {
    return;
  }

  const label = formatPeerLabel(peerId, peerUser || message.user);
  console.log(`[${new Date(message.sentAt).toLocaleTimeString()}] ${label}: ${message.text}`);
});

mesh.on('error', (error) => {
  console.error(`Peer error: ${error.message}`);
});

async function main() {
  const peerId = await mesh.start();
  console.log(`Your peer ID: ${peerId}`);
  console.log(`Name: ${user.name}`);
  printHelp();

  if (targetPeerId) {
    mesh.connectTo(targetPeerId);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', (line) => {
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
      activePeerId = trimmed.slice('/connect '.length).trim();
      mesh.connectTo(activePeerId);
      console.log(`Connecting to ${activePeerId}...`);
      return;
    }

    if (trimmed.startsWith('/to ')) {
      activePeerId = trimmed.slice('/to '.length).trim();
      console.log(`Active peer set to ${activePeerId}`);
      return;
    }

    if (!activePeerId) {
      console.log('No active peer. Use /connect <peer-id> first.');
      return;
    }

    const message = createChatMessage({
      user,
      text: trimmed
    });
    mesh.sendTo(activePeerId, message);
    console.log(`[${new Date(message.sentAt).toLocaleTimeString()}] You -> ${activePeerId}: ${message.text}`);
  });

  rl.on('close', async () => {
    await mesh.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => rl.close());
}

main();
