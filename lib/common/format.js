const MIME_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json'],
  ['.md', 'text/markdown'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.zip', 'application/zip']
]);

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function getMimeType(fileName) {
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex === -1) {
    return 'application/octet-stream';
  }

  const extension = fileName.slice(extensionIndex).toLowerCase();
  return MIME_TYPES.get(extension) || 'application/octet-stream';
}
