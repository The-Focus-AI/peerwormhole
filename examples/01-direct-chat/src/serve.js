import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { startStaticServer } from '../../shared/node/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');

const server = await startStaticServer({ publicDir, port: 3101 });
console.log(`Direct chat web UI: ${server.url}`);
console.log('Open the page in a browser and connect it to another browser or CLI peer.');
