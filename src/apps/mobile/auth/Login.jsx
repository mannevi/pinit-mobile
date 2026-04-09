import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
 
// ─── Capacitor detection ──────────────────────────────────────────────────────
const isCapacitor = () => {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    if (window.Capacitor?.platform && window.Capacitor.platform !== 'web') return true;
    if (window.cordova) return true;
    return false;
  } catch {
    return false;
  }
};
 
const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
 
// ─── Custom native BiometricPlugin (APK only) ─────────────────────────────────
const getNativeBiometric = () => {
  try {
    return window.Capacitor?.Plugins?.BiometricPlugin ?? null;
  } catch {
    return null;
  }
};
 
// ─── WebAuthn helper ──────────────────────────────────────────────────────────
const base64ToUint8 = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
 
// ─── Fetch with auto-retry (handles Render cold start) ───────────────────────
const fetchWithRetry = async (url, options, retries = 3, delayMs = 4000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
};
 
// ─── Reusable Eye Toggle ──────────────────────────────────────────────────────
const EyeIcon = ({ show, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    tabIndex={-1}
    className="eye-toggle"
    aria-label={show ? 'Hide password' : 'Show password'}
  >
    {show ? (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ) : (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )}
  </button>
);
 
// ─── Fingerprint SVG icon ─────────────────────────────────────────────────────
const FingerprintIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 17c1 .5 2 .5 3 0" />
    <path d="M20 12c-.21 3.58-1.06 6.03-1.36 7" />
    <path d="M6.67 15.17c.33 2.17.99 3.33 2.33 4.83" />
    <path d="M12 6a4 4 0 0 1 4 4c0 1.5-.09 3-.28 4.5" />
    <path d="M6 10a6 6 0 0 1 .34-2" />
  </svg>
);
 
