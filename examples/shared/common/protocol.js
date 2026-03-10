const DEFAULT_CHANNEL = 'general';

export const MESSAGE_TYPES = {
  hello: 'hello',
  chat: 'chat',
  fileMeta: 'file-meta',
  fileChunk: 'file-chunk',
  fileComplete: 'file-complete',
  system: 'system'
};

export function createUser(name, role = 'web') {
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

export function createChatMessage({ user, text, channel = DEFAULT_CHANNEL }) {
  return {
    type: MESSAGE_TYPES.chat,
    channel,
    text: text.trim(),
    user,
    sentAt: new Date().toISOString()
  };
}

export function createSystemMessage(text, channel = DEFAULT_CHANNEL) {
  return {
    type: MESSAGE_TYPES.system,
    channel,
    text,
    sentAt: new Date().toISOString()
  };
}

export function createTransferId() {
  return `transfer-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function normalizeChannel(channel) {
  const nextChannel = channel?.trim() || DEFAULT_CHANNEL;
  return nextChannel.startsWith('#') ? nextChannel.slice(1) : nextChannel;
}

export function sanitizeFileName(fileName) {
  return (fileName || 'shared-file.bin').replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function formatPeerLabel(peerId, user) {
  if (!peerId) {
    return user?.name || 'Unknown peer';
  }

  const shortId = peerId.length > 10 ? `${peerId.slice(0, 6)}...${peerId.slice(-4)}` : peerId;
  return user?.name ? `${user.name} (${shortId})` : shortId;
}

export { DEFAULT_CHANNEL };
