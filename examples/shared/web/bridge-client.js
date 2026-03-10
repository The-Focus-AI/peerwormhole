import { SimpleEmitter } from '../common/emitter.js';

export class BridgeClient extends SimpleEmitter {
  constructor() {
    super();
    this.state = null;
    this.stream = null;
  }

  async start() {
    await this.refresh();
    this.stream?.close();
    this.stream = new EventSource('/api/events');
    this.stream.addEventListener('state', (event) => {
      this.state = JSON.parse(event.data);
      this.emit('state', this.state);
    });
    this.stream.addEventListener('history', (event) => {
      this.emit('history', JSON.parse(event.data));
    });
    this.stream.addEventListener('files', (event) => {
      this.emit('files', JSON.parse(event.data));
    });
    this.stream.addEventListener('transfer', (event) => {
      this.emit('transfer', JSON.parse(event.data));
    });
  }

  async refresh() {
    const response = await fetch('/api/state');
    this.state = await response.json();
    this.emit('state', this.state);
    return this.state;
  }

  async connect(peerId) {
    await this.postJson('/api/connect', { peerId });
  }

  async sendChat(text, channel) {
    await this.postJson('/api/chat', { text, channel });
  }

  async setChannel(channel) {
    await this.postJson('/api/channel', { channel });
  }

  async uploadFile(file, channel) {
    await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-channel': channel,
        'x-file-name': file.name
      },
      body: await file.arrayBuffer()
    });
  }

  async postJson(path, payload) {
    await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  }
}
