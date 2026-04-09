/**
 * ShareModal.jsx — src/apps/mobile/vault/components/ShareModal.jsx
 */
import React, { useState } from 'react';
import { X, Copy, Check, Share2 } from 'lucide-react';
import { createShareLink } from '../utils/shareLinkUtils';
import './ShareModal.css';

const PERMISSIONS = [
  { id: 'view_only',         label: 'View Only',       desc: 'Recipient can request download' },
  { id: 'view_and_download', label: 'View + Download', desc: 'Recipient can download freely'  },
];

const EXPIRY = [
  { id: '1d',   label: '24 hrs'   },
  { id: '7d',   label: '7 days'   },
  { id: '30d',  label: '30 days'  },
  { id: 'none', label: 'No expiry'},
];

export default function ShareModal({ img, onClose }) {
  const [permission,       setPermission]       = useState('view_only');
  const [expiresIn,        setExpiresIn]        = useState('7d');
  const [requireApproval,  setRequireApproval]  = useState(true);
  const [generatedUrl,     setGeneratedUrl]     = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [copied,           setCopied]           = useState(false);
  const [error,            setError]            = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createShareLink(img.assetId || img.id, {
        permission,
        expiresIn,
        requireApproval,
      });
      setGeneratedUrl(result.url);
    } catch (e) {
      setError(e.message || 'Failed to generate link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older WebViews
      const el = document.createElement('input');
      el.value = generatedUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Shared via PINIT',
        text : `I've shared a verified image with you via PINIT.`,
        url  : generatedUrl,
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="sm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sm-sheet">
        <div className="sm-handle" />

        {/* Header */}
        <div className="sm-header">
          <div>
            <p className="sm-title">Share Image</p>
            <p className="sm-sub" title={img.fileName}>{img.fileName || 'Asset'} · UUID embedded</p>
          </div>
          <button className="sm-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {/* Permission */}
        <p className="sm-label">Permission</p>
        <div className="sm-perm-row">
          {PERMISSIONS.map(p => (
            <button
              key={p.id}
              className={`sm-perm-pill ${permission === p.id ? 'sm-perm-pill--on' : ''}`}
              onClick={() => setPermission(p.id)}
            >
              <span className="sm-perm-pill__label">{p.label}</span>
              <span className="sm-perm-pill__desc">{p.desc}</span>
            </button>
          ))}
        </div>

        {/* Expiry */}
        <p className="sm-label">Link Expiry</p>
        <div className="sm-exp-row">
          {EXPIRY.map(e => (
            <button
              key={e.id}
              className={`sm-exp-pill ${expiresIn === e.id ? 'sm-exp-pill--on' : ''}`}
              onClick={() => setExpiresIn(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Toggles */}
        <div className="sm-toggle-row">
          <div>
            <p className="sm-toggle-label">Require download approval</p>
            <p className="sm-toggle-sub">Recipient must request — you approve</p>
          </div>
          <button
            className={`sm-toggle ${requireApproval ? 'sm-toggle--on' : ''}`}
            onClick={() => setRequireApproval(v => !v)}
            disabled={permission === 'view_only'}
            aria-pressed={requireApproval}
          >
            <span className="sm-toggle__thumb" />
          </button>
        </div>

        {/* Error */}
        {error && <p className="sm-error">{error}</p>}

        {/* Generated link */}
        {generatedUrl && (
          <div className="sm-link-box">
            <span className="sm-link-text">{generatedUrl}</span>
            <button className="sm-copy-btn" onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {/* Actions */}
        {!generatedUrl ? (
          <button
            className="sm-primary-btn"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating…' : 'Generate Share Link'}
          </button>
        ) : (
          <>
            <button className="sm-primary-btn" onClick={handleNativeShare}>
              <Share2 size={16} /> Share Link
            </button>
            <button className="sm-ghost-btn" onClick={handleGenerate}>
              Regenerate Link
            </button>
          </>
        )}
      </div>
    </div>
  );
}