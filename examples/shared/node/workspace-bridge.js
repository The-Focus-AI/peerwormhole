import { createReadStream } from 'fs';
import { readdir, stat, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { NodeMesh } from './mesh.js';
import { ensureDirectory, readJsonBody, readRequestBuffer, sendJson, startStaticServer } from './server.js';
import {
  DEFAULT_CHANNEL,
  createChatMessage,
  createSystemMessage,
  createUser,
  formatPeerLabel,
  normalizeChannel,
  sanitizeFileName
} from '../common/protocol.js';
import { createTransferAssembler, sendBufferChunks } from '../common/transfers.js';

const DOWNLOAD_MIME_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
};

function withTimestamp(fileName) {
  return `${Date.now()}-${sanitizeFileName(fileName)}`;
}

function eventMessage(text, channel = DEFAULT_CHANNEL) {
  return {
    kind: 'system',
    text,
    channel,
    sentAt: new Date().toISOString()
  };
}

export class WorkspaceBridge {
  constructor({
    publicDir,
    downloadsDir,
    name,
    userName,
    userRole = 'cli',
    channels = [DEFAULT_CHANNEL],
    log = console.log
  }) {
    this.name = name;
    this.publicDir = publicDir;
    this.downloadsDir = downloadsDir;
    this.log = log;
    this.user = createUser(userName, userRole);
    this.channels = [...new Set(channels.map((channel) => normalizeChannel(channel)))];
    this.currentChannel = this.channels[0] || DEFAULT_CHANNEL;
    this.serverHandle = null;
    this.events = new Set();
    this.recordSubscribers = new Set();
    this.history = [];
    this.files = [];
    this.transfers = new Map();
    this.mesh = new NodeMesh({ user: this.user, log });
    this.transferAssembler = createTransferAssembler({
      onStart: ({ meta, context }) => {
        this.updateTransfer(meta.id, {
          id: meta.id,
          name: meta.name,
          size: meta.size,
          direction: 'inbound',
          progress: 0,
          peerId: context.peerId,
          peerLabel: formatPeerLabel(context.peerId, context.user || meta.user),
          status: 'receiving'
        });
        this.publish('transfer', this.getTransferList());
      },
      onProgress: ({ meta, context, progress }) => {
        this.updateTransfer(meta.id, {
          id: meta.id,
          name: meta.name,
          size: meta.size,
          direction: 'inbound',
          progress,
          peerId: context.peerId,
          peerLabel: formatPeerLabel(context.peerId, context.user || meta.user),
          status: 'receiving'
        });
        this.publish('transfer', this.getTransferList());
      },
      onComplete: async ({ meta, bytes, context }) => {
        const savedName = withTimestamp(meta.name);
        const savedPath = join(this.downloadsDir, savedName);
        await writeFile(savedPath, bytes);
        const fileRecord = {
          id: meta.id,
          name: meta.name,
          savedName,
          size: meta.size,
          mimeType: meta.mimeType,
          channel: meta.channel || DEFAULT_CHANNEL,
          receivedFrom: formatPeerLabel(context.peerId, context.user || meta.user),
          url: `/downloads/${savedName}`,
          savedAt: new Date().toISOString()
        };
        this.files.unshift(fileRecord);
        this.files = this.files.slice(0, 40);
        this.updateTransfer(meta.id, {
          id: meta.id,
          name: meta.name,
          size: meta.size,
          direction: 'inbound',
          progress: 100,
          status: 'complete',
          peerId: context.peerId,
          peerLabel: formatPeerLabel(context.peerId, context.user || meta.user)
        });
        this.record({
          kind: 'file',
          channel: meta.channel || DEFAULT_CHANNEL,
          text: `${fileRecord.receivedFrom} shared ${meta.name}`,
          file: fileRecord,
          sentAt: new Date().toISOString()
        });
        this.publish('transfer', this.getTransferList());
        this.publish('files', this.files);
      },
      onError: (error) => {
        this.log(`Transfer error: ${error.message}`);
      }
    });

    this.mesh.on('peer-open', ({ peerId }) => {
      this.record(eventMessage(`Connection opened: ${peerId}`));
      this.publishState();
    });
    this.mesh.on('peer-user', ({ peerId, user }) => {
      this.record(eventMessage(`${formatPeerLabel(peerId, user)} joined`));
      this.publishState();
    });
    this.mesh.on('peer-close', ({ peerId, user }) => {
      this.record(eventMessage(`${formatPeerLabel(peerId, user)} disconnected`));
      this.publishState();
    });
    this.mesh.on('message', ({ peerId, user, message }) => {
      if (this.transferAssembler.handleMessage(message, { peerId, user })) {
        return;
      }

      if (message.type === 'chat') {
        this.record({
          kind: 'chat',
          text: message.text,
          channel: message.channel || DEFAULT_CHANNEL,
          user: message.user || user || createUser('Unknown', 'peer'),
          sentAt: message.sentAt
        });
      } else if (message.type === 'system') {
        this.record({
          kind: 'system',
          text: message.text,
          channel: message.channel || DEFAULT_CHANNEL,
          sentAt: message.sentAt
        });
      }
    });
    this.mesh.on('error', (error) => {
      this.record(eventMessage(`Peer error: ${error.message}`));
    });
  }

