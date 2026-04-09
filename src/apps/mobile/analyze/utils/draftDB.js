/**
 * draftDB.js — src/apps/mobile/analyze/utils/draftDB.js
 *
 * IndexedDB-based draft storage.
 * Replaces the old localStorage getDrafts/persistDrafts helpers.
 *
 * WHY: localStorage has a hard ~5 MB quota per origin.
 * A single full-resolution PNG camera capture (UUID-embedded) can be 3–7 MB
 * in base64, which means the second draft write always fails silently.
 * IndexedDB has no practical per-entry size limit (typically 50–80 % of disk).
 *
 * API (all async):
 *   idbGetDrafts()          → Draft[]     sorted newest-first
 *   idbSaveDraft(draft)     → void        keeps max 10 drafts (evicts oldest)
 *   idbDeleteDraft(id)      → void
 *   idbClearDrafts()        → void
 */

const DB_NAME    = 'pinit_drafts_db';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;
const MAX_DRAFTS = 10;

// ── Open / upgrade ─────────────────────────────────────────────────────────────
const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // keyPath = 'id' (number — Date.now())
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });

// ── Get all drafts (newest first) ─────────────────────────────────────────────
export const idbGetDrafts = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.getAll();
      req.onsuccess = () =>
        resolve(
          (req.result || []).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        );
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('idbGetDrafts failed:', err);
    return [];
  }
};

// ── Save a draft (evicts oldest when limit reached) ───────────────────────────
export const idbSaveDraft = async (draft) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Read all to enforce MAX_DRAFTS
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const existing = (getAllReq.result || []).sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
        );

        // Evict oldest if we're at the limit
        if (existing.length >= MAX_DRAFTS) {
          const oldest = existing.slice(MAX_DRAFTS - 1);
          oldest.forEach((d) => store.delete(d.id));
        }

        const putReq = store.put(draft);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      };
      getAllReq.onerror = () => reject(getAllReq.error);
    });
  } catch (err) {
    console.warn('idbSaveDraft failed:', err);
    throw err;
  }
};

// ── Delete a single draft ─────────────────────────────────────────────────────
export const idbDeleteDraft = async (id) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.warn('idbDeleteDraft failed:', err);
  }
};

// ── Clear all drafts ──────────────────────────────────────────────────────────
export const idbClearDrafts = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.warn('idbClearDrafts failed:', err);
  }
};