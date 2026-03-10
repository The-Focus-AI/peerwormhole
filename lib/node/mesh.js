import { NodePeer } from '../../src-js/NodePeer.js';
import { SimpleEmitter } from '../common/emitter.js';
import { createHello } from '../common/protocol.js';

export class NodeMesh extends SimpleEmitter {
  constructor({ user, debug = 0 }) {
    super();
    this.user = user;
    this.id = '';
    this.connections = new Map();
    this.peerUsers = new Map();
    this.peer = new NodePeer({ debug });
    this.peer.on('open', (id) => {
      this.id = id;
      this.emit('ready', { peerId: id });
    });
    this.peer.on('connection', (connection) => {
      this.attachConnection(connection, 'inbound');
    });
    this.peer.on('error', (error) => {
      this.emit('error', error);
    });
  }

  async start() {
    if (this.id) {
      return this.id;
    }

    return new Promise((resolve) => {
      const stop = this.on('ready', ({ peerId }) => {
        stop();
        resolve(peerId);
      });
    });
  }

  connectTo(peerId) {
    if (!peerId || peerId === this.id || this.connections.has(peerId)) {
      return;
    }

    const connection = this.peer.connect(peerId);
    this.attachConnection(connection, 'outbound');
  }

  attachConnection(connection, direction) {
    if (connection.__nodePeerShareAttached) {
      return;
    }

    connection.__nodePeerShareAttached = true;

    connection.on('open', () => {
      this.connections.set(connection.peer, connection);
      connection.send(createHello(this.user));
      this.emit('peer-open', {
        peerId: connection.peer,
        direction
      });
    });

    connection.on('data', (message) => {
      if (message?.type === 'hello') {
        this.peerUsers.set(connection.peer, message.user);
        this.emit('peer-user', {
          peerId: connection.peer,
          user: message.user
        });
        return;
      }

      this.emit('message', {
        peerId: connection.peer,
        user: this.peerUsers.get(connection.peer),
        message
      });
    });

    connection.on('close', () => {
      const user = this.peerUsers.get(connection.peer);
      this.connections.delete(connection.peer);
      this.peerUsers.delete(connection.peer);
      this.emit('peer-close', {
        peerId: connection.peer,
        user
      });
    });

    connection.on('error', (error) => {
      this.emit('error', error);
    });
  }

  sendTo(peerId, message) {
    const connection = this.connections.get(peerId);
    if (connection?.open) {
      connection.send(message);
    }
  }

  listPeers() {
    return [...this.connections.keys()].map((peerId) => ({
      peerId,
      user: this.peerUsers.get(peerId) || null
    }));
  }

  async stop() {
    for (const connection of this.connections.values()) {
      try {
        connection.dataChannel?.close?.();
      } catch (error) {
        this.emit('error', error);
      }

      try {
        connection.close();
      } catch (error) {
        this.emit('error', error);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    this.connections.clear();
    this.peerUsers.clear();
    await this.peer.cleanup();
  }
}
