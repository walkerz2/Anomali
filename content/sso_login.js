/**
 * Content Script: Auto-ISI (bukan auto-SUBMIT) form login SSO BPS (sso.bps.go.id)
 * saat TUNTAS SE2026 mendeteksi sesi FASIH-SM logout (lihat detectLoggedOut() di
 * content/content.js).
 *
 * PENTING — kenapa tombol "Log In" TIDAK diklik otomatis:
 * Halaman SSO BPS memuat proteksi anti-bot F5 (skrip ter-obfuscate di dalam
 * <apm_do_not_touch>, cookie "TSPD"/"f5_cspm"). Proteksi semacam ini memang dibuat
 * untuk mendeteksi & memblokir klik yang dipicu oleh script (bukan klik manusia
 * asli) — itulah sebabnya tombol Log In sempat terlihat "tidak merespons" saat
 * dicoba diklik otomatis. Mencoba menembus proteksi itu (meniru gerakan mouse,
 * delay, dsb. supaya terlihat "manusiawi") sama saja membuat alat untuk
 * membypass sistem keamanan BPS sendiri — itu TIDAK dilakukan di sini.
 *
 * Jadi alurnya: script ini hanya MENGISI username & password (aman, tetap hemat
 * waktu Kakak), lalu berhenti dan minta satu klik manusia asli pada tombol
 * Log In. Setelah itu login berjalan normal, dan content.js akan mendeteksi
 * tab sudah kembali ke FASIH lalu otomatis melanjutkan antrian (lihat blok
 * "Lanjutkan otomatis setelah login SSO ulang" di content/content.js).
 *
 * Dipicu murni dari URL (manifest content_scripts match: https://sso.bps.go.id/*),
 * jadi hanya bertindak kalau fitur "Login Otomatis (SSO)" diaktifkan &
 * username/password sudah disimpan lewat popup TUNTAS (chrome.storage.local ->
 * tuntasSsoAuth). Tidak menyentuh background.js maupun content.js (selain lewat
 * chrome.storage.local & chrome.runtime.sendMessage({action:'UPDATE_STEP', ...})
 * yang sudah dipakai di sana).
 */
(() => {
  if (window.__tuntasSsoLoginInjected) return;
  window.__tuntasSsoLoginInjected = true;

  function notify(details, status = 'progress') {
    console.log('[TUNTAS-SSO]', details);
    try {
      chrome.runtime.sendMessage({ action: 'UPDATE_STEP', step: 'SSO_LOGIN', details, status, url: window.location.href });
    } catch (e) {}
  }

  function setNativeValue(input, value) {
    // Supaya listener JS lain (kalau ada, mis. validasi tombol) tetap mendeteksi perubahan.
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function findLoginForm() {
    const form = document.getElementById('kc-form-login') || document.querySelector('form[action*="login-actions/authenticate"]');
    const username = document.getElementById('username') || document.querySelector('input[name="username"]');
    const password = document.getElementById('password') || document.querySelector('input[name="password"]');
    const submitBtn = document.getElementById('kc-login') || document.querySelector('input[name="login"][type="submit"], button[type="submit"]');
    if (form && username && password && submitBtn) return { form, username, password, submitBtn };
    return null;
  }

  function findErrorMessage() {
    // Tema login Keycloak/BPS umumnya memakai .alert-error / #input-error / span.kc-feedback-text
    const el = document.querySelector('.alert-error, #input-error, .kc-feedback-text, [class*="alert-error"]');
    const text = el ? (el.textContent || '').trim() : '';
    return text || null;
  }

  function looksLikeMfaStep() {
    // Halaman OTP/MFA biasanya tidak punya field password tapi punya field kode/otp
    const hasPassword = !!document.querySelector('input[name="password"]');
    const hasOtpField = !!document.querySelector('input[name="otp"], input[name="totp"], input[id*="otp" i], input[autocomplete="one-time-code"]');
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body ? (document.body.innerText || '') : '').toLowerCase();
    return !hasPassword && (hasOtpField || /otp|kode verifikasi|two.?factor|autentikasi dua langkah|authenticator/.test(title + ' ' + bodyText));
  }

  function highlightSubmitButton(btn) {
    try {
      btn.style.outline = '3px solid #F7941D';
      btn.style.outlineOffset = '2px';
      btn.style.animation = 'tuntas-sso-pulse 1s ease-in-out infinite';
      if (!document.getElementById('tuntas-sso-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'tuntas-sso-pulse-style';
        style.textContent = '@keyframes tuntas-sso-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(247,148,29,.6); } 50% { box-shadow: 0 0 0 8px rgba(247,148,29,0); } }';
        document.head.appendChild(style);
      }
      btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) {}
  }

  async function run() {
    let data;
    try {
      data = await chrome.storage.local.get(['tuntasSsoAuth', 'tuntasSsoAttempt']);
    } catch (e) { return; }

    const auth = data.tuntasSsoAuth || {};
    if (!auth.enabled || !auth.username || !auth.password) return; // login otomatis tidak diaktifkan -> biarkan manual sepenuhnya

    if (looksLikeMfaStep()) {
      notify('Halaman meminta kode OTP/MFA — tidak bisa diisi otomatis. Silakan login manual di tab ini, lalu klik "Lanjut" di popup.', 'error');
      await chrome.storage.local.set({ tuntasSsoAttempt: { at: Date.now(), result: 'NEEDS_MFA' } }).catch(() => {});
      return;
    }

    const errMsg = findErrorMessage();
    if (errMsg) {
      notify(`Percobaan login sebelumnya gagal: "${errMsg}". Silakan periksa ulang username/password di popup TUNTAS (atau klik Log In manual kalau hanya salah ketik tadi).`, 'error');
      await chrome.storage.local.set({ tuntasSsoAttempt: { at: Date.now(), result: 'FAILED', message: errMsg } }).catch(() => {});
      // Tetap isi ulang field di bawah supaya Kakak tidak perlu ngetik ulang — tidak auto-submit lagi.
    }

    const fields = findLoginForm();
    if (!fields) return; // bukan halaman form login username/password

    notify('Username & password diisi otomatis. Sistem SSO BPS punya proteksi anti-bot untuk tombol Log In — klik tombol Log In (yang berkedip oranye) secara manual 1x untuk melanjutkan.', 'warning');
    setNativeValue(fields.username, auth.username);
    setNativeValue(fields.password, auth.password);
    highlightSubmitButton(fields.submitBtn);

    await chrome.storage.local.set({
      tuntasSsoAttempt: { at: Date.now(), result: 'FILLED' }
    }).catch(() => {});
  }

  // Form dirender di server (bukan SPA), biasanya sudah ada saat document_idle.
  // Tetap tunggu sebentar kalau belum siap (jaringan lambat / theme kustom).
  (async () => {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      if (findLoginForm() || looksLikeMfaStep() || findErrorMessage()) break;
      await new Promise(r => setTimeout(r, 300));
    }
    run().catch((e) => console.error('[TUNTAS-SSO] error:', e));
  })();
})();
