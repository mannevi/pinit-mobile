/**
 * vaultStorage.js — src/apps/mobile/vault/utils/vaultStorage.js
 *
 * KEY FIXES:
 *  1. loadVaultAssets() — enriches every asset with its locally cached full
 *     image so VaultDetail shows the real image, not the 80×80 thumbnail.
 *  2. downloadImage() — reads device cache first (full lossless PNG with UUID).
 *     Falls back to backend URL only if nothing is cached locally.
 *  3. deleteVaultAsset() — evicts the local cache entry when deleting.
 */

import { vaultAPI } from '../../../../api/client';
import {
  cacheVaultFullImage,
  getVaultCachedImage,
  evictVaultCachedImage,
} from './vaultImageCache';

export const BLACKLIST_KEY = 'pinit_deleted_ids';

// ── Blacklist ──────────────────────────────────────────────────────────────────
export const getBlacklist = () => {
  try { return JSON.parse(localStorage.getItem(BLACKLIST_KEY) || '[]'); }
  catch { return []; }
};

export const addToBlacklist = (id) => {
  const bl = getBlacklist();
  if (!bl.includes(id)) {
    bl.push(id);
    localStorage.setItem(BLACKLIST_KEY, JSON.stringify(bl));
  }
};

// ── Asset mapping ──────────────────────────────────────────────────────────────
export const mapAsset = (a) => ({
  ...a,
  id               : a.asset_id          || a.id,
  assetId          : a.asset_id          || a.id,
  fileName         : a.file_name         || 'Unknown',
  fileSize         : a.file_size         || '—',
  ownerName        : a.owner_name        || a.owner_email || '—',
  ownerEmail       : a.owner_email       || '—',
  dateEncrypted    : a.created_at,
  captureTimestamp : a.capture_timestamp || null,
  thumbnail        : a.thumbnail_url,
  // full image from backend (only available if backend supports full_image_url)
  fullImage        : a.full_image_url    || null,
  confidence       : a.confidence        || 95,
  detected_case    : a.detected_case     || null,
  analysis_summary : a.analysis_summary  || null,
  resolution       : a.resolution        || null,
  deviceName       : a.device_name       || null,
  ipAddress        : a.ip_address        || null,
  gpsLocation      : (a.gps_latitude && a.gps_longitude) ? {
    available   : true,
    latitude    : parseFloat(a.gps_latitude),
    longitude   : parseFloat(a.gps_longitude),
    coordinates : `${parseFloat(a.gps_latitude).toFixed(6)}, ${parseFloat(a.gps_longitude).toFixed(6)}`,
    mapsUrl     : `https://www.google.com/maps?q=${a.gps_latitude},${a.gps_longitude}`,
    source      : a.gps_source || 'Embedded',
  } : { available: false },
});

// ── Load ───────────────────────────────────────────────────────────────────────
export const loadVaultAssets = async () => {
  const res = await vaultAPI.list();
  const bl  = getBlacklist();
  const assets = (res.assets || [])
    .filter(a => !bl.includes(a.asset_id) && !bl.includes(a.id))
    .map(mapAsset);

  // Enrich each asset with the locally cached full image.
  // This is what makes VaultDetail show the real full-resolution image
  // instead of the 80×80 thumbnail from the backend.
  await Promise.allSettled(
    assets.map(async (asset) => {
      const cached = await getVaultCachedImage(asset.assetId);
      if (cached) asset.fullImage = cached;
    })
  );

  return assets;
};

// ── Delete ─────────────────────────────────────────────────────────────────────
export const deleteVaultAsset = async (id) => {
  addToBlacklist(id);
  try { await vaultAPI.delete(id); } catch (e) { console.warn('Backend delete failed:', e.message); }
  // Clean up device cache so the image isn't orphaned
  evictVaultCachedImage(id);
};

// ── Download ───────────────────────────────────────────────────────────────────
export const downloadImage = async (img) => {
  // Priority order:
  // 1. Device-local cache (full lossless PNG, set when user saved to vault)
  // 2. Backend full_image_url (if backend supports it)
  // 3. Thumbnail fallback (80×80 JPEG — download still works, but re-upload won't recover UUID)
  const cached = await getVaultCachedImage(img.assetId || img.id);
  const src    = cached || img.full_image_url || img.fullImage || img.thumbnail_url || img.thumbnail;

  if (!src) throw new Error('Image not available');

  const isAPK = !!(window.Capacitor?.isNativePlatform?.());

  // Detect MIME type from data URI or filename
  let mimeType = 'image/jpeg';
  if (src.startsWith('data:image/')) {
    const m = src.match(/^data:(image\/[^;,]+)/);
    if (m) mimeType = m[1];
  } else if ((img.fileName || '').toLowerCase().endsWith('.png')) {
    mimeType = 'image/png';
  }

  // Resolve to base64
  let b64;
  if (src.startsWith('data:')) {
    b64 = src.split(',')[1];
  } else {
    const res  = await fetch(src);
    const blob = await res.blob();
    const ct   = res.headers.get('content-type') || '';
    if      (ct.includes('png'))  mimeType = 'image/png';
    else if (ct.includes('jpeg') || ct.includes('jpg')) mimeType = 'image/jpeg';
    b64 = await new Promise(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result.split(',')[1]);
      r.readAsDataURL(blob);
    });
  }

  // Build filename — always pinit-ASSETID.png so re-upload is traceable
  const assetId = img.assetId || img.id || 'unknown';
  const ext     = mimeType === 'image/png' ? '.png' : '.jpg';
  const name    = `pinit-${assetId}${ext}`;

  if (isAPK) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const path = `pinit_dl_${Date.now()}_${name}`;
    await Filesystem.writeFile({ path, data: b64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    try {
      const { Media } = await import('@capacitor-community/media');
      await Media.savePhoto({ path: uri });
      alert('✅ Saved to Gallery!');
    } catch {
      try {
        await Filesystem.writeFile({
          path: `Pictures/PINIT/${name}`, data: b64,
          directory: Directory.ExternalStorage, recursive: true,
        });
        alert('✅ Saved to Pictures/PINIT!');
      } catch { alert('✅ Saved. Open Files app to find it.'); }
    }
    Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  } else {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bUrl  = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const a     = document.createElement('a');
    a.href = bUrl; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(bUrl), 1000);
  }
};