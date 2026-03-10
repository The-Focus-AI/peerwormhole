import { BrowserMesh } from '/shared/web/mesh.js';
import { createChatMessage, createUser, formatPeerLabel } from '/shared/common/protocol.js';

const dom = {
  activePeer: document.querySelector('#activePeer'),
  connectButton: document.querySelector('#connectButton'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  messages: document.querySelector('#messages'),
  nameInput: document.querySelector('#nameInput'),
  peerId: document.querySelector('#peerId'),
  startButton: document.querySelector('#startButton'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  targetInput: document.querySelector('#targetInput')
};

let mesh = null;
let activePeerId = '';

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

function setStatus(text, online = false) {
  dom.statusText.textContent = text;
  dom.statusDot.classList.toggle('online', online);
}

function setActivePeer(peerId, user = null) {
  activePeerId = peerId;
  dom.activePeer.textContent = peerId ? formatPeerLabel(peerId, user) : 'No peer selected';
}

async function startPeer() {
  mesh?.destroy();
  mesh = new BrowserMesh({
    user: createUser(dom.nameInput.value, 'web')
  });

  mesh.on('ready', ({ peerId }) => {
    dom.peerId.textContent = peerId;
    setStatus('Peer ready', true);
    appendMessage({ author: 'System', text: `Browser peer ready as ${peerId}`, tone: 'system' });
  });

  mesh.on('peer-open', ({ peerId }) => {
    setActivePeer(peerId);
    appendMessage({ author: 'System', text: `Connection opened to ${peerId}`, tone: 'system' });
  });

  mesh.on('peer-user', ({ peerId, user }) => {
    setActivePeer(peerId, user);
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} is online`, tone: 'system' });
  });

  mesh.on('peer-close', ({ peerId, user }) => {
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} disconnected`, tone: 'system' });
    if (peerId === activePeerId) {
      setActivePeer('');
    }
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
  setActivePeer(peerId);
  mesh.connectTo(peerId);
  appendMessage({ author: 'System', text: `Connecting to ${peerId}...`, tone: 'system' });
});

dom.messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = dom.messageInput.value.trim();
  if (!mesh || !text) {
    return;
  }

  if (!activePeerId) {
    appendMessage({ author: 'System', text: 'Connect to a peer first.', tone: 'system' });
    return;
  }

  const message = createChatMessage({
    user: createUser(dom.nameInput.value, 'web'),
    text
  });
  mesh.sendTo(activePeerId, message);
  appendMessage({ author: 'You', text: message.text, sentAt: message.sentAt });
  dom.messageInput.value = '';
});

startPeer();
