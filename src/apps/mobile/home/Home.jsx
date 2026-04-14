/**
 * PINIT — Mobile Home Screen  (src/apps/mobile/home/Home.jsx)
 *
 * NO vault logic here. Vault owns everything.
 * Home only:
 *   - Navigates to /analyzer
 *   - Passes pendingHighlight to <Vault>
 *   - Receives vault count + recent item via onDataChange callback
 *   - Manages certs, reports, profile, activity tabs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Camera, Image, Award, User, LogOut,
  Eye, Download, Trash2, CheckCircle, XCircle,
  Share2, Copy, FileSearch,
  Database, Activity as ActivityIcon, ChevronRight,
  AlertCircle, RefreshCw, Home as HomeIcon,
} from 'lucide-react';
import { certAPI, compareAPI, authAPI } from '../../../api/client';
import Activity from '../activity/Activity';
import Profile  from '../profile/Profile';
import Vault    from '../vault/Vault';
import Analyze  from '../analyze/Analyze';
import './Home.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d, short = false) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return short
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : date.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
};

const timeAgo = (d) => {
  if (!d) return '—';
  const diff  = Date.now() - new Date(d).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// ─── Micro-components ─────────────────────────────────────────────────────────
const EmptyState = ({ icon, title, subtitle, action, onAction }) => (
  <div className="empty">
    <span className="empty__icon">{icon}</span>
    <p  className="empty__title">{title}</p>
    {subtitle && <p className="empty__sub">{subtitle}</p>}
    {action   && <button className="ghost-cta" onClick={onAction}>{action}</button>}
  </div>
);

const Skeleton = () => (
  <div className="skeleton">
    <div className="skeleton__bar skeleton__bar--sm" />
    <div className="skeleton__bar" />
    <div className="skeleton__bar skeleton__bar--lg" />
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────
function Home({ user, onLogout }) {
  const [tab, setTab] = useState('home');

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem('pinit_theme') || 'dark'
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pinit_theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const navigate      = useNavigate();
  const location      = useLocation();

  const name = user?.name || user?.username || user?.email?.split('@')[0] || 'User';

  // ── Vault data received from <Vault> via onDataChange callback ────────────
  // Home only needs this for: stat pill count + recent activity feed item
  const [vaultItems,   setVaultItems]   = useState([]);
  const [vaultLoading, setVaultLoading] = useState(true);

  // ── Pending highlight: assetId to auto-open in Vault (from Analyze nav) ───
  const [pendingHighlight, setPendingHighlight] = useState(null);

  // Read navigation state, switch to vault tab if requested.
  // FIX: was [] — only ran once on mount so navigate() from Analyze never triggered it.
  // Now depends on location.state so it re-runs every time Analyze navigates here.
  useEffect(() => {
    if (!location.state?.tab) return;
    if (location.state.tab === 'vault') {
      setTab('vault');
      if (location.state.highlightAsset) setPendingHighlight(location.state.highlightAsset);
    }
    // Clear state cleanly via navigate so this effect doesn't re-fire
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line

  // ── Certs ─────────────────────────────────────────────────────────────────
  const [certs,   setCerts]   = useState([]);
  const [lcerts,  setLcerts]  = useState(true);
  const [qCerts,  setQCerts]  = useState('');
  const [copiedId,setCopiedId]= useState(null);
  const [viewCert,setViewCert]= useState(null);

  const loadCerts = useCallback(async () => {
    setLcerts(true);
    try { const r = await certAPI.list(); setCerts(r.certificates || []); }
    catch (e) { console.error(e.message); }
    finally { setLcerts(false); }
  }, []);

  // ── Reports ────────────────────────────────────────────────────────────────
  const [reports,  setReports]  = useState([]);
  const [lreports, setLreports] = useState(true);

  const loadReports = useCallback(async () => {
    setLreports(true);
    try { const r = await compareAPI.getHistory(); setReports(r.reports || []); }
    catch (e) { console.error(e.message); }
    finally { setLreports(false); }
  }, []);

  useEffect(() => { loadCerts(); loadReports(); }, [loadCerts, loadReports]);

  // ── Cert actions ──────────────────────────────────────────────────────────
  const doDeleteCert = async (id) => {
    if (!window.confirm('Delete this certificate?')) return;
    try { await certAPI.delete(id); setCerts(p => p.filter(c => c.certificate_id !== id && c.id !== id)); }
    catch (e) { alert('Failed: ' + e.message); }
  };

  const copyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const shareCert = async (cert) => {
    const base = window.location.origin.includes('localhost')
      ? 'https://image-crypto-analyzer.vercel.app'
      : window.location.origin;
    const url  = `${base}/public/certificate/${cert.certificate_id}`;

    // cert.analysis_data has all the real fields the backend stores
    const ad = cert.analysis_data || cert.analysisData || {};

    // Send properly structured data to /certificates/share endpoint
    try {
      await certAPI.share({
        certificateId       : cert.certificate_id,
        assetId             : cert.asset_id,
        confidence          : cert.confidence,
        status              : cert.status || 'Verified',
        dateCreated         : cert.created_at,
        ownerEmail          : ad.ownerEmail  || cert.owner_email  || null,
        ownerName           : ad.ownerName   || cert.owner_name   || null,
        ownershipAtCreation : {
          fileName        : ad.fileName    || null,
          assetResolution : ad.resolution  || null,
          assetFileSize   : ad.fileSize    || null,
          timeStamp       : ad.savedAt     || null,
          gpsLocation     : ad.gpsLocation || 'Not Available',
        },
        technicalDetails    : {
          deviceName    : ad.deviceName || null,
          ownershipInfo : 'Embedded UUID detected',
        },
        analysis_data : ad,
        imagePreview  : cert.image_preview || null,
      });
    } catch (e) {
      if (!e.message?.includes('Already shared')) console.warn('Share endpoint:', e.message);
    }

    // Store full cert locally so PublicCertificateView works on this device
    try {
      const certRecord = {
        certificate_id : cert.certificate_id,
        certificateId  : cert.certificate_id,
        asset_id       : cert.asset_id,
        confidence     : cert.confidence,
        status         : cert.status || 'Verified',
        owner_email    : ad.ownerEmail || cert.owner_email || null,
        created_at     : cert.created_at,
        image_preview  : cert.image_preview || null,
        analysis_data  : ad,
      };
      const existing = JSON.parse(localStorage.getItem('sharedCertificates') || '[]');
      const deduped  = existing.filter(c => c.certificate_id !== cert.certificate_id);
      localStorage.setItem('sharedCertificates', JSON.stringify([certRecord, ...deduped].slice(0, 20)));
      // Also store by cert ID directly — so PublicCertificateView can find it
      // even when the sharedCertificates array lookup fails cross-device
      localStorage.setItem(`pinit_cert_${cert.certificate_id}`, JSON.stringify(certRecord));
    } catch (e) { console.warn('Local cert cache failed (non-critical):', e); }

    
 try {
  if (window.Capacitor?.isNativePlatform?.()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({
      title      : 'PINIT Ownership Certificate',
      text       : `Certificate: ${cert.certificate_id}`,
      url,
      dialogTitle: 'Share via',
    });
  } else if (navigator.share) {
    await navigator.share({
      title : 'PINIT Ownership Certificate',
      text  : `Certificate: ${cert.certificate_id}`,
      url,
    });
  } else {
    navigator.clipboard.writeText(url)
      .then(() => alert(`✅ Link copied!\n${url}`));
  }
    } catch (e) {
  if (!String(e).toLowerCase().includes('cancel')) {
    navigator.clipboard.writeText(url)
      .then(() => alert(`✅ Link copied!\n${url}`));
    }
  }
  }; // ← closes shareCert

  // ── Profile actions ───────────────────────────────────────────────────────
  const changePassword = async () => {
    const p = window.prompt('New password (min 6 chars):');
    if (!p || p.length < 6) { alert('Too short'); return; }
    if (p !== window.prompt('Confirm new password:')) { alert('Mismatch'); return; }
    try { await authAPI.changePassword(p); alert('Password changed!'); }
    catch { alert('Failed. Try again.'); }
  };

  const doLogout = () => { onLogout(); navigate('/login'); };

  // ── Analyze → Vault navigation ────────────────────────────────────────────
  // Called by Analyze when user taps "View in Vault" / "View Original in Vault"
  const handleGoToVault = (assetId) => {
    if (assetId) setPendingHighlight(assetId);
    setTab('vault');
  };

  // ── Filtered certs ─────────────────────────────────────────────────────────
  const fCerts = certs.filter(x => {
    if (!qCerts) return true;
    const q = qCerts.toLowerCase();
    return x.certificate_id?.toLowerCase().includes(q) || x.asset_id?.toLowerCase().includes(q)
        || x.status?.toLowerCase().includes(q);
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <div className="content-area">

        {/* ╔══════════════════════════════╗
            ║           HOME               ║
            ╚══════════════════════════════╝ */}
        {tab === 'home' && (
          <div className="screen">
            <div className="topbar">
              <div className="topbar__brand">
                <div className="brand-gem">
                  <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
                    <path d="M18 4L32 12V24L18 32L4 24V12L18 4Z" stroke="white" strokeWidth="2.5" fill="none"/>
                    <circle cx="18" cy="18" r="4" fill="white"/>
                  </svg>
                </div>
                <span className="brand-text">PINIT</span>
              </div>
              <button className="topbar__logout" onClick={doLogout}><LogOut size={18}/></button>
            </div>

            <div className="greeting">
              <div className="greeting__avatar">{name.charAt(0).toUpperCase()}</div>
              <div>
                <h1 className="greeting__hi">Hi, {name} 👋</h1>
                <p  className="greeting__sub">Welcome back</p>
              </div>
            </div>

            <div className="stats-strip">
              <button className="stat-pill" onClick={() => setTab('vault')}>
                <div className="stat-pill__ico stat-pill__ico--blue"><Database size={16}/></div>
                <div className="stat-pill__data">
                  <span className="stat-pill__val">{vaultLoading ? '—' : vaultItems.length}</span>
                  <span className="stat-pill__lbl">In Vault</span>
                </div>
                <ChevronRight size={13} className="stat-pill__arr"/>
              </button>
              <button className="stat-pill" onClick={() => setTab('certificates')}>
                <div className="stat-pill__ico stat-pill__ico--gold"><Award size={16}/></div>
                <div className="stat-pill__data">
                  <span className="stat-pill__val">{lcerts ? '—' : certs.length}</span>
                  <span className="stat-pill__lbl">Certificates</span>
                </div>
                <ChevronRight size={13} className="stat-pill__arr"/>
              </button>
            </div>

            <button className="cta-btn" onClick={() => setTab('analyze')}>
              <div className="cta-btn__pulse"/>
              <div className="cta-btn__content">
                <div className="cta-btn__cam"><Camera size={32}/></div>
                <div>
                  <p className="cta-btn__main">Capture &amp; Analyze</p>
                  <p className="cta-btn__hint">Encrypt · Verify · Certify</p>
                </div>
                <ChevronRight size={20} className="cta-btn__arr"/>
              </div>
            </button>

            <div className="section">
              <div className="section__head">
                <h2 className="section__title">Recent Activity</h2>
                <button className="section__more" onClick={() => setTab('activity')}>
                  See all <ChevronRight size={13}/>
                </button>
              </div>
              {(vaultLoading && lcerts && lreports)
                ? <><Skeleton/><Skeleton/></>
                : (vaultItems.length === 0 && certs.length === 0)
                  ? <EmptyState icon="📊" title="No activity yet" subtitle="Capture your first image to get started"/>
                  : (
                    <div className="feed">
                      {vaultItems[0] && (
                        <button className="feed-card" onClick={() => setTab('vault')}>
                          <div className="feed-card__thumb">
                            {vaultItems[0].thumbnail
                              ? <img src={vaultItems[0].thumbnail} alt=""/>
                              : <div className="thumb-ph"><Image size={18}/></div>}
                          </div>
                          <div className="feed-card__body">
                            <span className="chip chip--vault">🔐 Vault</span>
                            <p className="feed-card__name">{vaultItems[0].fileName}</p>
                            <p className="feed-card__time">{timeAgo(vaultItems[0].dateEncrypted)}</p>
                          </div>
                          <ChevronRight size={15} className="feed-card__arr"/>
                        </button>
                      )}
                      {certs[0] && (
                        <button className="feed-card" onClick={() => setViewCert(certs[0])}>
                          <div className="feed-card__thumb feed-card__thumb--cert"><Award size={18}/></div>
                          <div className="feed-card__body">
                            <span className="chip chip--cert">📜 Certificate</span>
                            <p className="feed-card__name">{certs[0].status || 'Ownership Certificate'}</p>
                            <p className="feed-card__time">{certs[0].confidence}% · {timeAgo(certs[0].created_at)}</p>
                          </div>
                          <ChevronRight size={15} className="feed-card__arr"/>
                        </button>
                      )}
                      {reports[0] && (
                        <div className="feed-card">
                          <div className={`feed-card__thumb ${reports[0].is_tampered ? 'feed-card__thumb--warn' : 'feed-card__thumb--ok'}`}>
                            {reports[0].is_tampered ? <AlertCircle size={18}/> : <CheckCircle size={18}/>}
                          </div>
                          <div className="feed-card__body">
                            <span className={`chip ${reports[0].is_tampered ? 'chip--warn' : 'chip--ok'}`}>
                              {reports[0].is_tampered ? '⚠ Tampered' : '✓ Original'}
                            </span>
                            <p className="feed-card__name">Analysis Report</p>
                            <p className="feed-card__time">{reports[0].confidence}% · {timeAgo(reports[0].created_at)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
            </div>
          </div>
        )}

        {/* ╔══════════════════════════════╗
            ║     ANALYZE (Analyze.jsx)    ║
            ╚══════════════════════════════╝ */}
        {tab === 'analyze' && (
          <Analyze
            user={user}
            onGoToVault={handleGoToVault}
            onBack={() => setTab('home')}
            onVaultSaved={() => setTab('vault')}
          />
        )}

        {/* ╔══════════════════════════════╗
            ║     VAULT (Vault.jsx owns)   ║
            ╚══════════════════════════════╝ */}
        {tab === 'vault' && (
          <Vault
            user={user}
            highlightAsset={pendingHighlight}
            onCertGenerated={loadCerts}
            onGoToAnalyzer={() => setTab('analyze')}
            onDataChange={(items, loading) => {
              setVaultItems(items);
              setVaultLoading(loading);
              if (!loading) setPendingHighlight(null);
            }}
          />
        )}

        {/* ╔══════════════════════════════╗
            ║        CERTIFICATES          ║
            ╚══════════════════════════════╝ */}
        {tab === 'certificates' && (
          <div className="screen">
            <div className="page-hdr">
              <div>
                <h1 className="page-hdr__title">Certificates</h1>
                <p  className="page-hdr__sub">Your ownership certificates</p>
              </div>
              <button className="ico-btn" onClick={loadCerts}><RefreshCw size={16}/></button>
            </div>
            <div className="searchbar">
              <FileSearch size={15} className="searchbar__ico"/>
              <input className="searchbar__input" type="search" placeholder="Search ID, asset, status…"
                value={qCerts} onChange={e => setQCerts(e.target.value)}/>
            </div>
            {lcerts ? <><Skeleton/><Skeleton/></>
            : certs.length === 0
              ? <EmptyState icon="📜" title="No certificates yet" subtitle="Generate from your Vault images" action="🗄️ Open Vault" onAction={() => setTab('vault')}/>
            : fCerts.length === 0
              ? <EmptyState icon="🔍" title="No results" subtitle="Try a different search"/>
            : (
              <div className="card-stack">
                {fCerts.map(cert => (
                  <div key={cert.id || cert.certificate_id} className="c-card">
                    <div className="c-card__top">
                      <div className="c-card__ico"><Award size={20}/></div>
                      <div className="c-card__info">
                        <p className="c-card__status">{cert.status || 'Ownership Certificate'}</p>
                        <p className="c-card__date">{fmt(cert.created_at, true)}</p>
                      </div>
                      <span className={`c-card__pct ${cert.confidence >= 90 ? 'hi' : cert.confidence >= 70 ? 'md' : 'lo'}`}>
                        {cert.confidence}%
                      </span>
                    </div>
                    <div className="c-card__id-row">
                      <code className="c-card__id">{cert.certificate_id?.slice(0,22)}…</code>
                      <button className="ico-btn ico-btn--xs" onClick={() => copyId(cert.certificate_id)}>
                        {copiedId === cert.certificate_id ? <CheckCircle size={12}/> : <Copy size={12}/>}
                      </button>
                    </div>
                    <div className="c-card__acts">
                      <button className="c-btn c-btn--view"   onClick={() => setViewCert(cert)}><Eye size={13}/> View</button>
                      <button className="c-btn c-btn--share"  onClick={() => shareCert(cert)}><Share2 size={13}/> Share</button>
                      <button className="c-btn c-btn--delete" onClick={() => doDeleteCert(cert.certificate_id || cert.id)}><Trash2 size={13}/> Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY */}
        {tab === 'activity' && (
          <Activity
            reports={reports}
            vault={vaultItems}
            certs={certs}
            lreports={lreports}
            lvault={vaultLoading}
            lcerts={lcerts}
            onRefresh={() => { loadReports(); loadCerts(); }}
            onAnalyze={() => setTab('analyze')}
          />
        )}

        {/* PROFILE */}
        {tab === 'profile' && (
          <Profile
            user={user}
            vault={vaultItems}
            reports={reports}
            certs={certs}
            lvault={vaultLoading}
            lreports={lreports}
            lcerts={lcerts}
            onLogout={doLogout}
            onChangePassword={changePassword}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

      </div>{/* end content-area */}

      {/* BOTTOM NAV */}
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {[
          { id: 'home',         Icon: HomeIcon,       label: 'Home'    },
          { id: 'vault',        Icon: Database,       label: 'Vault'   },
          { id: 'certificates', Icon: Award,          label: 'Certs'   },
		  { id: 'activity',     Icon: ActivityIcon,   label: 'Activity'},
          { id: 'profile',      Icon: User,           label: 'Profile' },
        ].map(({ id, Icon, label }) => (
          <button key={id}
            className={`bnav__item ${tab === id ? 'bnav__item--on' : ''}`}
            onClick={() => setTab(id)} aria-label={label}
            aria-current={tab === id ? 'page' : undefined}>
            <Icon size={22}/>
            <span className="bnav__lbl">{label}</span>
          </button>
        ))}
      </nav>

      {/* CERT MODAL */}
      {viewCert && (
        <div className="overlay" onClick={() => setViewCert(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet__handle"/>
            <div className="sheet__head">
              <h2 className="sheet__title">Certificate</h2>
              <button className="sheet__close" onClick={() => setViewCert(null)}>✕</button>
            </div>
            <div className="sheet__body">
              <div className="m-cert-hero">
                <div className="m-cert-hero__ico"><Award size={38}/></div>
                <h3 className="m-cert-hero__status">{viewCert.status}</h3>
                <span className={`c-card__pct ${viewCert.confidence >= 90 ? 'hi' : 'md'}`}>
                  {viewCert.confidence}% Confidence
                </span>
              </div>
              {viewCert.image_preview && (
                <div className="m-preview" style={{marginBottom:16}}>
                  <img src={viewCert.image_preview} alt="Analyzed"/>
                </div>
              )}
              <div className="m-details">
                {[
                  ['Certificate ID', viewCert.certificate_id],
                  ['Asset ID',       viewCert.asset_id],
                  ['Created',        fmt(viewCert.created_at)],
                ].map(([l,v]) => (
                  <div key={l} className="m-row">
                    <span className="m-row__lbl">{l}</span>
                    <code className="m-row__val m-row__val--code">{v}</code>
                  </div>
                ))}
              </div>
              <button className="primary-btn" onClick={() => shareCert(viewCert)}>
                <Share2 size={15}/> Share Certificate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Home;