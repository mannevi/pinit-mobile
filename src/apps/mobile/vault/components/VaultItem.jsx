/**
 * VaultItem.jsx — src/apps/mobile/vault/components/VaultItem.jsx
 * Single card in the vault list. Clicking opens VaultDetail.
 */

import React from 'react';
import { CheckCircle, Image as ImageIcon, ChevronRight } from 'lucide-react';

const fmtShort = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const confStyle = (c) => c >= 90
  ? { bg: 'rgba(59,130,246,.12)', color: '#60a5fa' }
  : c >= 70
    ? { bg: 'rgba(245,158,11,.12)', color: '#fbbf24' }
    : { bg: 'rgba(239,68,68,.12)',  color: '#f87171' };

function VaultItem({ img, selected, onSelect, onClick }) {
  const id   = img.id || img.assetId;
  const conf = img.confidence || 95;
  const cs   = confStyle(conf);

  return (
    <div
      className={`v-card ${selected ? 'v-card--sel' : ''}`}
      onClick={() => onClick(img)}
      style={{ cursor: 'pointer' }}
    >
      {/* Checkbox — stops propagation so it doesn't open detail */}
      <input
        type="checkbox"
        className="v-card__chk"
        checked={selected}
        onChange={e => { e.stopPropagation(); onSelect(id); }}
        onClick={e => e.stopPropagation()}
      />

      {/* Thumbnail */}
      <div className="v-card__thumb">
        {img.thumbnail
          ? <img src={img.thumbnail} alt="" />
          : <div className="thumb-ph"><ImageIcon size={18} /></div>}
      </div>

      {/* Body */}
      <div className="v-card__body">
        <p className="v-card__name">{img.fileName}</p>
        <p className="v-card__meta">{fmtShort(img.dateEncrypted)}</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 3 }}>
          <span className="chip chip--ok">
            <CheckCircle size={10} /> Verified
          </span>
          <span className="chip" style={{ background: cs.bg, color: cs.color }}>
            {conf}%
          </span>
        </div>
        {img.detected_case && (
          <p style={{ fontSize: 10, color: 'var(--accent)', margin: '2px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {img.detected_case}
          </p>
        )}
        {img.analysis_summary && (
          <p style={{ fontSize: 10, color: 'var(--text-3)', margin: '1px 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {img.analysis_summary}
          </p>
        )}
      </div>

      {/* Chevron — indicates tappable */}
      <ChevronRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </div>
  );
}

export default VaultItem;