// ─── Component ────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [formData, setFormData]               = useState({ email: '', password: '' });
  const [error, setError]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [showPassword, setShowPassword]       = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(isMobileDevice());
  const [biometricEnrolled, setBiometricEnrolled]   = useState(
    localStorage.getItem('biometricEnrolled') === 'true'
  );
  const [biometricLoading, setBiometricLoading] = useState(false);
 
  // ── Forgot Password modal state ───────────────────────────────────────────
  const [forgotOpen, setForgotOpen]       = useState(false);
  const [forgotStep, setForgotStep]       = useState('email'); // 'email' | 'success'
  const [forgotEmail, setForgotEmail]     = useState('');
  const [forgotError, setForgotError]     = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
 
  const navigate = useNavigate();
 
  useEffect(() => { checkBiometric(); }, []); // eslint-disable-line
 
  // ── Biometric availability check ──────────────────────────────────────────
  const checkBiometric = async () => {
    try {
      const enrolled     = localStorage.getItem('biometricEnrolled') === 'true';
      const credentialId = localStorage.getItem('biometricCredentialId');
 
      await new Promise((r) => setTimeout(r, 800));
 
      if (isCapacitor()) {
        const plugin = getNativeBiometric();
        if (plugin) {
          try {
            const result = await plugin.isAvailable();
            setBiometricAvailable(result.isAvailable);
          } catch {
            setBiometricAvailable(true);
          }
        } else {
          setBiometricAvailable(true);
        }
        setBiometricEnrolled(enrolled);
      } else {
        if (!window.PublicKeyCredential) { setBiometricAvailable(false); return; }
        const available = await window.PublicKeyCredential
          .isUserVerifyingPlatformAuthenticatorAvailable();
        setBiometricAvailable(available || isMobileDevice());
        setBiometricEnrolled(available && enrolled && !!credentialId);
      }
    } catch {
      if (isMobileDevice()) setBiometricAvailable(true);
    }
  };
 
  // ── Biometric Login ───────────────────────────────────────────────────────
  const handleBiometricLogin = async () => {
    setError('');
    const savedToken = localStorage.getItem('savedToken');
    const savedUser  = JSON.parse(localStorage.getItem('savedUser') || '{}');
 
    if (!savedToken || !savedUser?.id) {
      setError('Please log in with your password first to enable biometrics.');
      return;
    }
    if (localStorage.getItem('biometricEnrolled') !== 'true') {
      setError('Please log in with your password first to set up biometrics.');
      return;
    }
 
    setBiometricLoading(true);
    try {
      if (isCapacitor()) {
        const plugin = getNativeBiometric();
        if (!plugin) {
          setError('Biometric plugin not ready. Please use your password.');
          return;
        }
        await plugin.authenticate();
        localStorage.setItem('userUUID', savedUser.id);
        onLogin(savedUser, savedToken);
        navigate('/user/dashboard');
      } else {
        const credentialId = localStorage.getItem('biometricCredentialId');
        if (!credentialId) {
          setError('No biometric registered. Please log in with your password first.');
          return;
        }
        const credential = await navigator.credentials.get({
          publicKey: {
            challenge       : crypto.getRandomValues(new Uint8Array(32)),
            rpId            : window.location.hostname,
            userVerification: 'required',
            timeout         : 60000,
            allowCredentials: [{
              id        : base64ToUint8(credentialId),
              type      : 'public-key',
              transports: ['internal'],
            }],
          },
        });
        if (credential) {
          localStorage.setItem('userUUID', savedUser.id);
          onLogin(savedUser, savedToken);
          navigate('/user/dashboard');
        }
      }
    } catch (e) {
      if (
        e.message?.includes('cancel') ||
        e.message?.includes('Cancel') ||
        e.name === 'NotAllowedError'
      ) {
        setError('Biometric cancelled. Please use your password.');
      } else {
        setError(`Biometric error: ${e.message || e.name}. Please use your password.`);
      }
    } finally {
      setBiometricLoading(false);
    }
  };
 
  // ── Biometric enrolment (called once after successful password login) ──────
  const enrollBiometricAfterLogin = async (user) => {
    try {
      if (isCapacitor()) {
        const plugin = getNativeBiometric();
        if (plugin) await plugin.authenticate();
        localStorage.setItem('biometricEnrolled', 'true');
        localStorage.setItem('biometricEmail', user.email || '');
        setBiometricEnrolled(true);
        alert('✅ Fingerprint enabled! Next time tap the button to login instantly.');
      } else {
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge         : crypto.getRandomValues(new Uint8Array(32)),
            rp                : { name: 'PINIT', id: window.location.hostname },
            user              : {
              id         : new TextEncoder().encode(user.email || user.id),
              name       : user.email || user.id,
              displayName: user.name || user.username || 'User',
            },
            pubKeyCredParams  : [
              { alg: -7,   type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification       : 'required',
              requireResidentKey     : false,
            },
            timeout: 60000,
          },
        });
        if (credential) {
          const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
          localStorage.setItem('biometricCredentialId', credId);
          localStorage.setItem('biometricEmail',        user.email);
          localStorage.setItem('biometricEnrolled',     'true');
          setBiometricEnrolled(true);
          alert('✅ Fingerprint registered! You can now log in with just your fingerprint.');
        }
      }
    } catch (e) {
      console.log('Biometric enrollment skipped:', e.message);
    }
  };
 
  // ── Password Login ────────────────────────────────────────────────────────
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
 
    try {
      const res = await fetch('https://pinit-backend.onrender.com/auth/login', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          email   : formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();
 
      if (!res.ok) {
        setError(data.detail || 'Invalid email or password.');
        return;
      }
 
      localStorage.setItem('savedToken', data.access_token);
      localStorage.setItem('savedUser',  JSON.stringify(data.user));
      localStorage.setItem('userUUID',   data.user.id);
      localStorage.setItem(`lastLogin_${data.user.email}`, new Date().toISOString());
 
      const credentialId = localStorage.getItem('biometricCredentialId');
      const enrolled     = localStorage.getItem('biometricEnrolled') === 'true';
 
      if (biometricAvailable && !enrolled && !credentialId) {
        const wantEnroll = window.confirm(
          '👆 Would you like to set up fingerprint login for next time?\n\n' +
          'This lets you log in instantly without a password.',
        );
        if (wantEnroll) await enrollBiometricAfterLogin(data.user);
      }
 
      onLogin(data.user, data.access_token);
      navigate('/user/dashboard');
    } catch {
      setError('Cannot connect to server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };
 
  // ── Forgot Password ───────────────────────────────────────────────────────
  const openForgot = () => {
    setForgotOpen(true);
    setForgotStep('email');
    setForgotEmail('');
    setForgotError('');
    setForgotSuccess('');
  };
 
  const closeForgot = () => {
    setForgotOpen(false);
    setForgotError('');
    setForgotSuccess('');
  };
 
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await fetchWithRetry(
        'https://pinit-backend.onrender.com/auth/forgot-password/request',
        {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ email: forgotEmail.toLowerCase().trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.detail || 'Email not found.');
        return;
      }
      setForgotSuccess(
        `A password reset link has been sent to ${forgotEmail}. Check your inbox.`,
      );
      setForgotStep('success');
    } catch {
      setForgotError('Unable to connect. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };
 
  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      {/* ── Logo area ──────────────────────────────────────────────────────── */}
      <div className="auth-logo-area">
        <div className="auth-logo-mark">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="white" fillOpacity="0.12" />
            <path d="M18 8L28 14V22L18 28L8 22V14L18 8Z" stroke="white" strokeWidth="2" fill="none" />
            <circle cx="18" cy="18" r="3" fill="white" />
          </svg>
        </div>
        <h1 className="auth-logo-text">PINIT</h1>
        <p className="auth-logo-sub">Mark it. Prove it. Own it.</p>
      </div>
 
      {/* ── Card ───────────────────────────────────────────────────────────── */}
      <div className="auth-card">
 
        {/* Biometric button (shown when available) */}
        {biometricAvailable && (
          <div className="biometric-section">
            <button
              type="button"
              className={`biometric-btn ${biometricEnrolled ? 'biometric-btn--active' : 'biometric-btn--inactive'}`}
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
            >
              <span className="biometric-btn__icon">
                {biometricLoading ? (
                  <span className="spinner" />
                ) : (
                  <FingerprintIcon />
                )}
              </span>
              <span className="biometric-btn__label">
                {biometricLoading
                  ? 'Verifying…'
                  : biometricEnrolled
                    ? 'Login with Fingerprint / Face ID'
                    : 'Biometric (setup after password login)'}
              </span>
            </button>
 
            <div className="divider">
              <span className="divider__line" />
              <span className="divider__text">or continue with password</span>
              <span className="divider__line" />
            </div>
          </div>
        )}
 
        {/* Error banner */}
        {error && (
          <div className="auth-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
 
        {/* Login form */}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="field-group">
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              className="field-input"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>
 
          <div className="field-group">
            <div className="field-label-row">
              <label className="field-label" htmlFor="password">Password</label>
              <button type="button" className="link-btn" onClick={openForgot}>
                Forgot password?
              </button>
            </div>
            <div className="field-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className="field-input field-input--padded"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <EyeIcon show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </div>
          </div>
 
          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? <span className="spinner spinner--dark" /> : 'Log In'}
          </button>
        </form>
 
        <p className="auth-footer-text">
          Don't have an account?{' '}
          <Link to="/register" className="link-btn link-btn--inline">
            Create account
          </Link>
        </p>
      </div>
 
      {/* ── Forgot Password Modal ───────────────────────────────────────────── */}
      {forgotOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && closeForgot()}
          role="dialog"
          aria-modal="true"
          aria-label="Reset password"
        >
          <div className="modal-sheet">
            <div className="modal-handle" />
 
            <div className="modal-header">
              <h2 className="modal-title">Reset Password</h2>
              <button className="modal-close" onClick={closeForgot} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
 
            {forgotStep === 'success' ? (
              <div className="modal-success">
                <div className="modal-success__icon">📧</div>
                <p className="modal-success__text">{forgotSuccess}</p>
                <button className="primary-btn" onClick={closeForgot}>
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="auth-form" noValidate>
                <p className="modal-desc">
                  Enter your registered email and we'll send you a reset link.
                </p>
                {forgotError && (
                  <div className="auth-error" role="alert">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {forgotError}
                  </div>
                )}
                <div className="field-group">
                  <label className="field-label" htmlFor="forgot-email">Email address</label>
                  <input
                    id="forgot-email"
                    type="email"
                    className="field-input"
                    value={forgotEmail}
                    onChange={(e) => { setForgotEmail(e.target.value); setForgotError(''); }}
                    placeholder="you@example.com"
                    inputMode="email"
                    required
                  />
                </div>
                <button type="submit" className="primary-btn" disabled={forgotLoading}>
                  {forgotLoading ? <span className="spinner spinner--dark" /> : 'Send Reset Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
 
export default Login;