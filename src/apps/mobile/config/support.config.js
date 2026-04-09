
export const SUPPORT_EMAIL = 'mannevaishnavi19@gmail.com';

export const SUPPORT_SUBJECT = 'PINIT App — Support Request';

export const SUPPORT_BODY =
  'Hi PINIT Support,\n\nI need help with:\n\n[Describe your issue here]\n\n---\nApp: PINIT Mobile v1.0';

/**
 * Opens the default mail app (Outlook, Apple Mail, etc.)
 * via the standard mailto: URI scheme.
 */
export const buildMailtoLink = () => {
  const subject = encodeURIComponent(SUPPORT_SUBJECT);
  const body    = encodeURIComponent(SUPPORT_BODY);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
};

/**
 * Opens Gmail specifically.
 *
 * Strategy (most-to-least reliable):
 *   1. On Android APK (Capacitor) → deep-link to Gmail app via intent URL.
 *      Falls back to Gmail web if the app is not installed.
 *   2. On iOS with Gmail app → googlegmail:// URL scheme.
 *      Falls back to Gmail web if the app is not installed.
 *   3. On web browser → Gmail web compose URL (opens in new tab).
 *
 * The caller picks the right URL using openGmail() below.
 */
export const GMAIL_WEB_LINK = (() => {
  const to      = encodeURIComponent(SUPPORT_EMAIL);
  const subject = encodeURIComponent(SUPPORT_SUBJECT);
  const body    = encodeURIComponent(SUPPORT_BODY);
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
})();

/** Gmail app deep link for iOS (googlegmail:// scheme) */
const GMAIL_IOS_SCHEME = (() => {
  const to      = encodeURIComponent(SUPPORT_EMAIL);
  const subject = encodeURIComponent(SUPPORT_SUBJECT);
  const body    = encodeURIComponent(SUPPORT_BODY);
  return `googlegmail:///co?to=${to}&subject=${subject}&body=${body}`;
})();

/** Gmail app deep link for Android (intent:// scheme) */
const GMAIL_ANDROID_INTENT = (() => {
  const to      = encodeURIComponent(SUPPORT_EMAIL);
  const subject = encodeURIComponent(SUPPORT_SUBJECT);
  const body    = encodeURIComponent(SUPPORT_BODY);
  // Falls back to Gmail web if app not installed (S.browser_fallback_url)
  const fallback = encodeURIComponent(GMAIL_WEB_LINK);
  return (
    `intent://send?to=${to}&subject=${subject}&body=${body}` +
    `#Intent;package=com.google.android.gm;scheme=mailto;` +
    `S.browser_fallback_url=${fallback};end`
  );
})();

/**
 * Opens Gmail in the most reliable way for the current platform.
 * Call this function on button press — do not store its return value.
 */
export const openGmail = () => {
  const isAndroid  = /Android/i.test(navigator.userAgent);
  const isIOS      = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isCapacitor = !!(window.Capacitor?.isNativePlatform?.());

  if (isCapacitor && isAndroid) {
    // Android APK: intent URL opens Gmail app directly, falls back to web
    window.location.href = GMAIL_ANDROID_INTENT;
    return;
  }

  if (isIOS) {
    // iOS: try Gmail app scheme, fall back to Gmail web after a short delay
    window.location.href = GMAIL_IOS_SCHEME;
    setTimeout(() => {
      // If the app didn't open (page is still visible), open Gmail web
      window.open(GMAIL_WEB_LINK, '_blank', 'noopener,noreferrer');
    }, 1200);
    return;
  }

  // Web browser (desktop or mobile web): open Gmail web compose in a new tab
  window.open(GMAIL_WEB_LINK, '_blank', 'noopener,noreferrer');
};