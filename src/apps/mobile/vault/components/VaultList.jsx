/**
 * VaultList.jsx — src/apps/mobile/vault/components/VaultList.jsx
 * The vault list view. Pure display — all logic stays in Vault.jsx.
 */

import React from 'react';
import { RefreshCw, FileSearch, Trash2 } from 'lucide-react';
import VaultItem from './VaultItem';

const Skel = () => (
  <div className="skeleton">
    <div className="skeleton__bar skeleton__bar--sm" />
    <div className="skeleton__bar" />
    <div className="skeleton__bar skeleton__bar--lg" />
  </div>
);

const Empty = ({ icon, title, subtitle, action, onAction }) => (
  <div className="empty">
    <span className="empty__icon">{icon}</span>
    <p className="empty__title">{title}</p>
    {subtitle && <p className="empty__sub">{subtitle}</p>}
    {action && <button className="ghost-cta" onClick={onAction}>{action}</button>}
  </div>
);

function VaultList({
  vault,
  loading,
  search,
  selected,
  onSearchChange,
  onToggleSelect,
  onItemClick,
  onDeleteSelected,
  onRefresh,
  onGoToAnalyzer,
}) {
  const filtered = vault.filter(x => {
    if (!search) return true;
    const q = search.toLowerCase();
    return x.fileName?.toLowerCase().includes(q)
        || x.ownerName?.toLowerCase().includes(q)
        || x.ownerEmail?.toLowerCase().includes(q)
        || x.assetId?.toLowerCase().includes(q);
  });

  return (
    <div className="screen">
      {/* Header */}
      <div className="page-hdr">
        <div>
          <h1 className="page-hdr__title">Image Vault</h1>
          <p className="page-hdr__sub">Your encrypted images</p>
        </div>
        <div className="page-hdr__acts">
          {selected.length > 0 && (
            <button className="ico-btn ico-btn--red" onClick={onDeleteSelected}>
              <Trash2 size={16} />
              <span className="ico-btn__badge">{selected.length}</span>
            </button>
          )}
          <button className="ico-btn" onClick={onRefresh}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="searchbar">
        <FileSearch size={15} className="searchbar__ico" />
        <input
          className="searchbar__input" type="search"
          placeholder="Search name, owner, ID…"
          value={search} onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading
        ? <><Skel /><Skel /><Skel /></>
        : vault.length === 0
          ? <Empty icon="🗄️" title="Vault is empty"
              subtitle="Analyze an image and tap Save to Vault"
              action="📸 Open Analyzer" onAction={onGoToAnalyzer} />
          : filtered.length === 0
            ? <Empty icon="🔍" title="No results" subtitle="Try a different search" />
            : (
              <div className="card-stack">
                {filtered.map(img => (
                  <VaultItem
                    key={img.id || img.assetId}
                    img={img}
                    selected={selected.includes(img.id || img.assetId)}
                    onSelect={onToggleSelect}
                    onClick={onItemClick}
                  />
                ))}
              </div>
            )}
    </div>
  );
}

export default VaultList;