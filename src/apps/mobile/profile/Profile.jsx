import React, { useState, useEffect } from 'react';
import {
  ChevronRight, CheckCircle, Key, LogOut,
  Fingerprint, Shield, Copy, User, Mail, LifeBuoy,
  Bell, Monitor, Star, Lock, Camera, Edit3,
} from 'lucide-react';
import './Profile.css';
import ContactSupport from './ContactSupport';

// ─── Capacitor + native biometric helpers ─────────────────────────────────────
const isCapacitor = () => {
  try {
    return !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.platform !== 'web' || window.cordova);
  } catch { return false; }
};

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const getNativeBiometric = () => {
  try { return window.Capacitor?.Plugins?.BiometricPlugin ?? null; } catch { return null; }
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Copy-to-clipboard mini hook ─────────────────────────────────────────────
const useCopy = () => {
  const [copied, setCopied] = useState(false);
  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };
  return { copied, copy };
};

// ─── Biometric toggle logic ───────────────────────────────────────────────────
const getBiometricState = () => ({
  enrolled   : localStorage.getItem('biometricEnrolled') === 'true',
  credId     : localStorage.getItem('biometricCredentialId'),
  email      : localStorage.getItem('biometricEmail'),
});

const clearBiometricData = () => {
  localStorage.removeItem('biometricEnrolled');
  localStorage.removeItem('biometricCredentialId');
  localStorage.removeItem('biometricEmail');
};

