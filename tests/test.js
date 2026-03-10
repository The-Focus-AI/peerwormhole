import assert from 'assert/strict';
import { NodeMesh } from '../lib/node/mesh.js';
import { NodePeer } from '../src-js/NodePeer.js';
import { SimpleEmitter } from '../lib/common/emitter.js';
import {
  MESSAGE_TYPES,
  createShareAccept,
  createShareOffer,
  createUser
} from '../lib/common/protocol.js';
import {
  createShareCode,
  createSharePhrase,
  createShareUrl,
  parseShareCode,
  parseShareInput,
  parseSharePhrase
} from '../lib/common/share-code.js';
import { ShareReceiver, ShareSender } from '../lib/common/share-session.js';

class FakeConnection {
  constructor() {
    this.open = true;
    this.messages = [];
  }

  send(message) {
    this.messages.push(message);
  }

  close() {
    this.open = false;
  }
}

class FakeMesh extends SimpleEmitter {
  constructor(id = 'fake-peer') {
    super();
    this.id = id;
    this.connections = new Map();
    this.sentMessages = [];
    this.connectedPeerIds = [];
  }

  sendTo(peerId, message) {
    this.sentMessages.push({ peerId, message });
    this.connections.get(peerId)?.send(message);
  }

  connectTo(peerId) {
    this.connectedPeerIds.push(peerId);
  }

  async stop() {
    return undefined;
  }
}

async function waitForEvent(emitter, eventName) {
  return new Promise((resolve) => {
    const off = emitter.on(eventName, (payload) => {
      off();
      resolve(payload);
    });
  });
}

async function runTest(name, testFn) {
  try {
    console.log(`\nRunning test: ${name}`);
    await testFn();
    console.log(`✓ ${name} passed`);
    return true;
  } catch (error) {
    console.error(`✗ ${name} failed:`, error);
    return false;
  }
}

async function testShareCodeRoundTrip() {
  const peerId = 'sender-abc123';
  const code = createShareCode(peerId);
  const phrase = createSharePhrase(peerId);
  const url = createShareUrl('https://share.example/app/', code);

  assert.equal(parseShareCode(code).peerId, peerId);
  assert.equal(parseSharePhrase(phrase).peerId, peerId);
  assert.equal(parseShareInput(url).peerId, peerId);
}

async function testShareCodeRoundTripWithoutBuffer() {
  const originalBuffer = globalThis.Buffer;

  try {
    globalThis.Buffer = undefined;

    const peerId = 'sender-browser-safe';
    const code = createShareCode(peerId);
    const phrase = createSharePhrase(peerId);
    const url = createShareUrl('https://share.example/app/', code);

    assert.equal(parseShareCode(code).peerId, peerId);
    assert.equal(parseSharePhrase(phrase).peerId, peerId);
    assert.equal(parseShareInput(url).peerId, peerId);
  } finally {
    globalThis.Buffer = originalBuffer;
  }
}

async function testSenderHandshakeAndStreaming() {
  const mesh = new FakeMesh('sender-peer');
  const connection = new FakeConnection();
  mesh.connections.set('receiver-peer', connection);

  const sender = new ShareSender({
    mesh,
    user: createUser('Sender', 'cli'),
    buffer: new Uint8Array([1, 2, 3, 4]),
    fileName: 'hello.txt',
    mimeType: 'text/plain'
  });

  const completePromise = waitForEvent(sender, 'complete');
  mesh.emit('peer-open', {
    peerId: 'receiver-peer',
    direction: 'inbound'
  });
  mesh.emit('message', {
    peerId: 'receiver-peer',
    user: createUser('Receiver', 'cli'),
    message: createShareAccept(sender.offerId)
  });

  await completePromise;

  assert.equal(connection.messages[0].type, MESSAGE_TYPES.shareOffer);
  assert.equal(connection.messages[1].type, MESSAGE_TYPES.fileMeta);
  assert.equal(connection.messages.at(-1).type, MESSAGE_TYPES.fileComplete);
  sender.stop();
}

