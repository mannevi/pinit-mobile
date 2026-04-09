const DB_NAME    = 'pinit_vault_img_cache';
const STORE_NAME = 'images';

const _open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME))
      db.createObjectStore(STORE_NAME, { keyPath: 'assetId' });
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror   = () => reject(req.error);
});

/**
 * Save the full encrypted PNG for an asset.
 * Called right after vaultAPI.save() in handleSaveVault.
 */
export const cacheVaultFullImage = async (assetId, base64DataUrl) => {
  if (!assetId || !base64DataUrl) return;
  try {
    const db = await _open();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ assetId, base64: base64DataUrl, savedAt: Date.now() });
  } catch (e) {
    console.warn('vaultImageCache write failed (non-critical):', e);
  }
};

/**
 * Retrieve the cached full PNG for an asset.
 * Returns base64 data URL string, or null if not cached.
 */
export const getVaultCachedImage = async (assetId) => {
  if (!assetId) return null;
  try {
    const db = await _open();
    return new Promise((resolve) => {
      const req = db.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME).get(assetId);
      req.onsuccess = () => resolve(req.result?.base64 || null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
};

/**
 * Remove cached image when the vault asset is deleted.
 */
export const evictVaultCachedImage = async (assetId) => {
  if (!assetId) return;
  try {
    const db = await _open();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(assetId);
  } catch { /* non-critical */ }
};