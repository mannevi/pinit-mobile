import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css'; // shared auth styles
 
// ─── WebAuthn helpers ─────────────────────────────────────────────────────────
const isBiometricSupported = () =>
  !!(
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
 
const checkBiometricAvailable = async () => {
  if (!isBiometricSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};
 
const bufToBase64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
 
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
 
// ─── Step indicator ───────────────────────────────────────────────────────────
const StepDots = ({ current, total }) => (
  <div className="step-indicator" aria-label={`Step ${current} of ${total}`}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        className={`step-dot ${
          i + 1 === current
            ? 'step-dot--active'
            : i + 1 < current
              ? 'step-dot--done'
              : ''
        }`}
      />
    ))}
  </div>
);
 
// ─── Component ────────────────────────────────────────────────────────────────
function Register() {
  const [step, setStep]         = useState(1); // 1 form | 2 OTP | 3 biometric | 4 done
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword]           = useState(false);
  const [showConfirmPwd, setShowConfirmPwd]       = useState(false);
  const [otp, setOtp]                             = useState('');
  const [error, setError]                         = useState('');
  const [loading, setLoading]                     = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(true);
 
  const navigate = useNavigate();
 
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };
 
  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    if (!formData.name.trim()) { setError('Name is required.'); return false; }
    if (!formData.email.trim()) { setError('Email is required.'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please enter a valid email address.'); return false;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters.'); return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.'); return false;
    }
    return true;
  };
 
  // ── Step 1 — Register ─────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/register', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          username: formData.name,
          email   : formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Registration failed. Please try again.'); return; }
 
      const available = await checkBiometricAvailable();
      setBiometricSupported(available);
      setStep(2);
    } catch {
      setError(
        'Cannot connect to server. Please wait 30 seconds and try again — the server may be waking up.',
      );
    } finally {
      setLoading(false);
    }
  };
 
  // ── Step 2 — OTP verification ─────────────────────────────────────────────
  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/verify-otp', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email: formData.email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Invalid code. Please try again.'); return; }
      setStep(biometricSupported ? 3 : 4);
    } catch {
      setError('Cannot connect to server.');
    } finally {
      setLoading(false);
    }
  };
 
  const handleResendOTP = async () => {
    setError('');
    try {
      const res = await fetchWithRetry('https://pinit-backend.onrender.com/auth/resend-otp', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ email: formData.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Could not resend code. Please try again.');
      } else {
        alert(`✅ New code sent to ${formData.email}`);
      }
    } catch {
      setError('Cannot connect to server.');
    }
  };
 
  // ── Step 3 — Biometric enrollment ─────────────────────────────────────────
  const handleBiometricEnroll = async () => {
    setLoading(true);
    setError('');
    try {
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp       : { name: 'PINIT', id: window.location.hostname },
          user     : {
            id         : new TextEncoder().encode(formData.email),
            name       : formData.email,
            displayName: formData.name,
          },
          pubKeyCredParams: [
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
        const credId = bufToBase64(credential.rawId);
        localStorage.setItem('biometricCredentialId', credId);
        localStorage.setItem('biometricEmail',        formData.email);
        localStorage.setItem('biometricEnrolled',     'true');
        setStep(4);
      }
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Biometric was cancelled. You can still log in with your password.');
      } else if (e.name === 'NotSupportedError') {
        setError('Biometric is not supported on this device.');
      } else {
        setError(`Biometric setup failed: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  };
 
  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      {/* Logo */}
      <div className="auth-logo-area">
        <div className="auth-logo-mark">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="white" fillOpacity="0.12" />
            <path d="M18 8L28 14V22L18 28L8 22V14L18 8Z" stroke="white" strokeWidth="2" fill="none" />
            <circle cx="18" cy="18" r="3" fill="white" />
          </svg>
        </div>
        <h1 className="auth-logo-text">PINIT</h1>
        <p className="auth-logo-sub">Create your account</p>
      </div>
 
      {/* Card */}
      <div className="auth-card">
        <StepDots current={step} total={4} />
 
        {/* ── Step 1: Registration form ─────────────────────────────────── */}
        {step === 1 && (
          <>
            <h2 className="section-title">Join PINIT</h2>
            <p className="section-sub">Fill in your details to get started.</p>
 
            {error && (
              <div className="auth-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
 
            <form onSubmit={handleSubmit} className="auth-form" noValidate>
              <div className="field-group">
                <label className="field-label" htmlFor="name">Full name</label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  className="field-input"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
 
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
                <label className="field-label" htmlFor="password">Password</label>
                <div className="field-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="field-input field-input--padded"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                    required
                  />
                  <EyeIcon show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </div>
              </div>
 
              <div className="field-group">
                <label className="field-label" htmlFor="confirmPassword">Confirm password</label>
                <div className="field-input-wrap">
                  <input
                    id="confirmPassword"
                    type={showConfirmPwd ? 'text' : 'password'}
                    name="confirmPassword"
                    className="field-input field-input--padded"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                  />
                  <EyeIcon show={showConfirmPwd} onToggle={() => setShowConfirmPwd((v) => !v)} />
                </div>
              </div>
 
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? <span className="spinner spinner--dark" /> : 'Create Account'}
              </button>
            </form>
 
            <p className="auth-footer-text">
              Already have an account?{' '}
              <Link to="/login" className="link-btn link-btn--inline">Log in</Link>
            </p>
          </>
        )}
 
        {/* ── Step 2: OTP verification ──────────────────────────────────── */}
        {step === 2 && (
          <>
            <h2 className="section-title">Verify Email</h2>
            <p className="section-sub">
              Enter the 6-digit code sent to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{formData.email}</strong>
            </p>
 
            {error && (
              <div className="auth-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
 
            <form onSubmit={handleOTPSubmit} className="auth-form" noValidate>
              <div className="field-group">
                <label className="field-label" htmlFor="otp">Verification code</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="field-input otp-input"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                />
              </div>
 
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? <span className="spinner spinner--dark" /> : 'Verify Email'}
              </button>
            </form>
 
            <p className="auth-footer-text" style={{ marginTop: 16 }}>
              Didn't receive it?{' '}
              <button type="button" className="link-btn link-btn--inline" onClick={handleResendOTP}>
                Resend code
              </button>
            </p>
            <p className="auth-footer-text" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="link-btn link-btn--inline"
                style={{ color: 'var(--text-dim)' }}
                onClick={() => { setStep(1); setOtp(''); setError(''); }}
              >
                ← Back
              </button>
            </p>
          </>
        )}
 
        {/* ── Step 3: Biometric enrollment ──────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="biometric-hero">
              <span className="biometric-hero__icon">👆</span>
              <h2 className="biometric-hero__title">Enable Fingerprint Login</h2>
              <p className="biometric-hero__sub">
                Scan your fingerprint or use Face ID for instant, password-free login.
              </p>
              <p className="biometric-hero__note">Your biometric data never leaves your device.</p>
            </div>
 
            {error && (
              <div className="auth-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}
 
            <div className="info-box">
              <strong>🔐 What this does</strong>
              <ul>
                <li>Links your fingerprint to your account UUID</li>
                <li>Next time — tap to log in instantly</li>
                <li>Your UUID auto-embeds into every image you encrypt</li>
              </ul>
            </div>
 
            <button
              type="button"
              className="primary-btn"
              onClick={handleBiometricEnroll}
              disabled={loading}
            >
              {loading ? <span className="spinner spinner--dark" /> : '👆 Set Up Fingerprint / Face ID'}
            </button>
 
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setStep(4)}
            >
              Skip — use password only
            </button>
          </>
        )}
 
        {/* ── Step 4: Done ───────────────────────────────────────────────── */}
        {step === 4 && (
          <>
            <div className="success-box">
              <div className="success-box__icon">
                {localStorage.getItem('biometricEnrolled') === 'true' ? '👆✅' : '✅'}
              </div>
              <div className="success-box__title">
                {localStorage.getItem('biometricEnrolled') === 'true'
                  ? 'Fingerprint Registered!'
                  : 'Account Verified!'}
              </div>
              <p className="success-box__text">
                {localStorage.getItem('biometricEnrolled') === 'true'
                  ? 'You can now log in instantly with your fingerprint. Your UUID auto-embeds into every image.'
                  : 'Your account is ready. Log in with your email and password.'}
              </p>
            </div>
 
            <button
              type="button"
              className="primary-btn"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
 
export default Register;