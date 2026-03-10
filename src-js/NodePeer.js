// @ts-check
import peerjs from 'peerjs';
import wrtc from '@roamhq/wrtc';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { WebSocket as WsWebSocket } from 'ws';

// Polyfill WebSocket for Node < 22 (PeerJS needs it for signaling)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WsWebSocket;
}

const require = createRequire(import.meta.url);
const { Peer } = peerjs;
const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } = wrtc;

// Mock browser environment - this must be done before PeerJS is used
const globalProxy = new Proxy(global, {
  set(target, prop, value) {
    if (prop === 'navigator' || prop === 'window' || prop === 'location') {
      Object.defineProperty(target, prop, {
        value,
        writable: true,
        configurable: true
      });
      return true;
    }
    target[prop] = value;
    return true;
  }
});

// Set up required browser globals
globalProxy.window = {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  isSecureContext: true,
  RTCRtpTransceiver: {
    prototype: {
      currentDirection: null,
      direction: 'sendrecv',
      mid: null,
      receiver: {},
      sender: {},
      stopped: false
    }
  }
};

globalProxy.navigator = {
  platform: 'MacIntel',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  webkitGetUserMedia: () => {}
};

globalProxy.location = {
  protocol: 'https:',
  ancestorOrigins: {},
  hash: '',
  host: 'localhost',
  hostname: 'localhost',
  href: 'https://localhost',
  origin: 'https://localhost',
  pathname: '/',
  port: '',
  search: ''
};

// Set global WebRTC objects
globalProxy.RTCPeerConnection = RTCPeerConnection;
globalProxy.RTCSessionDescription = RTCSessionDescription;
globalProxy.RTCIceCandidate = RTCIceCandidate;

// Mock webrtc-adapter
const webrtcAdapter = {
  browserDetails: {
    browser: 'chrome',
    version: 122
  }
};

// Mock require('webrtc-adapter')
require.cache[require.resolve('webrtc-adapter')] = {
  exports: webrtcAdapter,
  children: [],
  filename: require.resolve('webrtc-adapter'),
  id: require.resolve('webrtc-adapter'),
  isPreloading: false,
  loaded: true,
  parent: null,
  path: require.resolve('webrtc-adapter'),
  paths: []
};

// Mock WebRTC support detection
const { util } = peerjs;
if (util) {
  Object.assign(util.supports, {
    data: true,
    audioVideo: true,
    reliable: true,
    binaryBlob: true,
    browser: true,
    webRTC: true
  });
}

/**
 * NodePeer class for handling WebRTC peer connections
 * @extends EventEmitter
 */
export class NodePeer extends EventEmitter {
  /**
   * Create a new NodePeer instance
   * @param {string|{id?: string, debug?: number}} [options] - Optional peer ID or options
   */
  constructor(options) {
    super();
    /** @private */
    this._id = null;
    /** @private */
    this._cleanupPromise = null;
    const normalized = typeof options === 'string'
      ? { id: options, debug: 0 }
      : { id: options?.id, debug: options?.debug ?? 0 };
    
    const config = {
      host: '0.peerjs.com',
      secure: true,
      port: 443,
      debug: normalized.debug,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    };

    /** @private */
    this.peer = normalized.id ? new Peer(normalized.id, config) : new Peer(config);
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers for the peer
   * @private
   */
  setupEventHandlers() {
    this.peer.on('open', (id) => {
      this._id = id;
      this.emit('open', id);
    });

    this.peer.on('error', (err) => {
      this.emit('error', err);
    });

    this.peer.on('connection', (conn) => {
      this.emit('connection', conn);
    });
  }

  /**
   * Connect to another peer
   * @param {string} peerId - ID of the peer to connect to
   * @returns {import('peerjs').DataConnection} The connection object
   */
  connect(peerId) {
    if (!this.peer || this.peer.destroyed) {
      throw new Error('Peer is not available. Create a new NodePeer instance.');
    }

    const conn = this.peer.connect(peerId);
    return conn;
  }

  /**
   * Clean up and destroy the peer connection
   * @returns {Promise<void>}
   */
  async cleanup() {
    if (this._cleanupPromise) {
      return this._cleanupPromise;
    }

    this._cleanupPromise = (async () => {
      try {
        if (!this.peer || this.peer.destroyed) {
          this._id = null;
          this.peer = null;
          return;
        }

        const connections = this.peer.connections || {};

        for (const connectionList of Object.values(connections)) {
          for (const connection of connectionList) {
            try {
              connection.dataChannel?.close?.();
            } catch (error) {
              this.emit('error', error);
            }

            try {
              connection.close?.();
            } catch (error) {
              this.emit('error', error);
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          this.peer.disconnect?.();
        } catch (error) {
          this.emit('error', error);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          this.peer.destroy?.();
        } catch (error) {
          this.emit('error', error);
        }

        this._id = null;
        this.peer = null;
      } catch (error) {
        this.emit('error', error);
      }
    })();

    return this._cleanupPromise;
  }

  /**
   * Destroy the peer connection and release all resources.
   * @returns {Promise<void>}
   */
  async destroy() {
    return this.cleanup();
  }

  /**
   * Get the peer ID
   * @returns {string} The peer ID or empty string if not set
   */
  getId() {
    return this._id || '';
  }
} 
