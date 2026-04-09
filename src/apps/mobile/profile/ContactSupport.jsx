import React, { useEffect } from 'react';
import { X, Mail, MessageCircleQuestion, Copy, CheckCircle, ExternalLink } from 'lucide-react';
import { SUPPORT_EMAIL, buildMailtoLink, openGmail } from '../config/support.config';

// ─── Clipboard hook ───────────────────────────────────────────────────────────
const useCopy = () => {
  const [copied, setCopied] = React.useState(false);
  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };
  return { copied, copy };
};

// ─── Gmail "G" SVG icon (inline — lucide has no Gmail icon) ──────────────────
const GmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M22 6c0-1.1-.9-2-2-2H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z"
      fill="#EA4335" opacity=".15"
    />
    <path
      d="M22 6L12 13 2 6"
      stroke="#EA4335" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      d="M2 6l10 7 10-7v12H2V6z"
      stroke="#EA4335" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────
function ContactSupport({ isOpen, onClose }) {
  const { copied, copy } = useCopy();

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGmail   = () => openGmail();
  const handleOtherMail = () => { window.location.href = buildMailtoLink(); };

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────────────────── */}
      <div className="cs-overlay" onClick={onClose} aria-hidden="true" />

      {/* ── Bottom sheet ───────────────────────────────────────────────────── */}
      <div
        className="cs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-title"
      >
        {/* Handle bar */}
        <div className="cs-handle" />

        {/* Close button */}
        <button className="cs-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {/* Icon */}
        <div className="cs-icon-wrap">
          <div className="cs-icon">
            <MessageCircleQuestion size={30} />
          </div>
        </div>

        {/* Title + description */}
        <h2 className="cs-title" id="cs-title">Contact Support</h2>
        <p className="cs-desc">
          Need help or have questions?{'\n'}Contact us below and we'll get back to you.
        </p>

        {/* Email display card */}
        <div className="cs-email-card">
          <div className="cs-email-card__ico">
            <Mail size={16} />
          </div>
          <div className="cs-email-card__body">
            <span className="cs-email-card__lbl">Support Email</span>
            <span className="cs-email-card__val">{SUPPORT_EMAIL}</span>
          </div>
          <button
            className={`cs-copy-btn ${copied ? 'cs-copy-btn--done' : ''}`}
            onClick={() => copy(SUPPORT_EMAIL)}
            aria-label={copied ? 'Email copied' : 'Copy email address'}
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
          </button>
        </div>

        {copied && <p className="cs-copied-msg">Email address copied ✓</p>}

        {/* ── Open with label ─────────────────────────────────────────────── */}
        <p className="cs-open-with-label">Open with</p>

        {/* ── Two-button email picker ──────────────────────────────────────── */}
        <div className="cs-picker">

          {/* Gmail */}
          <button className="cs-picker-btn cs-picker-btn--gmail" onClick={handleGmail}>
            <span className="cs-picker-btn__ico">
              <GmailIcon />
            </span>
            <span className="cs-picker-btn__label">Gmail</span>
            <ExternalLink size={12} className="cs-picker-btn__ext" />
          </button>

          {/* Other mail app (Outlook, Apple Mail, etc.) */}
          <button className="cs-picker-btn cs-picker-btn--mail" onClick={handleOtherMail}>
            <span className="cs-picker-btn__ico">
              <Mail size={18} />
            </span>
            <span className="cs-picker-btn__label">Other Mail App</span>
            <ExternalLink size={12} className="cs-picker-btn__ext" />
          </button>

        </div>

        {/* Secondary dismiss */}
        <button className="cs-dismiss-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </>
  );
}

export default ContactSupport;