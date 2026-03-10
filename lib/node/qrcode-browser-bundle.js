import { readFile } from 'fs/promises';
import { resolve, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const QRCODE_ROOT = resolve(ROOT_DIR, 'node_modules/qrcode');
const DIJKSTRA_FILE = resolve(ROOT_DIR, 'node_modules/dijkstrajs/dijkstra.js');
const MODULE_PATHS = [
  'lib/browser.js',
  'lib/can-promise.js',
  'lib/core/alignment-pattern.js',
  'lib/core/alphanumeric-data.js',
  'lib/core/bit-buffer.js',
  'lib/core/bit-matrix.js',
  'lib/core/byte-data.js',
  'lib/core/error-correction-code.js',
  'lib/core/error-correction-level.js',
  'lib/core/finder-pattern.js',
  'lib/core/format-info.js',
  'lib/core/galois-field.js',
  'lib/core/kanji-data.js',
  'lib/core/mask-pattern.js',
  'lib/core/mode.js',
  'lib/core/numeric-data.js',
  'lib/core/polynomial.js',
  'lib/core/qrcode.js',
  'lib/core/reed-solomon-encoder.js',
  'lib/core/regex.js',
  'lib/core/segments.js',
  'lib/core/utils.js',
  'lib/core/version-check.js',
  'lib/core/version.js',
  'lib/renderer/canvas.js',
  'lib/renderer/svg-tag.js',
  'lib/renderer/utils.js'
];

let cachedBundle = null;

function moduleIdFromPath(filePath) {
  if (filePath === DIJKSTRA_FILE) {
    return 'dijkstrajs';
  }

  const relativePath = relative(QRCODE_ROOT, filePath).split(sep).join('/');
  return `qrcode/${relativePath}`;
}

function normalizeModuleId(value) {
  const output = [];

  for (const part of value.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      output.pop();
      continue;
    }

    output.push(part);
  }

  return output.join('/');
}

function resolveRequest(fromId, request) {
  if (request === 'dijkstrajs') {
    return 'dijkstrajs';
  }

  if (!request.startsWith('.')) {
    throw new Error(`Unsupported browser bundle dependency: ${request}`);
  }

  const base = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : '';
  let resolved = normalizeModuleId(`${base}/${request}`);
  if (!resolved.endsWith('.js')) {
    resolved += '.js';
  }
  return resolved;
}

function wrapModule(id, source) {
  return `'${id}': function (module, exports, require) {\n${source}\n}`;
}

export async function buildQrcodeBrowserBundle() {
  if (cachedBundle) {
    return cachedBundle;
  }

  const modules = [];
  for (const modulePath of MODULE_PATHS) {
    const filePath = resolve(QRCODE_ROOT, modulePath);
    const source = await readFile(filePath, 'utf8');
    modules.push(wrapModule(moduleIdFromPath(filePath), source));
  }

  const dijkstraSource = await readFile(DIJKSTRA_FILE, 'utf8');
  modules.push(wrapModule('dijkstrajs', dijkstraSource));

  cachedBundle = `(function () {
  const modules = {
${modules.join(',\n')}
  };
  const cache = {};
  const normalizeModuleId = ${normalizeModuleId.toString()};
  const resolveRequest = ${resolveRequest.toString()};

  function load(id) {
    if (cache[id]) {
      return cache[id].exports;
    }

    const factory = modules[id];
    if (!factory) {
      throw new Error('Missing browser bundle module: ' + id);
    }

    const module = { exports: {} };
    cache[id] = module;
    factory(module, module.exports, function (request) {
      return load(resolveRequest(id, request));
    });
    return module.exports;
  }

  globalThis.QRCodeBrowser = load('qrcode/lib/browser.js');
}());\n`;

  return cachedBundle;
}
