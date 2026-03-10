import { cp, mkdir, stat, writeFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildQrcodeBrowserBundle } from './qrcode-browser-bundle.js';

const ROOT_DIR = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WEB_ROOT = resolve(ROOT_DIR, 'web');
const LIB_ROOT = resolve(ROOT_DIR, 'lib');
const PEERJS_VENDOR = resolve(ROOT_DIR, 'node_modules/peerjs/dist/peerjs.min.js');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendNotFound(response) {
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

function sendError(response, error) {
  response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(error.message);
}

async function serveFile(response, filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) {
    sendNotFound(response);
    return;
  }

  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
}

async function serveMappedPath(response, rootDir, requestPath) {
  const target = resolve(rootDir, normalize(requestPath));
  if (!target.startsWith(rootDir)) {
    sendNotFound(response);
    return;
  }

  await serveFile(response, target);
}

export async function startShareWebServer({ port = 3106 } = {}) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://127.0.0.1');
      const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;

      if (pathname === '/vendor/peerjs.min.js') {
        await serveFile(response, PEERJS_VENDOR);
        return;
      }

      if (pathname === '/vendor/qrcode-browser.js') {
        response.writeHead(200, {
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'no-store'
        });
        response.end(await buildQrcodeBrowserBundle());
        return;
      }

      if (pathname.startsWith('/modules/')) {
        const localPath = pathname.slice('/modules/'.length);
        if (!localPath.startsWith('common/') && !localPath.startsWith('web/')) {
          sendNotFound(response);
          return;
        }
        await serveMappedPath(response, LIB_ROOT, localPath);
        return;
      }

      await serveMappedPath(response, WEB_ROOT, pathname.slice(1));
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

export async function exportShareWebApp(targetDir) {
  const outputDir = resolve(targetDir);
  const vendorDir = join(outputDir, 'vendor');
  const modulesDir = join(outputDir, 'modules');

  await mkdir(outputDir, { recursive: true });
  await mkdir(vendorDir, { recursive: true });
  await mkdir(modulesDir, { recursive: true });

  await cp(WEB_ROOT, outputDir, { recursive: true });
  await cp(join(LIB_ROOT, 'common'), join(modulesDir, 'common'), { recursive: true });
  await cp(join(LIB_ROOT, 'web'), join(modulesDir, 'web'), { recursive: true });
  await cp(PEERJS_VENDOR, join(vendorDir, 'peerjs.min.js'));
  await writeFile(join(vendorDir, 'qrcode-browser.js'), await buildQrcodeBrowserBundle(), 'utf8');

  return {
    outputDir,
    entrypoint: join(outputDir, 'index.html')
  };
}