  async start({ port = 0 } = {}) {
    await ensureDirectory(this.downloadsDir);
    await this.mesh.start();
    this.serverHandle = await startStaticServer({
      publicDir: this.publicDir,
      port,
      handleRequest: this.handleRequest.bind(this)
    });
    this.record(eventMessage(`${this.name} is online on ${this.serverHandle.url}`));
    this.publishState();
    return {
      peerId: this.mesh.id,
      url: this.serverHandle.url
    };
  }

  async stop() {
    for (const stream of this.events) {
      stream.end();
    }
    this.events.clear();
    await this.serverHandle?.close();
    await this.mesh.stop();
  }

  getState() {
    return {
      appName: this.name,
      user: this.user,
      peerId: this.mesh.id,
      peers: this.mesh.listPeers(),
      channels: this.channels,
      currentChannel: this.currentChannel,
      history: this.history,
      files: this.files,
      transfers: this.getTransferList()
    };
  }

  getTransferList() {
    return [...this.transfers.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  updateTransfer(id, patch) {
    this.transfers.set(id, {
      ...(this.transfers.get(id) || {}),
      ...patch,
      updatedAt: new Date().toISOString()
    });
  }

  record(entry) {
    this.history.push(entry);
    this.history = this.history.slice(-120);
    for (const subscriber of this.recordSubscribers) {
      subscriber(entry);
    }
    this.publish('history', this.history);
  }

  onRecord(handler) {
    this.recordSubscribers.add(handler);
    return () => {
      this.recordSubscribers.delete(handler);
    };
  }

  publish(eventName, payload) {
    const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const stream of this.events) {
      stream.write(body);
    }
  }

  publishState() {
    this.publish('state', this.getState());
  }

  async connect(peerId) {
    this.mesh.connectTo(peerId);
    this.record(eventMessage(`Connecting to ${peerId}...`));
    this.publishState();
  }

  async sendChat(text, channel = this.currentChannel) {
    const normalizedChannel = normalizeChannel(channel);
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    this.currentChannel = normalizedChannel;
    const message = createChatMessage({
      user: this.user,
      text: trimmed,
      channel: normalizedChannel
    });
    this.mesh.broadcast(message);
    this.record({
      kind: 'chat',
      text: message.text,
      channel: normalizedChannel,
      user: this.user,
      sentAt: message.sentAt
    });
    this.publishState();
  }

  async sendSystem(text, channel = this.currentChannel) {
    const message = createSystemMessage(text, normalizeChannel(channel));
    this.mesh.broadcast(message);
    this.record({
      kind: 'system',
      text: message.text,
      channel: message.channel,
      sentAt: message.sentAt
    });
  }

  async sendFileBuffer({
    fileName,
    buffer,
    mimeType = 'application/octet-stream',
    channel = this.currentChannel
  }) {
    const normalizedChannel = normalizeChannel(channel);
    const peers = this.mesh.listPeers();
    if (peers.length === 0) {
      this.record(eventMessage('No connected peers available for file sharing.', normalizedChannel));
      return;
    }
    this.currentChannel = normalizedChannel;

    for (const peer of peers) {
      await sendBufferChunks(this.mesh.connections.get(peer.peerId), {
        buffer,
        fileName,
        mimeType,
        user: this.user,
        channel: normalizedChannel,
        onProgress: ({ id, progress }) => {
          this.updateTransfer(id, {
            id,
            name: fileName,
            size: buffer.byteLength,
            direction: 'outbound',
            progress,
            peerId: peer.peerId,
            peerLabel: formatPeerLabel(peer.peerId, peer.user),
            status: progress === 100 ? 'complete' : 'sending'
          });
          this.publish('transfer', this.getTransferList());
        }
      });
    }

    this.record({
      kind: 'file',
      text: `${this.user.name} shared ${fileName}`,
      channel: normalizedChannel,
      user: this.user,
      sentAt: new Date().toISOString()
    });
    this.publishState();
  }

  async loadExistingDownloads() {
    await ensureDirectory(this.downloadsDir);
    const entries = await readdir(this.downloadsDir);
    const existingFiles = [];
    for (const entry of entries.sort().reverse().slice(0, 40)) {
      const filePath = join(this.downloadsDir, entry);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        continue;
      }
      existingFiles.push({
        id: entry,
        name: entry.replace(/^\d+-/, ''),
        savedName: entry,
        size: fileStat.size,
        mimeType: DOWNLOAD_MIME_TYPES[extname(entry)] || 'application/octet-stream',
        channel: DEFAULT_CHANNEL,
        receivedFrom: 'previous session',
        url: `/downloads/${entry}`,
        savedAt: fileStat.mtime.toISOString()
      });
    }
    this.files = existingFiles;
  }

