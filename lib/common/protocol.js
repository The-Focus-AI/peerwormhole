export const MESSAGE_TYPES = {
  hello: 'hello',
  shareOffer: 'share-offer',
  shareAccept: 'share-accept',
  shareReject: 'share-reject',
  fileMeta: 'file-meta',
  fileChunk: 'file-chunk',
  fileComplete: 'file-complete'
};

export function createUser(name, role = 'cli') {
  return {
    name: name?.trim() || 'Anonymous',
    role
  };
}

export function createHello(user) {
  return {
    type: MESSAGE_TYPES.hello,
    user
  };
}

export function createTransferId() {
  return `transfer-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function sanitizeFileName(fileName) {
  return (fileName || 'shared-file.bin').replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function createShareOffer({
  id,
  fileName,
  size,
  mimeType = 'application/octet-stream',
  user
}) {
  return {
    type: MESSAGE_TYPES.shareOffer,
    id,
    fileName: sanitizeFileName(fileName),
    size,
    mimeType,
    user,
    sentAt: new Date().toISOString()
  };
}

export function createShareAccept(id) {
  return {
    type: MESSAGE_TYPES.shareAccept,
    id,
    sentAt: new Date().toISOString()
  };
}

export function createShareReject(id, reason = 'Declined') {
  return {
    type: MESSAGE_TYPES.shareReject,
    id,
    reason,
    sentAt: new Date().toISOString()
  };
}

export function formatPeerLabel(peerId, user) {
  if (!peerId) {
    return user?.name || 'Unknown peer';
  }

  const shortId = peerId.length > 10 ? `${peerId.slice(0, 6)}...${peerId.slice(-4)}` : peerId;
  return user?.name ? `${user.name} (${shortId})` : shortId;
}