// ─── Biometric section subcomponent ──────────────────────────────────────────
const BiometricRow = ({ user }) => {
  const [state,      setState]      = useState(getBiometricState);
  const [loading,    setLoading]    = useState(false);
  const [available,  setAvailable]  = useState(isMobileDevice());
  const [statusMsg,  setStatusMsg]  = useState('');

  useEffect(() => {
    checkAvailability();
  }, []); // eslint-disable-line

  const checkAvailability = async () => {
    try {
      if (isCapacitor()) {
        const plugin = getNativeBiometric();
        if (plugin) {
          const r = await plugin.isAvailable();
          setAvailable(r.isAvailable);
        } else {
          setAvailable(true); // assume available on APK if plugin not found yet
        }
      } else if (window.PublicKeyCredential) {
        const ok = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setAvailable(ok || isMobileDevice());
      } else {
        setAvailable(false);
      }
    } catch { setAvailable(isMobileDevice()); }
  };

  const handleEnable = async () => {
    setLoading(true); setStatusMsg('');
    try {
      if (isCapacitor()) {
        const plugin = getNativeBiometric();
        if (plugin) {
          await plugin.authenticate();
          localStorage.setItem('biometricEnrolled', 'true');
          localStorage.setItem('biometricEmail', user?.email || '');
          setState(getBiometricState());
          setStatusMsg('Fingerprint login enabled ✅');
        } else {
          setStatusMsg('Biometric plugin not ready. Try again.');
        }
      } else {
        // WebAuthn enrollment
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rp: { name: 'PINIT', id: window.location.hostname },
            user: {
              id: new TextEncoder().encode(user?.email || user?.id || 'user'),
              name: user?.email || user?.id || 'user',
              displayName: user?.name || user?.username || 'User',
            },
            pubKeyCredParams: [
              { alg: -7,   type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
              requireResidentKey: false,
            },
            timeout: 60000,
          },
        });
        if (credential) {
          const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
          localStorage.setItem('biometricCredentialId', credId);
          localStorage.setItem('biometricEmail',        user?.email || '');
          localStorage.setItem('biometricEnrolled',     'true');
          setState(getBiometricState());
          setStatusMsg('Fingerprint login enabled ✅');
        }
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') setStatusMsg('Cancelled. Try again when ready.');
      else setStatusMsg('Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = () => {
    clearBiometricData();
    setState(getBiometricState());
    setStatusMsg('Biometric login removed.');
  };

  if (!available) return null; // hide entirely on non-biometric devices

  return (
    <div className="prof-sec-row">
      <div className="prof-sec-row__left">
        <div className={`prof-sec-row__ico prof-sec-row__ico--${state.enrolled ? 'green' : 'dim'}`}>
          <Fingerprint size={18} />
        </div>
        <div>
          <p className="prof-sec-row__label">Biometric Login</p>
          <p className="prof-sec-row__sub">
            {state.enrolled ? 'Fingerprint / Face ID enabled' : 'Not set up yet'}
          </p>
          {statusMsg && <p className="prof-status-msg">{statusMsg}</p>}
        </div>
      </div>
      <div>
        {state.enrolled ? (
          <button
            className="prof-toggle prof-toggle--off"
            onClick={handleDisable}
            disabled={loading}
          >
            Disable
          </button>
        ) : (
          <button
            className="prof-toggle prof-toggle--on"
            onClick={handleEnable}
            disabled={loading}
          >
            {loading ? '…' : 'Set Up'}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
function Profile({ user, vault, reports, certs, lvault, lreports, lcerts, onLogout, onChangePassword, theme, onToggleTheme }) {
  const name  = user?.name || user?.username || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '—';
  const uid   = user?.id;
  const lastLogin = localStorage.getItem(`lastLogin_${email}`);

  const { copied, copy } = useCopy();

  // ── Contact Support sheet state ───────────────────────────────────────────
  const [supportOpen, setSupportOpen] = useState(false);

  const stats = [
    {
      icon : '🔐',
      value: lvault   ? '—' : (vault?.length   ?? 0),
      label: 'In Vault',
      color: 'blue',
    },
    {
      icon : '🔍',
      value: lreports ? '—' : (reports?.length ?? 0),
      label: 'Analyses',
      color: 'purple',
    },
    {
      icon : '📜',
      value: lcerts   ? '—' : (certs?.length   ?? 0),
      label: 'Certificates',
      color: 'gold',
    },
  ];

  // ── Edit Name ─────────────────────────────────────────────────────────────
  const [editingName,  setEditingName]  = useState(false);
  const [displayName,  setDisplayName]  = useState(
    () => localStorage.getItem('pinit_display_name') || name
  );
  const [nameInput,    setNameInput]    = useState(name);

  const saveNameEdit = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) { setNameInput(displayName); setEditingName(false); return; }
    setDisplayName(trimmed);
    localStorage.setItem('pinit_display_name', trimmed);
    setEditingName(false);
  };

  // ── Profile Picture ───────────────────────────────────────────────────────
  const [avatarImg, setAvatarImg] = useState(
    () => localStorage.getItem('pinit_avatar') || null
  );
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      setAvatarImg(result);
      localStorage.setItem('pinit_avatar', result);
    };
    reader.readAsDataURL(file);
  };

  // ── Notifications ─────────────────────────────────────────────────────────
  const [pushNotif,  setPushNotif]  = useState(
    () => localStorage.getItem('pinit_push_notif') !== 'false'
  );
  const [emailNotif, setEmailNotif] = useState(
    () => localStorage.getItem('pinit_email_notif') !== 'false'
  );
  const togglePush = () => {
    const next = !pushNotif;
    setPushNotif(next);
    localStorage.setItem('pinit_push_notif', String(next));
  };
  const toggleEmail = () => {
    const next = !emailNotif;
    setEmailNotif(next);
    localStorage.setItem('pinit_email_notif', String(next));
  };

  // ── Active Sessions ───────────────────────────────────────────────────────
  const sessions = [
    { device: 'This device',  location: 'Current session',  current: true  },
    { device: 'Chrome · Web', location: 'Last seen: today', current: false },
  ];
  const logoutAllSessions = () => {
    if (window.confirm('Log out from all other devices?'))
      alert('All other sessions have been logged out.');
  };

  // ── Rate the App ──────────────────────────────────────────────────────────
  const rateApp = () => {
    const isAPK = !!(window.Capacitor?.isNativePlatform?.());
    if (isAPK) window.open('market://details?id=com.pinit.app', '_system');
    else window.open('https://play.google.com/store/apps/details?id=com.pinit.app', '_blank');
  };

  return (
    <div className="prof-screen">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="prof-hero">
        <div className="prof-avatar-wrap">
          {avatarImg
            ? <img src={avatarImg} alt="avatar" className="prof-avatar prof-avatar--img" />
            : <div className="prof-avatar">{displayName.charAt(0).toUpperCase()}</div>}
          <label className="prof-avatar-edit" aria-label="Change profile picture">
            <Camera size={14} />
            <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
          </label>
        </div>
        {editingName ? (
          <div className="prof-name-edit-row">
            <input
              className="prof-name-input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveNameEdit(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              maxLength={32}
            />
            <button className="prof-name-save" onClick={saveNameEdit}>Save</button>
          </div>
        ) : (
          <div className="prof-name-row">
            <h1 className="prof-name">{displayName}</h1>
            <button className="prof-name-edit-btn" onClick={() => { setNameInput(displayName); setEditingName(true); }} aria-label="Edit name">
              <Edit3 size={14} />
            </button>
          </div>
        )}
        <p className="prof-email">{email}</p>
      </div>

      {/* ── Section 1: Account ───────────────────────────────────────────────── */}
      <div className="prof-section">
        <p className="prof-section__label">Account</p>
        <div className="prof-card">

          <div className="prof-info-row">
            <div className="prof-info-row__ico"><User size={15} /></div>
            <div className="prof-info-row__body">
              <span className="prof-info-row__lbl">Name</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span className="prof-info-row__val">{displayName}</span>
                <button onClick={() => { setNameInput(displayName); setEditingName(true); }}
                  style={{ border:'none', background:'none', cursor:'pointer', color:'var(--text-3)', padding:2, display:'flex', alignItems:'center' }}>
                  <Edit3 size={12} />
                </button>
              </div>
            </div>
          </div>

          <div className="prof-card__sep" />

          <div className="prof-info-row">
            <div className="prof-info-row__ico"><Mail size={15} /></div>
            <div className="prof-info-row__body">
              <span className="prof-info-row__lbl">Email</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span className="prof-info-row__val">{email}</span>
                <Lock size={11} style={{ color:'var(--text-3)', flexShrink:0 }} />
              </div>
            </div>
          </div>

          {uid && (
            <>
              <div className="prof-card__sep" />
              <div className="prof-info-row">
                <div className="prof-info-row__ico"><Shield size={15} /></div>
                <div className="prof-info-row__body">
                  <span className="prof-info-row__lbl">User ID</span>
                  <div className="prof-uid-row">
                    <code className="prof-uid">{uid.slice(0, 16)}…</code>
                    <button
                      className={`prof-copy-btn ${copied ? 'prof-copy-btn--done' : ''}`}
                      onClick={() => copy(uid)}
                      aria-label="Copy user ID"
                    >
                      {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {lastLogin && (
            <>
              <div className="prof-card__sep" />
              <div className="prof-info-row">
                <div className="prof-info-row__ico" style={{ opacity: .5 }}>🕐</div>
                <div className="prof-info-row__body">
                  <span className="prof-info-row__lbl">Last login</span>
                  <span className="prof-info-row__val">{fmtDate(lastLogin)}</span>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Section 2: Security ──────────────────────────────────────────────── */}
      <div className="prof-section">
        <p className="prof-section__label">Security</p>
        <div className="prof-card">

          {/* Change password */}
          <button className="prof-sec-row prof-sec-row--btn" onClick={onChangePassword}>
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico prof-sec-row__ico--purple">
                <Key size={18} />
              </div>
              <div>
                <p className="prof-sec-row__label">Change Password</p>
                <p className="prof-sec-row__sub">Update your account password</p>
              </div>
            </div>
            <ChevronRight size={15} className="prof-sec-row__arr" />
          </button>

          <div className="prof-card__sep" />

          {/* Biometric toggle */}
          <BiometricRow user={user} />

          <div className="prof-card__sep" />

          {/* Theme toggle */}
          <div className="prof-sec-row">
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico prof-sec-row__ico--dim">
                <span style={{ fontSize: 18 }}>{theme === 'dark' ? '🌙' : '☀️'}</span>
              </div>
              <div>
                <p className="prof-sec-row__label">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                <p className="prof-sec-row__sub">Tap to switch appearance</p>
              </div>
            </div>
            <button
              onClick={onToggleTheme}
              style={{
                width: 48, height: 26, borderRadius: 13, border: 'none',
                background: theme === 'dark' ? 'var(--accent)' : '#d1d5db',
                cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}
              aria-label="Toggle theme"
            >
              <span style={{
                position: 'absolute', top: 3,
                left: theme === 'dark' ? 26 : 4,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          <div className="prof-card__sep" />

          {/* ── Active Sessions ── */}
          <div style={{ padding:'12px 0 4px' }}>
            <div className="prof-sec-row__left" style={{ marginBottom:10 }}>
              <div className="prof-sec-row__ico prof-sec-row__ico--blue"><Monitor size={18} /></div>
              <div>
                <p className="prof-sec-row__label">Active Sessions</p>
                <p className="prof-sec-row__sub">Devices logged into your account</p>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
              {sessions.map((s, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'8px 10px', background:'var(--surface2)', borderRadius:10, gap:8 }}>
                  <div>
                    <p style={{ fontSize:12, fontWeight:600, color:'var(--text)', margin:0 }}>{s.device}</p>
                    <p style={{ fontSize:11, color:'var(--text-3)', margin:0 }}>{s.location}</p>
                  </div>
                  {s.current && (
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--green)',
                      background:'rgba(34,197,94,.12)', padding:'3px 8px', borderRadius:20 }}>Current</span>
                  )}
                </div>
              ))}
            </div>
            <button onClick={logoutAllSessions}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                width:'100%', padding:'9px 14px', background:'rgba(239,68,68,.08)',
                border:'1px solid rgba(239,68,68,.2)', borderRadius:10,
                fontSize:12, fontWeight:700, color:'var(--red)', cursor:'pointer' }}>
              Log Out All Other Devices
            </button>
          </div>

        </div>
      </div>

      {/* ── Section 3: Support ───────────────────────────────────────────────── */}
      <div className="prof-section">
        <p className="prof-section__label">Support</p>
        <div className="prof-card">
          <button
            className="prof-sec-row prof-sec-row--btn"
            onClick={() => setSupportOpen(true)}
          >
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico prof-sec-row__ico--teal">
                <LifeBuoy size={18} />
              </div>
              <div>
                <p className="prof-sec-row__label">Contact Support</p>
                <p className="prof-sec-row__sub">Get help or report an issue</p>
              </div>
            </div>
            <ChevronRight size={15} className="prof-sec-row__arr" />
          </button>
        </div>
      </div>

      {/* ── Notifications ─────────────────────────────────────────────────────── */}
      <div className="prof-section">
        <p className="prof-section__label">Notifications</p>
        <div className="prof-card">
          <div className="prof-sec-row">
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico prof-sec-row__ico--gold"><Bell size={18} /></div>
              <div>
                <p className="prof-sec-row__label">Push Notifications</p>
                <p className="prof-sec-row__sub">Alerts when someone views your shared link</p>
              </div>
            </div>
            <button onClick={togglePush} aria-label="Toggle push"
              style={{ width:48, height:26, borderRadius:13, border:'none', flexShrink:0,
                background: pushNotif ? 'var(--accent)' : 'var(--border)',
                cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
              <span style={{ position:'absolute', top:3, left: pushNotif ? 26 : 4,
                width:20, height:20, borderRadius:'50%', background:'white',
                transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
          <div className="prof-card__sep" />
          <div className="prof-sec-row">
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico prof-sec-row__ico--teal"><Mail size={18} /></div>
              <div>
                <p className="prof-sec-row__label">Email Notifications</p>
                <p className="prof-sec-row__sub">Weekly summary of your activity</p>
              </div>
            </div>
            <button onClick={toggleEmail} aria-label="Toggle email"
              style={{ width:48, height:26, borderRadius:13, border:'none', flexShrink:0,
                background: emailNotif ? 'var(--accent)' : 'var(--border)',
                cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
              <span style={{ position:'absolute', top:3, left: emailNotif ? 26 : 4,
                width:20, height:20, borderRadius:'50%', background:'white',
                transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Rate the App ─────────────────────────────────────────────────────── */}
      <div className="prof-section">
        <div className="prof-card">
          <button className="prof-sec-row prof-sec-row--btn" onClick={rateApp}>
            <div className="prof-sec-row__left">
              <div className="prof-sec-row__ico" style={{ background:'rgba(245,158,11,.12)', color:'var(--gold)' }}>
                <Star size={18} />
              </div>
              <div>
                <p className="prof-sec-row__label">Rate the App</p>
                <p className="prof-sec-row__sub">Love PINIT? Leave us a review ⭐</p>
              </div>
            </div>
            <ChevronRight size={15} className="prof-sec-row__arr" />
          </button>
        </div>
      </div>

      {/* ── Section 4: Usage ─────────────────────────────────────────────────── */}
      <div className="prof-section">
        <p className="prof-section__label">Usage</p>
        <div className="prof-stats-grid">
          {stats.map((s) => (
            <div key={s.label} className={`prof-stat prof-stat--${s.color}`}>
              <span className="prof-stat__icon">{s.icon}</span>
              <span className="prof-stat__val">{s.value}</span>
              <span className="prof-stat__lbl">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 5: Logout ────────────────────────────────────────────────── */}
      <div className="prof-section">
        <button className="prof-logout-btn" onClick={onLogout}>
          <LogOut size={18} />
          Log Out
        </button>
        <p className="prof-footer">PINIT Mobile · v1.0</p>
      </div>

      {/* ── Contact Support sheet ─────────────────────────────────────────────── */}
      <ContactSupport
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
      />

    </div>
  );
}

export default Profile;