import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { WorkspaceBridge } from '../../shared/node/workspace-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');
const downloadsDir = join(resolve(__dirname, '..'), 'downloads');

const bridge = new WorkspaceBridge({
  publicDir,
  downloadsDir,
  name: 'Slack Lite',
  userName: 'Slack Lite Host',
  channels: ['general', 'ops', 'random']
});

await bridge.loadExistingDownloads();
const { peerId, url } = await bridge.start({ port: 3105 });
console.log(`Slack Lite peer ID: ${peerId}`);
console.log(`Open ${url} in a browser.`);
