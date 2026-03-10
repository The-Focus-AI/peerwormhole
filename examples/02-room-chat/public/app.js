import { BrowserMesh } from '/shared/web/mesh.js';
import { createChatMessage, createUser, formatPeerLabel } from '/shared/common/protocol.js';

const dom = {
  connectButton: document.querySelector('#connectButton'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  messages: document.querySelector('#messages'),
  nameInput: document.querySelector('#nameInput'),
  peerId: document.querySelector('#peerId'),
  peers: document.querySelector('#peers'),
  startButton: document.querySelector('#startButton'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  targetInput: document.querySelector('#targetInput')
};

let mesh = null;

function appendMessage({ author, text, tone = 'chat', sentAt = new Date().toISOString() }) {
  const article = document.createElement('article');
  article.className = `message ${tone === 'system' ? 'system' : ''}`;
  article.innerHTML = `
    <div class="meta">${new Date(sentAt).toLocaleTimeString()} • ${author}</div>
    <div>${text}</div>
  `;
  dom.messages.append(article);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function renderPeers() {
  dom.peers.innerHTML = '';
  const peers = mesh?.listPeers() || [];

  if (peers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'peer-chip';
    empty.textContent = 'No peers connected';
    dom.peers.append(empty);
    return;
  }

  for (const peer of peers) {
    const item = document.createElement('div');
    item.className = 'peer-chip';
    item.textContent = formatPeerLabel(peer.peerId, peer.user);
    dom.peers.append(item);
  }
}

function setStatus(text, online = false) {
  dom.statusText.textContent = text;
  dom.statusDot.classList.toggle('online', online);
}

async function startPeer() {
  mesh?.destroy();
  mesh = new BrowserMesh({
    user: createUser(dom.nameInput.value, 'web')
  });

  mesh.on('ready', ({ peerId }) => {
    dom.peerId.textContent = peerId;
    setStatus('Room peer ready', true);
    appendMessage({ author: 'System', text: `Room peer ready as ${peerId}`, tone: 'system' });
    renderPeers();
  });

  mesh.on('peer-open', ({ peerId }) => {
    appendMessage({ author: 'System', text: `Socket opened to ${peerId}`, tone: 'system' });
    renderPeers();
  });

  mesh.on('peer-user', ({ peerId, user }) => {
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} joined the room`, tone: 'system' });
    renderPeers();
  });

  mesh.on('peer-close', ({ peerId, user }) => {
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} left the room`, tone: 'system' });
    renderPeers();
  });

  mesh.on('message', ({ peerId, user, message }) => {
    if (message.type !== 'chat') {
      return;
    }

    appendMessage({
      author: formatPeerLabel(peerId, user || message.user),
      text: message.text,
      sentAt: message.sentAt
    });
  });

  mesh.on('error', (error) => {
    appendMessage({ author: 'System', text: error.message, tone: 'system' });
  });

  await mesh.start();
}

dom.startButton.addEventListener('click', () => {
  startPeer();
});

dom.connectButton.addEventListener('click', () => {
  const peerId = dom.targetInput.value.trim();
  if (!peerId || !mesh) {
    return;
  }

  mesh.connectTo(peerId);
  appendMessage({ author: 'System', text: `Connecting to ${peerId}...`, tone: 'system' });
});

dom.messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = dom.messageInput.value.trim();
  if (!mesh || !text) {
    return;
  }

  const message = createChatMessage({
    user: createUser(dom.nameInput.value, 'web'),
    text
  });
  mesh.broadcast(message);
  appendMessage({ author: 'You', text: message.text, sentAt: message.sentAt });
  dom.messageInput.value = '';
});

startPeer();
