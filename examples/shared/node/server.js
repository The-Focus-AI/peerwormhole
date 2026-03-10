import { createReadStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { createServer } from 'http';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const ROOT_DIR = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const SHARED_ROOT = resolve(ROOT_DIR, 'examples/shared');
const VENDOR_ROOT = resolve(ROOT_DIR, 'node_modules/peerjs/dist');

function sendNotFound(response) {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

function sendError(response, error) {
  response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(error.message);
}

export function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

export async function readRequestBuffer(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

async function serveFile(response, filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendNotFound(response);
    return;
  }

  const ext = extname(filePath);
  response.writeHead(200, {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
}

export async function startStaticServer({
  publicDir,
  port = 0,
  handleRequest
}) {
  const server = createServer(async (request, response) => {
    try {
      if (handleRequest && await handleRequest(request, response)) {
        return;
      }

      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;

      if (pathname.startsWith('/shared/')) {
        const target = resolve(SHARED_ROOT, normalize(pathname.slice('/shared/'.length)));
        if (!target.startsWith(SHARED_ROOT)) {
          sendNotFound(response);
          return;
        }
        await serveFile(response, target);
        return;
      }

      if (pathname === '/vendor/peerjs.min.js') {
        await serveFile(response, join(VENDOR_ROOT, 'peerjs.min.js'));
        return;
      }

      const target = resolve(publicDir, `.${pathname}`);
      if (!target.startsWith(publicDir)) {
        sendNotFound(response);
        return;
      }
      await serveFile(response, target);
    } catch (error) {
      if (error.code === 'ENOENT') {
        sendNotFound(response);
        return;
      }
      sendError(response, error);
    }
  });

  await new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', resolvePromise);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    port: actualPort,
    url: `http://127.0.0.1:${actualPort}`,
    close: () => new Promise((resolvePromise, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise();
      });
    })
  };
}
