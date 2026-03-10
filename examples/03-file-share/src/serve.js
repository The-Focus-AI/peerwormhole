import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { startStaticServer } from '../../shared/node/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');

const server = await startStaticServer({ publicDir, port: 3103 });
console.log(`File share web UI: ${server.url}`);
console.log('Open the page and connect it to browser or CLI peers to exchange chat and files.');
