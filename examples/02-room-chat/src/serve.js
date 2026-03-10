import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { startStaticServer } from '../../shared/node/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '../public');

const server = await startStaticServer({ publicDir, port: 3102 });
console.log(`Room chat web UI: ${server.url}`);
console.log('Open two or more browser tabs or pair the page with CLI peers.');
