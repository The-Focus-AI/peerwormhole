import { createUser } from './modules/common/protocol.js';
import { formatBytes, getMimeType } from './modules/common/format.js';
import { createShareUrl, parseShareInput } from './modules/common/share-code.js';
import { ShareReceiver, ShareSender } from './modules/common/share-session.js';
import { BrowserMesh } from './modules/web/mesh.js';

const dom = {
  acceptButton: document.querySelector('#acceptButton'),
  connectButton: document.querySelector('#connectButton'),
  downloadLink: document.querySelector('#downloadLink'),
  events: document.querySelector('#events'),
  nameInput: document.querySelector('#nameInput'),
  offerMeta: document.querySelector('#offerMeta'),
  peerId: document.querySelector('#peerId'),
  receiveInput: document.querySelector('#receiveInput'),
  receiveProgress: document.querySelector('#receiveProgress'),
  rejectButton: document.querySelector('#rejectButton'),
  restartButton: document.querySelector('#restartButton'),
  scanButton: document.querySelector('#scanButton'),
  scannerPanel: document.querySelector('#scannerPanel'),
  scannerStatus: document.querySelector('#scannerStatus'),
  scannerVideo: document.querySelector('#scannerVideo'),
  sendFileInput: document.querySelector('#sendFileInput'),
  sendMeta: document.querySelector('#sendMeta'),
  shareCode: document.querySelector('#shareCode'),
  sharePhrase: document.querySelector('#sharePhrase'),
  shareQr: document.querySelector('#shareQr'),
  shareUrl: document.querySelector('#shareUrl'),
  statusText: document.querySelector('#statusText'),
  webBase: document.querySelector('#webBase')
};

const state = {
  mesh: null,
  sender: null,
  receiver: null,
  activeOffer: null,
  downloadUrl: null,
  scanLoopId: 0,
  scanStream: null
};

function baseUrl() {
  return new URL('./', window.location.href).toString();
}

function currentUser() {
  return createUser(dom.nameInput.value, 'web');
}

function logEvent(text) {
  const item = document.createElement('div');
  item.className = 'event';
  item.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  dom.events.prepend(item);
}

function setStatus(text) {
  dom.statusText.textContent = text;
}

function setOfferActions(enabled) {
  dom.acceptButton.disabled = !enabled;
  dom.rejectButton.disabled = !enabled;
}

function resetDownloadLink() {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
  }
  dom.downloadLink.classList.add('hidden');
  dom.downloadLink.removeAttribute('href');
  dom.downloadLink.textContent = '';
}

function resetReceiverState() {
  state.activeOffer = null;
  dom.offerMeta.textContent = 'No share offer yet.';
  dom.receiveProgress.textContent = 'Waiting for sender.';
  setOfferActions(false);
  resetDownloadLink();
}

function resetSenderState() {
  if (state.sender) {
    state.sender.stop();
    state.sender = null;
  }
  dom.sendMeta.textContent = 'Choose a file to start a share session.';
  dom.shareCode.value = '';
  dom.sharePhrase.value = '';
  dom.shareUrl.value = '';
  dom.shareQr.removeAttribute('src');
}

function stopScanner() {
  if (state.scanLoopId) {
    cancelAnimationFrame(state.scanLoopId);
    state.scanLoopId = 0;
  }

  if (state.scanStream) {
    for (const track of state.scanStream.getTracks()) {
      track.stop();
    }
    state.scanStream = null;
  }

  dom.scannerPanel.classList.add('hidden');
  dom.scannerStatus.textContent = 'Camera idle.';
  dom.scanButton.textContent = 'Scan QR';
}

async function startScanner() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    dom.scannerPanel.classList.remove('hidden');
    dom.scannerStatus.textContent = 'QR scanning is not available in this browser. Paste the code instead.';
    return;
  }

  if (state.scanStream) {
    stopScanner();
    return;
  }

  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  state.scanStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' }
    }
  });
  dom.scannerVideo.srcObject = state.scanStream;
  await dom.scannerVideo.play();
  dom.scannerPanel.classList.remove('hidden');
  dom.scanButton.textContent = 'Stop scan';
  dom.scannerStatus.textContent = 'Looking for a QR code...';

  const scan = async () => {
    if (!state.scanStream) {
      return;
    }

    try {
      const barcodes = await detector.detect(dom.scannerVideo);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        dom.receiveInput.value = barcodes[0].rawValue;
        dom.scannerStatus.textContent = 'QR code found.';
        stopScanner();
        await connectToSender(barcodes[0].rawValue);
        return;
      }
    } catch (error) {
      dom.scannerStatus.textContent = error.message;
      stopScanner();
      return;
    }

    state.scanLoopId = requestAnimationFrame(scan);
  };

  state.scanLoopId = requestAnimationFrame(scan);
}

function attachReceiver() {
  if (state.receiver) {
    const previousPeerId = state.receiver.senderPeerId;
    state.receiver.stop();
    state.mesh?.connections.get(previousPeerId)?.close();
  }

  const receiver = new ShareReceiver({ mesh: state.mesh });
  receiver.on('connected', () => {
    logEvent('Connected to sender. Waiting for offer.');
  });
  receiver.on('offer', (offer) => {
    state.activeOffer = offer;
    dom.offerMeta.textContent = `${offer.fileName} • ${formatBytes(offer.size)} • ${offer.user?.name || offer.peerId}`;
    dom.receiveProgress.textContent = 'Offer received. Accept to start downloading.';
    setOfferActions(true);
    logEvent(`Offer received for ${offer.fileName}`);
  });
  receiver.on('progress', ({ meta, progress }) => {
    dom.receiveProgress.textContent = `Receiving ${meta.name}: ${progress}%`;
  });
  receiver.on('complete', ({ meta, bytes }) => {
    const blob = new Blob([bytes], { type: meta.mimeType || 'application/octet-stream' });
    state.downloadUrl = URL.createObjectURL(blob);
    dom.downloadLink.href = state.downloadUrl;
    dom.downloadLink.download = meta.name;
    dom.downloadLink.textContent = `Download ${meta.name}`;
    dom.downloadLink.classList.remove('hidden');
    dom.receiveProgress.textContent = `${meta.name} is ready to download.`;
    setOfferActions(false);
    logEvent(`Transfer complete for ${meta.name}`);
  });
  receiver.on('rejected', ({ reason }) => {
    dom.receiveProgress.textContent = reason;
    setOfferActions(false);
    logEvent(reason);
  });
  receiver.on('error', (error) => {
    dom.receiveProgress.textContent = error.message;
    setOfferActions(false);
    logEvent(error.message);
  });
  state.receiver = receiver;
}

