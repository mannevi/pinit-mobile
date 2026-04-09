/**
 * shareLinkUtils.js — src/apps/mobile/vault/utils/shareLinkUtils.js
 */

const API_BASE = 'https://pinit-backend.onrender.com';

const getAuthToken = () =>
  sessionStorage.getItem('pinit_token') || localStorage.getItem('savedToken') || '';

// ── Existing helpers (unchanged) ──────────────────────────────────────────────
export const generateToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

export const getShareBase = () =>
  window.location.origin.includes('localhost')
    ? 'https://image-crypto-analyzer.vercel.app'
    : window.location.origin;

export const buildShareUrl = (token) => `${getShareBase()}/share/image/${token}`;

// ── Create share link (NEW — replaces saveShareLink) ─────────────────────────
// options: { permission, expiresIn, requireApproval }
export const createShareLink = async (assetId, options) => {
  const res = await fetch(`${API_BASE}/api/share-links`, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      asset_id        : assetId,
      permission      : options.permission,       // 'view_only' | 'view_and_download'
      expires_in      : options.expiresIn,        // '1d' | '7d' | '30d' | 'none'
      require_approval: options.requireApproval,  // boolean
    }),
  });
  if (!res.ok) throw new Error('Could not create share link');
  return res.json(); // { id, token, url, permission, expires_at, status }
};

// ── List all share links for current user ─────────────────────────────────────
export const listShareLinks = async () => {
  const res = await fetch(`${API_BASE}/api/share-links`, {
    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch share links');
  const data = await res.json();
  return data.links;
};

// ── Revoke a share link ───────────────────────────────────────────────────────
export const revokeShareLink = async (linkId) => {
  const res = await fetch(`${API_BASE}/api/share-links/${linkId}`, {
    method : 'DELETE',
    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error('Revoke failed');
  return res.json();
};

// ── Approve a download request ────────────────────────────────────────────────
export const approveDownloadRequest = async (linkId, requestId) => {
  const res = await fetch(`${API_BASE}/api/share-links/${linkId}/approve`, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ request_id: requestId }),
  });
  if (!res.ok) throw new Error('Approval failed');
  return res.json();
};

// ── Get activity for a specific link ─────────────────────────────────────────
export const getShareLinkActivity = async (linkId) => {
  const res = await fetch(`${API_BASE}/api/share-links/${linkId}/activity`, {
    headers: { 'Authorization': `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch activity');
  return res.json(); // { events: [], requests: [] }
};

// ── Validate a share link — used by SharedImagePage (public, no auth) ─────────
export const validateShareLink = async (token) => {
  try {
    const res = await fetch(`${API_BASE}/vault/share/${token}`);
    if (res.status === 404) return { valid: false, reason: 'not_found' };
    if (!res.ok)            return { valid: false, reason: 'error' };
    const data = await res.json();
    if (data.is_revoked) return { valid: false, reason: 'revoked' };
    if (data.expires_at && new Date(data.expires_at) < new Date())
      return { valid: false, reason: 'expired' };
    return {
      valid        : true,
      imageUrl     : data.thumbnail_url || data.image_url || null,
      fileName     : data.file_name     || 'Shared Image',
      allowDownload: data.allow_download || false,
      requireApproval: data.require_approval || true,
      expiresAt    : data.expires_at,
    };
  } catch (e) {
    return { valid: false, reason: 'error', message: e.message };
  }
};

// ── Submit download request — used by SharedImagePage (public, no auth) ───────
export const submitDownloadRequest = async (token, { recipientName, recipientEmail, reason }) => {
  const res = await fetch(`${API_BASE}/api/public/share/${token}/request-download`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify({
      recipient_name : recipientName,
      recipient_email: recipientEmail,
      reason,
    }),
  });
  if (!res.ok) throw new Error('Could not submit request');
  return res.json();
};