import readline from 'readline';
import { readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WorkspaceBridge } from '../../shared/node/workspace-bridge.js';

function parseArgs(argv) {
  let name = 'Workspace CLI';
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
  name: 'Local Workspace',
  userName: name
});

function printEntry(entry) {
  if (entry.kind === 'chat') {
    console.log(`[${new Date(entry.sentAt).toLocaleTimeString()}] ${entry.user.name}: ${entry.text}`);
    return;
  }

  if (entry.kind === 'file') {
    console.log(`[${new Date(entry.sentAt).toLocaleTimeString()}] ${entry.text}`);
    return;
  }

  console.log(`* ${entry.text}`);
}

async function main() {
  await bridge.loadExistingDownloads();
  bridge.onRecord((entry) => {
    printEntry(entry);
  });

  const { peerId, url } = await bridge.start({ port: 3104 });
  console.log(`Local workspace peer ID: ${peerId}`);
  console.log(`Local web UI: ${url}`);
  console.log('Commands: /connect <peer-id>, /send <path>, /peers, /quit');

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

    if (trimmed === '/quit') {
      rl.close();
      return;
    }

    if (trimmed === '/peers') {
      for (const peer of bridge.mesh.listPeers()) {
        console.log(`- ${peer.user?.name || peer.peerId} (${peer.peerId})`);
      }
      return;
    }

    if (trimmed.startsWith('/connect ')) {
      await bridge.connect(trimmed.slice('/connect '.length).trim());
      return;
    }

    if (trimmed.startsWith('/send ')) {
      const filePath = trimmed.slice('/send '.length).trim();
      try {
        const buffer = await readFile(filePath);
        await bridge.sendFileBuffer({
          fileName: filePath.split('/').pop(),
          buffer
        });
      } catch (error) {
        console.error(`Send failed: ${error.message}`);
      }
      return;
    }

    await bridge.sendChat(trimmed);
  });

  rl.on('close', async () => {
    await bridge.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => rl.close());
}

main();
