const TOKEN_VERSION = 1;
const ADJECTIVES = [
  'amber',
  'brisk',
  'calm',
  'daring',
  'ember',
  'frost',
  'gold',
  'harbor',
  'ivory',
  'jade',
  'keen',
  'lunar',
  'mellow',
  'north',
  'opal',
  'prism'
];
const NOUNS = [
  'acorn',
  'beacon',
  'cedar',
  'delta',
  'echo',
  'falcon',
  'grove',
  'harbor',
  'iris',
  'jungle',
  'kite',
  'lagoon',
  'meadow',
  'nova',
  'orbit',
  'pine'
];

function createWordTable() {
  const words = [];
  for (const adjective of ADJECTIVES) {
    for (const noun of NOUNS) {
      words.push(`${adjective}-${noun}`);
    }
  }
  return words;
}

const WORD_TABLE = createWordTable();
const WORD_LOOKUP = new Map(WORD_TABLE.map((word, index) => [word, index]));

function bytesToBinary(bytes) {
  let output = '';
  for (const byte of bytes) {
    output += String.fromCharCode(byte);
  }
  return output;
}

function binaryToBytes(binary) {
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function toBase64Url(bytes) {
  const base64 = typeof Buffer !== 'undefined' && typeof Buffer.from === 'function'
    ? Buffer.from(bytes).toString('base64')
    : btoa(bytesToBinary(bytes));

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return new Uint8Array(Buffer.from(`${normalized}${padding}`, 'base64'));
  }

  return binaryToBytes(atob(`${normalized}${padding}`));
}

function checksum(bytes) {
  let sum = 0;
  for (const byte of bytes) {
    sum = (sum + byte) & 0xffff;
  }
  return sum;
}

function encodePayload(peerId) {
  const peerBytes = new TextEncoder().encode(peerId);
  if (peerBytes.byteLength === 0 || peerBytes.byteLength > 255) {
    throw new Error('Peer ID length is invalid for sharing.');
  }

  const payload = new Uint8Array(2 + peerBytes.byteLength + 2);
  payload[0] = TOKEN_VERSION;
  payload[1] = peerBytes.byteLength;
  payload.set(peerBytes, 2);
  const sum = checksum(payload.slice(0, 2 + peerBytes.byteLength));
  payload[payload.length - 2] = (sum >> 8) & 0xff;
  payload[payload.length - 1] = sum & 0xff;
  return payload;
}

function decodePayload(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) {
    throw new Error('Share code is invalid.');
  }

  const version = bytes[0];
  if (version !== TOKEN_VERSION) {
    throw new Error(`Unsupported share code version: ${version}`);
  }

  const length = bytes[1];
  if (bytes.byteLength !== length + 4) {
    throw new Error('Share code length is invalid.');
  }

  const expected = checksum(bytes.slice(0, bytes.length - 2));
  const actual = (bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1];
  if (expected !== actual) {
    throw new Error('Share code checksum failed.');
  }

  const peerId = new TextDecoder().decode(bytes.slice(2, bytes.length - 2));
  if (!peerId) {
    throw new Error('Share code is missing a peer ID.');
  }

  return {
    version,
    peerId
  };
}

export function createShareCode(peerId) {
  return toBase64Url(encodePayload(peerId));
}

export function createSharePhrase(peerId) {
  const bytes = encodePayload(peerId);
  return [...bytes]
    .map((byte) => WORD_TABLE[byte])
    .join(' ');
}

export function parseSharePhrase(value) {
  const words = value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    throw new Error('Share phrase is empty.');
  }

  const bytes = new Uint8Array(words.map((word) => {
    const index = WORD_LOOKUP.get(word);
    if (typeof index !== 'number') {
      throw new Error(`Unknown share word: ${word}`);
    }
    return index;
  }));

  return decodePayload(bytes);
}

export function parseShareCode(value) {
  return decodePayload(fromBase64Url(value.trim()));
}

export function parseShareInput(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error('Missing share code.');
  }

  if (trimmed.includes('://') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code') || url.hash.replace(/^#\/?receive\/?/, '').trim();
    if (!code) {
      throw new Error('Share URL does not include a code.');
    }
    return parseShareCode(code);
  }

  if (/\s/.test(trimmed)) {
    return parseSharePhrase(trimmed);
  }

  return parseShareCode(trimmed);
}

export function createShareUrl(baseUrl, code) {
  const url = new URL(baseUrl);
  url.searchParams.set('mode', 'receive');
  url.searchParams.set('code', code);
  return url.toString();
}
