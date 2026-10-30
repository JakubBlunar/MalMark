import { createHash, createPublicKey } from 'node:crypto';

export function buildConfig(store, env = {}, supplied) {
  const distribution = store ? 'store' : 'unpacked';
  const clientId = store ? (supplied?.clientId ?? env.VITE_MAL_CLIENT_ID ?? '').trim() : '';
  const chromiumPublicKey = store
    ? (supplied?.chromiumPublicKey ?? env.VITE_CHROMIUM_PUBLIC_KEY ?? '').replace(/\s/g, '')
    : '';
  if (store && !/^[a-zA-Z0-9_-]{8,128}$/.test(clientId))
    throw new Error('Store builds require VITE_MAL_CLIENT_ID (public app ID, never a secret).');
  if (chromiumPublicKey) {
    try {
      createPublicKey({
        key: Buffer.from(chromiumPublicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
    } catch {
      throw new Error(
        'VITE_CHROMIUM_PUBLIC_KEY must be the base64 public key from the Chrome Web Store dashboard.',
      );
    }
  }
  return { distribution, clientId, chromiumPublicKey };
}

export function chromiumId(publicKey) {
  return [
    ...createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 32),
  ]
    .map((character) => String.fromCharCode(97 + parseInt(character, 16)))
    .join('');
}

export function packageManifest(manifest, target, distribution) {
  const packaged = { ...manifest };
  // The key pins an unpacked local test build; the Web Store owns its upload identity.
  if (target === 'chromium' && distribution === 'store') delete packaged.key;
  return packaged;
}
