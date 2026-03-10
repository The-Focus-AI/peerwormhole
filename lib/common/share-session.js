import { SimpleEmitter } from './emitter.js';
import {
  MESSAGE_TYPES,
  createShareAccept,
  createShareOffer,
  createShareReject
} from './protocol.js';
import { createShareCode, createSharePhrase } from './share-code.js';
import { createTransferAssembler, sendBufferChunks } from './transfers.js';

export class ShareSender extends SimpleEmitter {
  constructor({
    mesh,
    user,
    buffer,
    fileName,
    mimeType = 'application/octet-stream'
  }) {
    super();
    this.mesh = mesh;
    this.user = user;
    this.buffer = buffer;
    this.fileName = fileName;
    this.mimeType = mimeType;
    this.offerId = `share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.activePeerId = null;
    this.sent = false;
    this.unsubscribe = [];
    this.subscribe();
  }

  subscribe() {
    this.unsubscribe.push(
      this.mesh.on('peer-open', ({ peerId }) => {
        if (this.sent) {
          this.rejectPeer(peerId, 'Sender is no longer accepting downloads.');
          return;
        }

        if (this.activePeerId && this.activePeerId !== peerId) {
          this.rejectPeer(peerId, 'Another receiver is already active.');
          return;
        }

        this.activePeerId = peerId;
        this.mesh.sendTo(peerId, createShareOffer({
          id: this.offerId,
          fileName: this.fileName,
          size: this.buffer.byteLength,
          mimeType: this.mimeType,
          user: this.user
        }));
        this.emit('offer', { peerId });
      }),
      this.mesh.on('message', ({ peerId, user, message }) => {
        if (peerId !== this.activePeerId || message?.id !== this.offerId) {
          return;
        }

        if (message.type === MESSAGE_TYPES.shareReject) {
          this.activePeerId = null;
          this.emit('rejected', { peerId, user, reason: message.reason || 'Receiver declined.' });
          return;
        }

        if (message.type === MESSAGE_TYPES.shareAccept) {
          this.emit('accepted', { peerId, user });
          this.streamTo(peerId).catch((error) => this.emit('error', error));
        }
      }),
      this.mesh.on('peer-close', ({ peerId }) => {
        if (peerId === this.activePeerId && !this.sent) {
          this.activePeerId = null;
          this.emit('waiting', { reason: 'Receiver disconnected before accepting.' });
        }
      }),
      this.mesh.on('error', (error) => {
        this.emit('error', error);
      })
    );
  }

  createInvite() {
    return {
      peerId: this.mesh.id,
      code: createShareCode(this.mesh.id),
      phrase: createSharePhrase(this.mesh.id)
    };
  }

  async streamTo(peerId) {
    if (this.sent) {
      return;
    }

    const connection = this.mesh.connections.get(peerId);
    if (!connection?.open) {
      throw new Error('Receiver connection is not open.');
    }

    this.sent = true;
    this.emit('sending', { peerId });
    await sendBufferChunks(connection, {
      buffer: this.buffer,
      fileName: this.fileName,
      mimeType: this.mimeType,
      user: this.user,
      onProgress: (progress) => this.emit('progress', { peerId, ...progress })
    });
    this.emit('complete', { peerId });
  }

  rejectPeer(peerId, reason) {
    this.mesh.sendTo(peerId, createShareReject(this.offerId, reason));
  }

  stop() {
    while (this.unsubscribe.length > 0) {
      const off = this.unsubscribe.pop();
      off?.();
    }
  }
}

export class ShareReceiver extends SimpleEmitter {
  constructor({
    mesh
  }) {
    super();
    this.mesh = mesh;
    this.senderPeerId = '';
    this.offer = null;
    this.accepted = false;
    this.completed = false;
    this.unsubscribe = [];
    this.assembler = createTransferAssembler({
      onStart: ({ meta, context }) => {
        this.emit('transfer-start', { meta, context });
      },
      onProgress: ({ meta, progress, context }) => {
        this.emit('progress', { meta, progress, context });
      },
      onComplete: ({ meta, bytes, context }) => {
        this.completed = true;
        this.emit('complete', { meta, bytes, context });
      },
      onError: (error) => {
        this.emit('error', error);
      }
    });
    this.subscribe();
  }

  subscribe() {
    this.unsubscribe.push(
      this.mesh.on('peer-open', ({ peerId }) => {
        if (peerId === this.senderPeerId) {
          this.emit('connected', { peerId });
        }
      }),
      this.mesh.on('message', ({ peerId, user, message }) => {
        if (peerId !== this.senderPeerId) {
          return;
        }

        if (this.assembler.handleMessage(message, { peerId, user })) {
          return;
        }

        if (message?.type === MESSAGE_TYPES.shareOffer) {
          this.offer = {
            ...message,
            peerId
          };
          this.emit('offer', this.offer);
          return;
        }

        if (message?.type === MESSAGE_TYPES.shareReject) {
          this.emit('rejected', {
            peerId,
            reason: message.reason || 'Sender rejected the transfer.'
          });
        }
      }),
      this.mesh.on('peer-close', ({ peerId }) => {
        if (peerId === this.senderPeerId && !this.completed) {
          this.emit('error', new Error(this.accepted
            ? 'Sender disconnected before the transfer completed.'
            : 'Sender disconnected before the transfer started.'));
        }
      }),
      this.mesh.on('error', (error) => {
        this.emit('error', error);
      })
    );
  }

  connectTo(peerId) {
    this.senderPeerId = peerId;
    this.mesh.connectTo(peerId);
  }

  accept() {
    if (!this.offer) {
      throw new Error('No share offer is available yet.');
    }

    this.accepted = true;
    this.mesh.sendTo(this.senderPeerId, createShareAccept(this.offer.id));
  }

  reject(reason = 'Receiver declined the transfer.') {
    if (!this.offer) {
      return;
    }

    this.mesh.sendTo(this.senderPeerId, createShareReject(this.offer.id, reason));
    this.emit('rejected', {
      peerId: this.senderPeerId,
      reason
    });
  }

  stop() {
    while (this.unsubscribe.length > 0) {
      const off = this.unsubscribe.pop();
      off?.();
    }
  }
}
