/**
 * VaultDetail.jsx — src/apps/mobile/vault/components/VaultDetail.jsx
 * Only change from original: imports ShareModal + controls shareModal state.
 * The onShare prop from parent is no longer needed for the modal — it opens inline.
 */

import React, { useState } from 'react';
import {
  ArrowLeft, Download, Eye, Share2, Award, Trash2,
  CheckCircle, Shield, Image as ImageIcon, X,
} from 'lucide-react';
import ShareModal from './ShareModal';   // ← NEW

const fmt = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const confMeta = (c) => c >= 90
  ? { bg: 'rgba(59,130,246,.12)', color: '#60a5fa', label: 'High Trust' }
  : c >= 70
    ? { bg: 'rgba(245,158,11,.12)', color: '#fbbf24', label: 'Moderate Trust' }
    : { bg: 'rgba(239,68,68,.12)',  color: '#f87171', label: 'Low Trust' };

function VaultDetail({ img, onBack, onDownload, onShare, onGenerateCert, onDelete }) {
  const [fullscreen,   setFullscreen]   = useState(false);
  const [shareVisible, setShareVisible] = useState(false);  // ← NEW

  if (!img) return null;
  const conf = img.confidence || 95;
  const cm   = confMeta(conf);

  const isModified = img.detected_case?.includes('Cropped') ||
                     img.detected_case?.includes('Modified');

  return (
    <div className="vd-screen">

      {/* ── Fullscreen overlay ── */}
      {fullscreen && (
        <div className="vd-fullscreen" onClick={() => setFullscreen(false)}>
          <button className="vd-fullscreen__close" onClick={() => setFullscreen(false)} aria-label="Close fullscreen">
            <X size={20} />
          </button>
          <span className="vd-fullscreen__name">{img.fileName}</span>
          <img
            src={img.fullImage || img.thumbnail}
            alt={img.fileName}
            className="vd-fullscreen__img"
            onClick={e => e.stopPropagation()}
          />
          <span className="vd-fullscreen__hint">Tap outside to close</span>
        </div>
      )}

      {/* ── Share Modal ── */}   {/* ← NEW */}
      {shareVisible && (
        <ShareModal
          img={img}
          onClose={() => setShareVisible(false)}
        />
      )}

      {/* ── Top bar ── */}
      <div className="vd-topbar">
        <button className="vd-back" onClick={onBack} aria-label="Back to vault">
          <ArrowLeft size={20} />
        </button>
        <span className="vd-topbar__title">Asset Details</span>
        <button className="vd-dl-btn" onClick={() => onDownload(img)} aria-label="Download image">
          <Download size={18} />
        </button>
      </div>

      <div className="vd-body">

        {/* ── Image preview ── */}
        <div className="vd-img-wrap">
          {img.fullImage || img.thumbnail
            ? <img src={img.fullImage || img.thumbnail} alt={img.fileName} className="vd-img" />
            : <div className="vd-img-ph"><ImageIcon size={48} /></div>}
          <button className="vd-view-btn" onClick={() => setFullscreen(true)} aria-label="View full image">
            <Eye size={13} /> View Full
          </button>
        </div>

        {/* ── Status + confidence ── */}
        <div className="vd-status-row">
          <span className="vd-status-badge">
            <CheckCircle size={13} /> Verified
          </span>
          <span className="vd-conf-badge" style={{ background: cm.bg, color: cm.color }}>
            {conf}% {cm.label}
          </span>
        </div>

        {img.detected_case && (
          <div className="vd-case-banner">{img.detected_case}</div>
        )}

        {img.analysis_summary && (
          <div className="vd-insight">💡 {img.analysis_summary}</div>
        )}

        {/* ── Ownership details ── */}
        <div className="vd-section">
          <p className="vd-section__title">Ownership at Creation</p>
          <div className="vd-rows">
            {[
              ['File Name',     img.fileName],
              ['File Size',     img.fileSize],
              ['Resolution',    img.resolution],
              ['Registered On', fmt(img.dateEncrypted)],
              ['Captured On',   fmt(img.captureTimestamp)],
              ['Owner',         img.ownerName],
              ['Email',         img.ownerEmail],
              ['Device',        img.deviceName],
              ['IP Address',    img.ipAddress],
              ['Asset ID',      img.assetId],
            ].filter(([, v]) => v && v !== '—').map(([l, v]) => (
              <div key={l} className="vd-row">
                <span className="vd-row__lbl">{l}</span>
                <span className="vd-row__val">{v}</span>
              </div>
            ))}

            {img.gpsLocation?.available && (
              <div className="vd-row">
                <span className="vd-row__lbl">Capture GPS</span>
                <a
                  href={img.gpsLocation.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--accent)', textAlign: 'right' }}
                >
                  📍 {img.gpsLocation.coordinates}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── Integrity note ── */}
        <div className="vd-integrity" style={isModified ? {
          background: 'rgba(245,158,11,.06)',
          border: '1px solid rgba(245,158,11,.15)',
          color: '#fbbf24',
        } : {}}>
          <Shield size={13} />
          <span>
            {isModified
              ? '⚠️ Modifications detected after registration'
              : '✅ No changes detected since registration'}
          </span>
        </div>

        {/* ── Primary actions ── */}
        <div className="vd-actions-primary">
          {/* ↓ onClick now opens ShareModal instead of calling onShare prop */}
          <button className="vd-action-btn vd-action-btn--share" onClick={() => setShareVisible(true)}>
            <Share2 size={18} />
            <span>Share Image</span>
          </button>
          <button className="vd-action-btn vd-action-btn--cert" onClick={() => onGenerateCert(img)}>
            <Award size={18} />
            <span>Generate Certificate</span>
          </button>
        </div>

        {/* ── Danger: Delete ── */}
        <button className="vd-action-btn vd-action-btn--delete" onClick={() => onDelete(img.id || img.assetId)}>
          <Trash2 size={18} />
          <span>Delete from Vault</span>
        </button>

      </div>
    </div>
  );
}

export default VaultDetail;