async function testReceiverOfferAndAccept() {
  const mesh = new FakeMesh('receiver-peer');
  const receiver = new ShareReceiver({ mesh });
  const completePromise = waitForEvent(receiver, 'complete');
  let offer = null;

  receiver.on('offer', (nextOffer) => {
    offer = nextOffer;
  });

  receiver.connectTo('sender-peer');
  assert.deepEqual(mesh.connectedPeerIds, ['sender-peer']);

  mesh.emit('message', {
    peerId: 'sender-peer',
    user: createUser('Sender', 'cli'),
    message: createShareOffer({
      id: 'share-123',
      fileName: 'hello.txt',
      size: 4,
      mimeType: 'text/plain',
      user: createUser('Sender', 'cli')
    })
  });

  assert.equal(offer.fileName, 'hello.txt');
  receiver.accept();
  assert.equal(mesh.sentMessages.at(-1).message.type, MESSAGE_TYPES.shareAccept);

  mesh.emit('message', {
    peerId: 'sender-peer',
    user: createUser('Sender', 'cli'),
    message: {
      type: MESSAGE_TYPES.fileMeta,
      id: 'transfer-1',
      name: 'hello.txt',
      size: 4,
      mimeType: 'text/plain',
      totalChunks: 1,
      sentAt: new Date().toISOString()
    }
  });
  mesh.emit('message', {
    peerId: 'sender-peer',
    user: createUser('Sender', 'cli'),
    message: {
      type: MESSAGE_TYPES.fileChunk,
      id: 'transfer-1',
      chunkIndex: 0,
      data: new Uint8Array([1, 2, 3, 4])
    }
  });
  mesh.emit('message', {
    peerId: 'sender-peer',
    user: createUser('Sender', 'cli'),
    message: {
      type: MESSAGE_TYPES.fileComplete,
      id: 'transfer-1'
    }
  });

  const completed = await completePromise;
  assert.deepEqual([...completed.bytes], [1, 2, 3, 4]);
  receiver.stop();
}

async function testPeerConnection() {
  const peer1 = new NodePeer();
  const peer2 = new NodePeer();

  try {
    const [, id2] = await Promise.all([
      new Promise((resolve) => peer1.once('open', resolve)),
      new Promise((resolve) => peer2.once('open', resolve))
    ]);

    await new Promise((resolve, reject) => {
      const message1 = 'Hello from peer1!';
      const message2 = 'Hello from peer2!';
      let peer1Received = false;
      let peer2Received = false;

      peer2.on('connection', (connection) => {
        connection.on('data', (data) => {
          if (data === message1) {
            peer2Received = true;
            connection.send(message2);
          }

          if (peer1Received && peer2Received) {
            resolve();
          }
        });
      });

      const connection = peer1.connect(id2);
      connection.on('open', () => {
        connection.send(message1);
      });
      connection.on('data', (data) => {
        if (data === message2) {
          peer1Received = true;
        }

        if (peer1Received && peer2Received) {
          resolve();
        }
      });
      connection.on('error', reject);
      peer1.on('error', reject);
      peer2.on('error', reject);
      setTimeout(() => reject(new Error('Timed out waiting for peer exchange.')), 30000);
    });
  } finally {
    await peer1.cleanup();
    await peer2.cleanup();
  }
}

async function testTransferSmoke() {
  const senderMesh = new NodeMesh({ user: createUser('Sender', 'cli') });
  const receiverMesh = new NodeMesh({ user: createUser('Receiver', 'cli') });

  try {
    await Promise.all([senderMesh.start(), receiverMesh.start()]);

    const sender = new ShareSender({
      mesh: senderMesh,
      user: createUser('Sender', 'cli'),
      buffer: new Uint8Array([1, 2, 3, 4, 5]),
      fileName: 'tiny.bin',
      mimeType: 'application/octet-stream'
    });
    const receiver = new ShareReceiver({ mesh: receiverMesh });

    const completion = new Promise((resolve, reject) => {
      receiver.on('offer', () => receiver.accept());
      receiver.on('complete', ({ bytes }) => resolve(bytes));
      receiver.on('error', reject);
      sender.on('error', reject);
    });

    receiver.connectTo(senderMesh.id);
    const bytes = await completion;
    assert.deepEqual([...bytes], [1, 2, 3, 4, 5]);

    sender.stop();
    receiver.stop();
  } finally {
    await receiverMesh.stop();
    await senderMesh.stop();
  }
}

async function runTests() {
  const tests = [
    ['Share code round trip', testShareCodeRoundTrip],
    ['Share code round trip without Buffer', testShareCodeRoundTripWithoutBuffer],
    ['Sender handshake and stream', testSenderHandshakeAndStreaming],
    ['Receiver offer and accept', testReceiverOfferAndAccept]
  ];

  if (process.env.RUN_PEER_NETWORK_TEST === '1') {
    tests.push(['Peer connection smoke', testPeerConnection]);
    tests.push(['Peer transfer smoke', testTransferSmoke]);
  }

  let passed = 0;
  let failed = 0;

  for (const [name, testFn] of tests) {
    if (await runTest(name, testFn)) {
      passed += 1;
    } else {
      failed += 1;
    }
  }

  console.log('\nTest Results:');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
