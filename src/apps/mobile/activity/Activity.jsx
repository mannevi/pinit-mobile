import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, AlertTriangle, Award,
  Image as ImageIcon, Share2, ChevronDown, ChevronUp,
  Search, Eye, Download, XCircle,
} from 'lucide-react';
import { listShareLinks, revokeShareLink, approveDownloadRequest } from '../vault/utils/shareLinkUtils';
import './Activity.css';

// ─── Helpers (unchanged) ───────────────────────────────────────────────────────
const timeAgo = (d) => {
  if (!d) return '—';
  const diff  = Date.now() - new Date(d).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1)  return 'Just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  <  7)  return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fullDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const isSameDay = (a, b) => {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate()  === db.getDate();
};

const dayLabel = (dateStr) => {
  if (!dateStr) return 'Unknown date';
  const d    = new Date(dateStr);
  const now  = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (isSameDay(d, now))  return 'Today';
  if (isSameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

// ─── Build unified timeline ────────────────────────────────────────────────────
const buildTimeline = (reports, vault, certs) => {
  const events = [];

  reports.forEach((r, i) => events.push({
    id: `rpt-${r.asset_id || i}`, type: 'analyze', date: r.created_at,
    title: 'Image analyzed',
    status: r.is_tampered ? 'tampered' : 'clean',
    badge:  r.is_tampered ? '⚠ Tampered' : '✓ Authentic',
    detail: r.confidence ? `${r.confidence}% confidence` : null,
    assetId: r.asset_id,
  }));

  certs.forEach((c, i) => events.push({
    id: `cert-${c.certificate_id || c.id || i}`, type: 'certificate', date: c.created_at,
    title: 'Certificate generated',
    status: 'cert', badge: `${c.confidence || '—'}% confidence`,
    detail: c.status || null, assetId: c.asset_id,
  }));

  vault.forEach((v, i) => events.push({
    id: `vault-${v.id || v.assetId || i}`, type: 'vault',
    date: v.dateEncrypted || v.created_at,
    title: 'Asset saved to vault', status: 'saved', badge: null,
    detail: v.fileName || v.file_name || 'Image',
    assetId: v.assetId || v.id,
  }));

  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const groupByDay = (events) => {
  const groups = []; const keysSeen = {};
  events.forEach((e) => {
    const key = e.date ? dayLabel(e.date) : 'Unknown date';
    if (!keysSeen[key]) { keysSeen[key] = true; groups.push({ label: key, events: [] }); }
    groups[groups.length - 1].events.push(e);
  });
  return groups;
};

const TYPE_CONFIG = {
  analyze    : { icon: <ImageIcon size={16} />, color: 'blue',  label: 'Analyzed'    },
  certificate: { icon: <Award      size={16} />, color: 'gold',  label: 'Certificate' },
  vault      : { icon: <CheckCircle size={16}/>, color: 'green', label: 'Saved'       },
};

const Skeleton = () => (
  <div className="act-skeleton">
    <div className="act-skeleton__dot" />
    <div className="act-skeleton__card">
      <div className="skel-bar skel-bar--sm" />
      <div className="skel-bar" />
      <div className="skel-bar skel-bar--xs" />
    </div>
  </div>
);

const Empty = ({ filter, onAnalyze }) => (
  <div className="act-empty">
    <span className="act-empty__icon">
      {filter === 'all' ? '📋' : filter === 'analyze' ? '🔍' : filter === 'certificate' ? '📜' : filter === 'share' ? '🔗' : '🗄️'}
    </span>
    <p className="act-empty__title">
      {filter === 'share' ? 'No shared links yet' : filter === 'all' ? 'No activity yet' : `No ${TYPE_CONFIG[filter]?.label || ''} events`}
    </p>
    <p className="act-empty__sub">
      {filter === 'share' ? 'Share an image from your vault to get started' : filter === 'all' ? 'Capture and analyze an image to get started' : 'Try the All tab or start a new analysis'}
    </p>
    {filter === 'all' && (
      <button className="act-empty__btn" onClick={onAnalyze}>📸 Analyze Image</button>
    )}
  </div>
);

const EventCard = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.vault;
  return (
    <div className="tl-event">
      <div className={`tl-dot tl-dot--${cfg.color}`}>{cfg.icon}</div>
      <div
        className={`tl-card ${event.assetId ? 'tl-card--tappable' : ''}`}
        onClick={() => event.assetId && setExpanded(v => !v)}
      >
        <div className="tl-card__head">
          <div className="tl-card__left">
            <p className="tl-card__title">{event.title}</p>
            {event.badge && <span className={`tl-badge tl-badge--${event.status}`}>{event.badge}</span>}
          </div>
          <div className="tl-card__right">
            <span className="tl-card__time">{timeAgo(event.date)}</span>
            {event.assetId && (expanded ? <ChevronUp size={13} className="tl-card__chev" /> : <ChevronDown size={13} className="tl-card__chev" />)}
          </div>
        </div>
        {event.detail && <p className="tl-card__detail">{event.detail}</p>}
        {expanded && event.assetId && (
          <div className="tl-expand">
            <div className="tl-expand__row">
              <span className="tl-expand__lbl">Asset ID</span>
              <code className="tl-expand__val">{event.assetId.slice(0, 20)}…</code>
            </div>
            <div className="tl-expand__row">
              <span className="tl-expand__lbl">Full date</span>
              <span className="tl-expand__val">{fullDate(event.date)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── NEW: Share Link Card ──────────────────────────────────────────────────────
const ShareLinkCard = ({ link, onRevoke, onApprove }) => {
  const [expanded, setExpanded] = useState(false);
  const isActive  = link.status === 'active';
  const pending   = link.pending_requests || [];

  const statusColor = {
    active:  { bg: 'rgba(0,184,148,.12)', color: '#00b894' },
    revoked: { bg: 'rgba(239,68,68,.12)',  color: '#f87171' },
    expired: { bg: 'rgba(245,158,11,.12)', color: '#fbbf24' },
  }[link.status] || {};

  return (
    <div className="sl-card">
      {/* Header row */}
      <div className="sl-card__head" onClick={() => setExpanded(v => !v)}>
        <div className="sl-card__left">
          <p className="sl-card__name">{link.assets?.file_name || 'Shared asset'}</p>
          <div className="sl-card__meta">
            <span>{link.permission === 'view_only' ? '👁 View Only' : '⬇ View + DL'}</span>
            <span className="sl-dot">·</span>
            <span>{link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : 'No expiry'}</span>
          </div>
        </div>
        <div className="sl-card__right">
          <span className="sl-status" style={statusColor}>
            {link.status.charAt(0).toUpperCase() + link.status.slice(1)}
          </span>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>

      {/* Mini stats */}
      <div className="sl-stats">
        {[
          { icon: <Eye size={12} />,      num: link.view_count     || 0, label: 'Views'     },
          { icon: <Download size={12} />, num: link.download_count || 0, label: 'Downloads' },
          { icon: <Share2 size={12} />,   num: pending.length,           label: 'Requests'  },
        ].map(s => (
          <div key={s.label} className="sl-stat">
            {s.icon}
            <span className="sl-stat__num">{s.num}</span>
            <span className="sl-stat__lbl">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Expanded: pending requests + actions */}
      {expanded && (
        <div className="sl-expanded">
          {/* Pending download requests */}
          {pending.length > 0 && (
            <div className="sl-requests">
              <p className="sl-requests__title">Pending Requests</p>
              {pending.map(req => (
                <div key={req.id} className="sl-req-row">
                  <div className="sl-req-info">
                    <span className="sl-req-name">{req.recipient_name}</span>
                    <span className="sl-req-email">{req.recipient_email}</span>
                  </div>
                  <button className="sl-approve-btn" onClick={() => onApprove(link.id, req)}>
                    Approve
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Link actions */}
          <div className="sl-actions">
            <button
              className="sl-action-btn"
              onClick={() => { navigator.clipboard?.writeText(link.share_url); }}
            >
              <Copy size={13} /> Copy Link
            </button>
            <a className="sl-action-btn" href={link.share_url} target="_blank" rel="noopener noreferrer">
              <Eye size={13} /> Open Page
            </a>
            {isActive && (
              <button className="sl-action-btn sl-action-btn--revoke" onClick={() => onRevoke(link)}>
                <XCircle size={13} /> Revoke
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// tiny inline copy icon (avoids another lucide import)
const Copy = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);

// ─── Main Component ────────────────────────────────────────────────────────────
function Activity({ reports, vault, certs, lreports, lvault, lcerts, onRefresh, onAnalyze }) {
  const [filter,     setFilter]     = useState('all');
  const [search,     setSearch]     = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // ── Share links state (NEW) ──────────────────────────────────────────────────
  const [shareLinks,    setShareLinks]    = useState([]);
  const [shareLoading,  setShareLoading]  = useState(false);
  const [shareError,    setShareError]    = useState(null);

  const fetchShareLinks = useCallback(async () => {
    setShareLoading(true);
    setShareError(null);
    try {
      const links = await listShareLinks();
      setShareLinks(links || []);
    } catch (e) {
      setShareError(e.message);
    } finally {
      setShareLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShareLinks();
  }, [fetchShareLinks]);

  const handleRevoke = async (link) => {
    if (!window.confirm('Revoke this link? Recipients will lose access immediately.')) return;
    try {
      await revokeShareLink(link.id);
      fetchShareLinks();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleApprove = async (linkId, req) => {
    try {
      await approveDownloadRequest(linkId, req.id);
      alert(`Approved — download link sent to ${req.recipient_email}`);
      fetchShareLinks();
    } catch (e) {
      alert(e.message);
    }
  };
  // ────────────────────────────────────────────────────────────────────────────

  const isLoading = lreports || lvault || lcerts;

  const timeline = useMemo(() => {
    let events = buildTimeline(reports || [], vault || [], certs || []);
    if (filter !== 'all') events = events.filter(e => e.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      events = events.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q) ||
        e.badge?.toLowerCase().includes(q) ||
        e.assetId?.toLowerCase().includes(q)
      );
    }
    return events;
  }, [reports, vault, certs, filter, search]);

  const groups = useMemo(() => groupByDay(timeline), [timeline]);

  const totalCount = useMemo(
    () => buildTimeline(reports || [], vault || [], certs || []).length,
    [reports, vault, certs]
  );

  const isShareTab = filter === 'share';

  return (
    <div className="act-screen">

      {/* Header */}
      <div className="act-header">
        <div className="act-header__left">
          <h1 className="act-header__title">Activity</h1>
          {!isLoading && totalCount > 0 && (
            <span className="act-count">{totalCount}</span>
          )}
        </div>
        <div className="act-header__actions">
          <button className="act-ico-btn" onClick={() => setShowSearch(v => !v)} aria-label="Search">
            <Search size={16} />
          </button>
          <button
            className={`act-ico-btn ${(isLoading || shareLoading) ? 'act-ico-btn--spin' : ''}`}
            onClick={() => { onRefresh(); fetchShareLinks(); }}
            disabled={isLoading || shareLoading}
            aria-label="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && !isShareTab && (
        <div className="act-search">
          <Search size={14} className="act-search__ico" />
          <input
            className="act-search__input"
            type="search"
            placeholder="Search activity…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      )}

      {/* Filter tabs — added Share tab */}
      <div className="act-filters">
        {[
          { key: 'all',         label: 'All'      },
          { key: 'analyze',     label: 'Analyzed' },
          { key: 'vault',       label: 'Vault'    },
          { key: 'certificate', label: 'Certs'    },
          { key: 'share',       label: 'Shared'   },  // ← NEW
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`act-filter-btn ${filter === key ? 'act-filter-btn--on' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Share tab content ── */}
      {isShareTab ? (
        <div className="act-share-section">
          {/* Summary stats */}
          <div className="sl-summary">
            {[
              { num: shareLinks.filter(l => l.status === 'active').length,                              label: 'Active'    },
              { num: shareLinks.reduce((s, l) => s + (l.view_count     || 0), 0),                       label: 'Views'     },
              { num: shareLinks.reduce((s, l) => s + (l.download_count || 0), 0),                       label: 'Downloads' },
              { num: shareLinks.reduce((s, l) => s + (l.pending_requests?.length || 0), 0),             label: 'Pending'   },
            ].map(s => (
              <div key={s.label} className="sl-summary__card">
                <span className="sl-summary__num">{s.num}</span>
                <span className="sl-summary__lbl">{s.label}</span>
              </div>
            ))}
          </div>

          {shareLoading ? (
            <div className="act-timeline"><Skeleton /><Skeleton /></div>
          ) : shareError ? (
            <div className="act-empty">
              <p className="act-empty__title">Could not load share links</p>
              <p className="act-empty__sub">{shareError}</p>
              <button className="act-empty__btn" onClick={fetchShareLinks}>Retry</button>
            </div>
          ) : shareLinks.length === 0 ? (
            <Empty filter="share" />
          ) : (
            <div className="sl-list">
              {shareLinks.map(link => (
                <ShareLinkCard
                  key={link.id}
                  link={link}
                  onRevoke={handleRevoke}
                  onApprove={handleApprove}
                />
              ))}
            </div>
          )}
        </div>

      ) : (
        /* ── Original timeline tabs ── */
        isLoading ? (
          <div className="act-timeline">
            <div className="tl-rail" />
            <Skeleton /><Skeleton /><Skeleton />
          </div>
        ) : timeline.length === 0 ? (
          <Empty filter={filter} onAnalyze={onAnalyze} />
        ) : (
          <div className="act-timeline">
            <div className="tl-rail" />
            {groups.map((group) => (
              <div key={group.label} className="tl-group">
                <div className="tl-day">
                  <span className="tl-day__label">{group.label}</span>
                </div>
                {group.events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default Activity;