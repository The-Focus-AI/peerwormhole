import readline from 'readline';
import { NodeMesh } from '../../shared/node/mesh.js';
import { createChatMessage, createUser, formatPeerLabel } from '../../shared/common/protocol.js';

function parseArgs(argv) {
  let name = 'CLI Host';
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

function printPeers() {
  const peers = mesh.listPeers();
  if (peers.length === 0) {
    console.log('No connected peers.');
    return;
  }

  console.log('Room peers:');
  for (const peer of peers) {
    console.log(`- ${formatPeerLabel(peer.peerId, peer.user)}`);
  }
}

mesh.on('peer-user', ({ peerId, user: peerUser }) => {
  console.log(`+ ${formatPeerLabel(peerId, peerUser)} joined`);
});

mesh.on('peer-close', ({ peerId, user: peerUser }) => {
  console.log(`- ${formatPeerLabel(peerId, peerUser)} left`);
});

mesh.on('message', ({ peerId, user: peerUser, message }) => {
  if (message.type !== 'chat') {
    return;
  }

  console.log(`[${new Date(message.sentAt).toLocaleTimeString()}] ${formatPeerLabel(peerId, peerUser || message.user)}: ${message.text}`);
});

mesh.on('error', (error) => {
  console.error(`Peer error: ${error.message}`);
});

async function main() {
  const peerId = await mesh.start();
  console.log(`Your peer ID: ${peerId}`);
  console.log(`Name: ${user.name}`);
  console.log('Commands: /connect <peer-id>, /peers, /quit');

  for (const targetPeerId of peerIds) {
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
      const targetPeerId = trimmed.slice('/connect '.length).trim();
      mesh.connectTo(targetPeerId);
      console.log(`Connecting to ${targetPeerId}...`);
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