async function connectToSender(inputValue) {
  const parsed = parseShareInput(inputValue);
  if (!state.mesh) {
    await startMesh();
  }

  resetReceiverState();
  attachReceiver();
  state.receiver.connectTo(parsed.peerId);
  dom.receiveProgress.textContent = `Connecting to ${parsed.peerId}...`;
}

function attachSender(buffer, file) {
  if (state.sender) {
    state.sender.stop();
  }

  const sender = new ShareSender({
    mesh: state.mesh,
    user: currentUser(),
    buffer,
    fileName: file.name,
    mimeType: file.type || getMimeType(file.name)
  });

  sender.on('offer', ({ peerId }) => {
    logEvent(`Receiver connected: ${peerId}`);
  });
  sender.on('accepted', ({ peerId, user }) => {
    logEvent(`Transfer accepted by ${user?.name || peerId}`);
  });
  sender.on('progress', ({ fileName, progress }) => {
    dom.sendMeta.textContent = `Sending ${fileName}: ${progress}%`;
  });
  sender.on('complete', () => {
    dom.sendMeta.textContent = `${file.name} sent successfully.`;
    logEvent(`Transfer complete for ${file.name}`);
  });
  sender.on('rejected', ({ reason }) => {
    dom.sendMeta.textContent = reason;
    logEvent(reason);
  });
  sender.on('error', (error) => {
    dom.sendMeta.textContent = error.message;
    logEvent(error.message);
  });

  state.sender = sender;
}

async function updateSendInvite(file) {
  const buffer = await file.arrayBuffer();
  attachSender(buffer, file);
  const invite = state.sender.createInvite();
  const url = createShareUrl(baseUrl(), invite.code);

  dom.sendMeta.textContent = `${file.name} • ${formatBytes(file.size)} • waiting for receiver`;
  dom.shareCode.value = invite.code;
  dom.sharePhrase.value = invite.phrase;
  dom.shareUrl.value = url;
  dom.shareQr.src = await window.QRCodeBrowser.toDataURL(url, { margin: 1, width: 260 });
  logEvent(`Share ready for ${file.name}`);
}

async function startMesh() {
  stopScanner();

  if (state.mesh) {
    if (state.sender) {
      state.sender.stop();
    }
    if (state.receiver) {
      state.receiver.stop();
    }
    state.mesh.destroy();
  }

  resetSenderState();
  resetReceiverState();

  const mesh = new BrowserMesh({
    user: currentUser()
  });
  mesh.on('ready', ({ peerId }) => {
    dom.peerId.textContent = peerId;
    dom.webBase.textContent = baseUrl();
    setStatus('Peer ready for send and receive');
    logEvent(`Peer ready as ${peerId}`);
  });
  mesh.on('error', (error) => {
    setStatus(error.message);
    logEvent(error.message);
  });
  mesh.on('peer-user', ({ peerId, user }) => {
    logEvent(`${user?.name || peerId} connected`);
  });
  mesh.on('peer-close', ({ peerId, user }) => {
    logEvent(`${user?.name || peerId} disconnected`);
  });

  state.mesh = mesh;
  setStatus('Starting peer...');
  await mesh.start();
}

dom.restartButton.addEventListener('click', () => {
  startMesh();
});

dom.sendFileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    if (!state.mesh) {
      await startMesh();
    }
    await updateSendInvite(file);
  } catch (error) {
    dom.sendMeta.textContent = error.message;
    logEvent(error.message);
  } finally {
    dom.sendFileInput.value = '';
  }
});

dom.connectButton.addEventListener('click', async () => {
  try {
    await connectToSender(dom.receiveInput.value);
  } catch (error) {
    dom.receiveProgress.textContent = error.message;
    logEvent(error.message);
  }
});

dom.acceptButton.addEventListener('click', () => {
  if (!state.receiver || !state.activeOffer) {
    return;
  }

  state.receiver.accept();
  dom.receiveProgress.textContent = `Receiving ${state.activeOffer.fileName}...`;
  setOfferActions(false);
});

dom.rejectButton.addEventListener('click', () => {
  if (!state.receiver || !state.activeOffer) {
    return;
  }

  state.receiver.reject('Receiver declined the transfer.');
  dom.receiveProgress.textContent = 'Transfer declined.';
  setOfferActions(false);
});

dom.scanButton.addEventListener('click', () => {
  startScanner().catch((error) => {
    dom.scannerPanel.classList.remove('hidden');
    dom.scannerStatus.textContent = error.message;
    logEvent(error.message);
  });
});

await startMesh();

const startupCode = new URL(window.location.href).searchParams.get('code');
if (startupCode) {
  dom.receiveInput.value = startupCode;
  connectToSender(startupCode).catch((error) => {
    dom.receiveProgress.textContent = error.message;
    logEvent(error.message);
  });
}
