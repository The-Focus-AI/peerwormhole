import { BrowserMesh } from '/shared/web/mesh.js';
import { createChatMessage, createUser, formatPeerLabel } from '/shared/common/protocol.js';
import { createTransferAssembler, sendBufferChunks } from '/shared/common/transfers.js';

const dom = {
  connectButton: document.querySelector('#connectButton'),
  dropZone: document.querySelector('#dropZone'),
  fileInput: document.querySelector('#fileInput'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  messages: document.querySelector('#messages'),
  nameInput: document.querySelector('#nameInput'),
  peerId: document.querySelector('#peerId'),
  peers: document.querySelector('#peers'),
  startButton: document.querySelector('#startButton'),
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  targetInput: document.querySelector('#targetInput'),
  transfers: document.querySelector('#transfers')
};

let mesh = null;
const transferState = new Map();

function appendMessage({ author, text, tone = 'chat', sentAt = new Date().toISOString(), file = null }) {
  const article = document.createElement('article');
  article.className = `message ${tone === 'system' ? 'system' : ''}`;

  let body = `<div>${text}</div>`;
  if (file) {
    body += `<div><a class="file-link" href="${file.url}" download="${file.name}">Download ${file.name}</a></div>`;
  }

  article.innerHTML = `
    <div class="meta">${new Date(sentAt).toLocaleTimeString()} • ${author}</div>
    ${body}
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

function renderTransfers() {
  dom.transfers.innerHTML = '';
  if (transferState.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'peer-chip';
    empty.textContent = 'No active transfers';
    dom.transfers.append(empty);
    return;
  }

  for (const transfer of [...transferState.values()].reverse()) {
    const item = document.createElement('div');
    item.className = 'peer-chip';
    item.textContent = `${transfer.direction === 'outbound' ? 'Sending' : 'Receiving'} ${transfer.name} • ${transfer.progress}%`;
    dom.transfers.append(item);
  }
}

function setStatus(text, online = false) {
  dom.statusText.textContent = text;
  dom.statusDot.classList.toggle('online', online);
}

const assembler = createTransferAssembler({
  onStart: ({ meta, context }) => {
    transferState.set(meta.id, {
      id: meta.id,
      name: meta.name,
      direction: 'inbound',
      progress: 0,
      peerId: context.peerId
    });
    renderTransfers();
  },
  onProgress: ({ meta, progress, context }) => {
    transferState.set(meta.id, {
      id: meta.id,
      name: meta.name,
      direction: 'inbound',
      progress,
      peerId: context.peerId
    });
    renderTransfers();
  },
  onComplete: ({ meta, bytes, context }) => {
    transferState.set(meta.id, {
      id: meta.id,
      name: meta.name,
      direction: 'inbound',
      progress: 100,
      peerId: context.peerId
    });
    renderTransfers();

    const file = new Blob([bytes], { type: meta.mimeType });
    const url = URL.createObjectURL(file);
    appendMessage({
      author: formatPeerLabel(context.peerId, context.user || meta.user),
      text: `${meta.name} arrived`,
      file: {
        url,
        name: meta.name
      }
    });
  },
  onError: (error) => {
    appendMessage({ author: 'System', text: error.message, tone: 'system' });
  }
});

async function startPeer() {
  mesh?.destroy();
  mesh = new BrowserMesh({
    user: createUser(dom.nameInput.value, 'web')
  });

  mesh.on('ready', ({ peerId }) => {
    dom.peerId.textContent = peerId;
    setStatus('Peer ready for files', true);
    appendMessage({ author: 'System', text: `Browser peer ready as ${peerId}`, tone: 'system' });
    renderPeers();
  });

  mesh.on('peer-user', ({ peerId, user }) => {
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} joined`, tone: 'system' });
    renderPeers();
  });

  mesh.on('peer-close', ({ peerId, user }) => {
    appendMessage({ author: 'System', text: `${formatPeerLabel(peerId, user)} left`, tone: 'system' });
    renderPeers();
  });

  mesh.on('message', ({ peerId, user, message }) => {
    if (assembler.handleMessage(message, { peerId, user })) {
      return;
    }

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

async function sendFile(file) {
  if (!mesh) {
    return;
  }

  const peers = mesh.listPeers();
  if (peers.length === 0) {
    appendMessage({ author: 'System', text: 'Connect to at least one peer before sending files.', tone: 'system' });
    return;
  }

  const buffer = await file.arrayBuffer();
  for (const peer of peers) {
    const connection = mesh.connections.get(peer.peerId);
    await sendBufferChunks(connection, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      user: createUser(dom.nameInput.value, 'web'),
      onProgress: ({ id, progress }) => {
        transferState.set(id, {
          id,
          name: file.name,
          direction: 'outbound',
          progress,
          peerId: peer.peerId
        });
        renderTransfers();
      }
    });
  }

  appendMessage({ author: 'You', text: `Shared ${file.name}` });
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

dom.fileInput.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) {
    sendFile(file);
  }
});

dom.dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dom.dropZone.style.borderColor = 'rgba(34, 197, 94, 0.8)';
});

dom.dropZone.addEventListener('dragleave', () => {
  dom.dropZone.style.borderColor = '';
});

dom.dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dom.dropZone.style.borderColor = '';
  const [file] = event.dataTransfer.files;
  if (file) {
    sendFile(file);
  }
});

startPeer();
