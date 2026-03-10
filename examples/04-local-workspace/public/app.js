import { BridgeClient } from '/shared/web/bridge-client.js';

const dom = {
  connectButton: document.querySelector('#connectButton'),
  downloads: document.querySelector('#downloads'),
  fileInput: document.querySelector('#fileInput'),
  messageForm: document.querySelector('#messageForm'),
  messageInput: document.querySelector('#messageInput'),
  messages: document.querySelector('#messages'),
  peerId: document.querySelector('#peerId'),
  peers: document.querySelector('#peers'),
  targetInput: document.querySelector('#targetInput'),
  transfers: document.querySelector('#transfers'),
  userName: document.querySelector('#userName')
};

const client = new BridgeClient();
let currentState = null;

function renderHistory() {
  dom.messages.innerHTML = '';
  for (const entry of currentState?.history || []) {
    const article = document.createElement('article');
    article.className = `message ${entry.kind === 'system' ? 'system' : ''}`;
    let body = `<div>${entry.text}</div>`;
    if (entry.file?.url) {
      body += `<div><a class="file-link" href="${entry.file.url}" download="${entry.file.name}">Download ${entry.file.name}</a></div>`;
    }
    article.innerHTML = `
      <div class="meta">${new Date(entry.sentAt).toLocaleTimeString()} • ${entry.user?.name || 'System'}</div>
      ${body}
    `;
    dom.messages.append(article);
  }
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function renderPeers() {
  dom.peers.innerHTML = '';
  const peers = currentState?.peers || [];
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
    item.textContent = `${peer.user?.name || 'Unknown'} (${peer.peerId})`;
    dom.peers.append(item);
  }
}

function renderTransfers() {
  dom.transfers.innerHTML = '';
  const transfers = currentState?.transfers || [];
  if (transfers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'peer-chip';
    empty.textContent = 'No transfers yet';
    dom.transfers.append(empty);
    return;
  }

  for (const transfer of transfers) {
    const item = document.createElement('div');
    item.className = 'peer-chip';
    item.textContent = `${transfer.direction === 'outbound' ? 'Sending' : 'Receiving'} ${transfer.name} • ${transfer.progress}%`;
    dom.transfers.append(item);
  }
}

function renderDownloads() {
  dom.downloads.innerHTML = '';
  const files = currentState?.files || [];
  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'peer-chip';
    empty.textContent = 'No downloads yet';
    dom.downloads.append(empty);
    return;
  }

  for (const file of files) {
    const item = document.createElement('a');
    item.className = 'peer-chip';
    item.href = file.url;
    item.download = file.name;
    item.textContent = `${file.name} • ${file.receivedFrom}`;
    dom.downloads.append(item);
  }
}

function renderState(state) {
  currentState = state;
  dom.peerId.textContent = state.peerId || 'pending';
  dom.userName.textContent = state.user?.name || 'pending';
  renderHistory();
  renderPeers();
  renderTransfers();
  renderDownloads();
}

client.on('state', (state) => renderState(state));
client.on('history', (history) => {
  currentState = { ...(currentState || {}), history };
  renderHistory();
});
client.on('files', (files) => {
  currentState = { ...(currentState || {}), files };
  renderDownloads();
});
client.on('transfer', (transfers) => {
  currentState = { ...(currentState || {}), transfers };
  renderTransfers();
});

dom.connectButton.addEventListener('click', async () => {
  const peerId = dom.targetInput.value.trim();
  if (!peerId) {
    return;
  }
  await client.connect(peerId);
  dom.targetInput.value = '';
});

dom.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = dom.messageInput.value.trim();
  if (!text) {
    return;
  }
  await client.sendChat(text, 'general');
  dom.messageInput.value = '';
});

dom.fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }
  await client.uploadFile(file, 'general');
  dom.fileInput.value = '';
});

await client.start();