  async handleRequest(request, response) {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');

    if (request.method === 'GET' && requestUrl.pathname === '/api/state') {
      sendJson(response, this.getState());
      return true;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/connect') {
      const payload = await readJsonBody(request);
      await this.connect(payload.peerId);
      sendJson(response, { ok: true });
      return true;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/chat') {
      const payload = await readJsonBody(request);
      await this.sendChat(payload.text || '', payload.channel || this.currentChannel);
      sendJson(response, { ok: true });
      return true;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/channel') {
      const payload = await readJsonBody(request);
      this.currentChannel = normalizeChannel(payload.channel || this.currentChannel);
      this.record(eventMessage(`Switched to #${this.currentChannel}`));
      this.publishState();
      sendJson(response, { ok: true, currentChannel: this.currentChannel });
      return true;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/upload') {
      const buffer = await readRequestBuffer(request);
      const fileName = sanitizeFileName(request.headers['x-file-name'] || 'shared-file.bin');
      const mimeType = request.headers['content-type'] || 'application/octet-stream';
      const channel = request.headers['x-channel'] || this.currentChannel;
      await this.sendFileBuffer({
        fileName,
        buffer,
        mimeType,
        channel
      });
      sendJson(response, { ok: true });
      return true;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive'
      });
      response.write(`event: state\ndata: ${JSON.stringify(this.getState())}\n\n`);
      this.events.add(response);
      request.on('close', () => {
        this.events.delete(response);
      });
      return true;
    }

    if (request.method === 'GET' && requestUrl.pathname.startsWith('/downloads/')) {
      const fileName = basename(requestUrl.pathname);
      const filePath = resolve(this.downloadsDir, fileName);
      if (!filePath.startsWith(this.downloadsDir)) {
        response.writeHead(404);
        response.end();
        return true;
      }
      const fileStat = await stat(filePath);
      response.writeHead(200, {
        'content-type': DOWNLOAD_MIME_TYPES[extname(fileName)] || 'application/octet-stream',
        'content-length': fileStat.size
      });
      createReadStream(filePath).pipe(response);
      return true;
    }

    return false;
  }
}
