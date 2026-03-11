import { MESSAGE_TYPES, createTransferId, sanitizeFileName } from './protocol.js';

export const DEFAULT_CHUNK_SIZE = 64 * 1024;

export function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return new Uint8Array(data);
}

export function concatChunks(chunks, totalSize) {
  const output = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(toUint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return output;
}

function waitForDrain(connection, threshold = 0) {
  return new Promise((resolve) => {
    const dc = connection.dataChannel || connection._dc;
    if (!dc || dc.bufferedAmount <= threshold) {
      resolve();
      return;
    }
    const check = () => {
      if (!dc || dc.readyState !== 'open' || dc.bufferedAmount <= threshold) {
        resolve();
        return;
      }
      setTimeout(check, 50);
    };
    setTimeout(check, 50);
  });
}

export async function sendBufferChunks(connection, {
  buffer,
  fileName,
  mimeType = 'application/octet-stream',
  user,
  chunkSize = DEFAULT_CHUNK_SIZE,
  onProgress
}) {
  const transferId = createTransferId();
  const bytes = toUint8Array(buffer);
  const totalChunks = Math.ceil(bytes.byteLength / chunkSize) || 1;
  const meta = {
    type: MESSAGE_TYPES.fileMeta,
    id: transferId,
    name: sanitizeFileName(fileName),
    size: bytes.byteLength,
    mimeType,
    totalChunks,
    user,
    sentAt: new Date().toISOString()
  };

  connection.send(meta);

  // High-water mark: pause sending when buffered data exceeds this
  const highWaterMark = chunkSize * 8;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, bytes.byteLength);
    const chunk = bytes.slice(start, end);

    connection.send({
      type: MESSAGE_TYPES.fileChunk,
      id: transferId,
      chunkIndex,
      data: chunk
    });

    onProgress?.({
      direction: 'outbound',
      id: transferId,
      fileName: meta.name,
      progress: Math.round(((chunkIndex + 1) / totalChunks) * 100)
    });

    // Apply backpressure so we don't overwhelm the data channel
    await waitForDrain(connection, highWaterMark);
  }

  connection.send({
    type: MESSAGE_TYPES.fileComplete,
    id: transferId
  });

  // Wait for all buffered data to flush before returning
  await waitForDrain(connection);

  return meta;
}

export function createTransferAssembler({
  onStart,
  onProgress,
  onComplete,
  onError
} = {}) {
  const transfers = new Map();
  const runHook = (hook, payload, fallback) => {
    try {
      const result = hook?.(payload);
      if (result && typeof result.then === 'function') {
        result.catch((error) => fallback(error));
      }
    } catch (error) {
      fallback(error);
    }
  };

  function handleMessage(message, context = {}) {
    try {
      if (!message || typeof message !== 'object') {
        return false;
      }

      if (message.type === MESSAGE_TYPES.fileMeta) {
        transfers.set(message.id, {
          meta: message,
          chunks: new Array(message.totalChunks),
          receivedChunks: 0
        });
        runHook(onStart, { meta: message, context }, (error) => onError?.(error, { message, context }));
        return true;
      }

      if (message.type === MESSAGE_TYPES.fileChunk) {
        const transfer = transfers.get(message.id);
        if (!transfer) {
          throw new Error(`Missing transfer metadata for ${message.id}`);
        }

        if (!transfer.chunks[message.chunkIndex]) {
          transfer.receivedChunks += 1;
        }
        transfer.chunks[message.chunkIndex] = toUint8Array(message.data);

        runHook(onProgress, {
          meta: transfer.meta,
          context,
          progress: Math.round((transfer.receivedChunks / transfer.meta.totalChunks) * 100)
        }, (error) => onError?.(error, { message, context }));
        return true;
      }

      if (message.type === MESSAGE_TYPES.fileComplete) {
        const transfer = transfers.get(message.id);
        if (!transfer) {
          throw new Error(`Missing transfer metadata for ${message.id}`);
        }

        const bytes = concatChunks(transfer.chunks, transfer.meta.size);
        transfers.delete(message.id);
        runHook(onComplete, { meta: transfer.meta, bytes, context }, (error) => onError?.(error, { message, context }));
        return true;
      }

      return false;
    } catch (error) {
      onError?.(error, { message, context });
      return true;
    }
  }

  return {
    handleMessage,
    transfers
  };
}
