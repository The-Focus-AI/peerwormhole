import readline from 'readline';
import { readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WorkspaceBridge } from '../../shared/node/workspace-bridge.js';

const CHANNELS = ['general', 'ops', 'random'];

function parseArgs(argv) {
  let name = 'Slack Lite CLI';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const downloadsDir = join(resolve(__dirname, '..'), 'downloads');
const { name, peerIds } = parseArgs(process.argv.slice(2));

const bridge = new WorkspaceBridge({
  publicDir,
  downloadsDir,
  name: 'Slack Lite',
  userName: name,
  channels: CHANNELS
});

function printEntry(entry) {
  const prefix = entry.channel ? `#${entry.channel}` : '#general';
  if (entry.kind === 'chat') {
    console.log(`[${prefix}] ${entry.user.name}: ${entry.text}`);
    return;
  }

  console.log(`[${prefix}] ${entry.text}`);
}

async function handleSlashCommand(line) {
  if (line === '/quit') {
    return 'quit';
  }

  if (line === '/peers') {
    for (const peer of bridge.mesh.listPeers()) {
      console.log(`- ${peer.user?.name || 'Unknown'} (${peer.peerId})`);
    }
    return 'handled';
  }

  if (line === '/channels') {
    console.log(`Channels: ${CHANNELS.map((channel) => `#${channel}`).join(', ')}`);
    return 'handled';
  }

  if (line.startsWith('/connect ')) {
    await bridge.connect(line.slice('/connect '.length).trim());
    return 'handled';
  }

  if (line.startsWith('/join ')) {
    bridge.currentChannel = line.slice('/join '.length).trim().replace(/^#/, '') || bridge.currentChannel;
    await bridge.sendSystem(`Switched to #${bridge.currentChannel}`, bridge.currentChannel);
    bridge.publishState();
    return 'handled';
  }

  if (line.startsWith('/send ')) {
    const filePath = line.slice('/send '.length).trim();
    const buffer = await readFile(filePath);
    await bridge.sendFileBuffer({
      fileName: filePath.split('/').pop(),
      buffer,
      channel: bridge.currentChannel
    });
    return 'handled';
  }

  return 'unhandled';
}

async function main() {
  await bridge.loadExistingDownloads();
  bridge.onRecord((entry) => {
    printEntry(entry);
  });

  const { peerId, url } = await bridge.start({ port: 3105 });
  console.log(`Slack Lite peer ID: ${peerId}`);
  console.log(`Web UI: ${url}`);
  console.log('Commands: /connect <peer-id>, /channels, /join <channel>, /send <path>, /peers, /quit');

  for (const targetPeerId of peerIds) {
    await bridge.connect(targetPeerId);
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

    const result = await handleSlashCommand(trimmed);
    if (result === 'quit') {
      rl.close();
      return;
    }
    if (result === 'handled') {
      return;
    }

    await bridge.sendChat(trimmed, bridge.currentChannel);
  });

  rl.on('close', async () => {
    await bridge.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => rl.close());
}

main();
