/**
 * Content Script: Otomasi Pengisian Catatan FASIH-SM BPS
 * Menjalankan alur:
 * 1. Klik tombol Edit
 * 2. Menunggu form kuisioner terbuka, lalu klik Blok II (SE2026 - L BLOK II)
 * 3. Expand dropdown Keterangan Usaha/Perusahaan
 * 4. Loop tiap item usaha di dropdown:
 *    a. Klik item usaha
 *    b. Deteksi target pertanyaan (UB -> 23.a, Non-UB: Q25 <= 2025 ? 27.a : 31.a)
 *    c. Klik tombol Catatan pada pertanyaan tersebut
 *    d. Isi catatan (menu #DC_00 / #DC_01), aktifkan toggle konfirmasi galat, dan simpan
 * 5. Buka menu CATATAN di sidebar & aktifkan toggle Tampilkan Anomali
 * 6. Klik tombol Kirim di pojok kanan atas & konfirmasi modal kirim
 */

(() => {
  // Cegah multiple injection
  if (window.__fasihAutomationInjected) return;
  window.__fasihAutomationInjected = true;

  // Netralkan sebelum-tutup (beforeunload) agar Chrome tidak pernah memunculkan dialog 'Tinggalkan situs?' yang memblokir penutupan tab
  try {
    window.addEventListener('beforeunload', (e) => {
      e.stopImmediatePropagation();
    }, true);
    window.onbeforeunload = null;
  } catch (e) {}

  console.log('[TUNTAS] Content script loaded on:', window.location.href);

  // State Eksekusi untuk Kontrol Pause & Stop Segera
  const executionState = {
    isRunning: false,
    isPaused: false,
    isAborted: false
  };

  class AbortError extends Error {
    constructor(message = 'Otomasi dihentikan oleh pengguna (STOP)') {
      super(message);
      this.name = 'AbortError';
    }
  }

  // Pengecekan abort atau pause segera
  async function checkAbortOrPause() {
    if (executionState.isAborted) {
      throw new AbortError();
    }
    while (executionState.isPaused && !executionState.isAborted) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (executionState.isAborted) {
      throw new AbortError();
    }
  }

  // Helper integer random
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Helper Sleep Interruptible (dapat dihentikan atau dijeda langsung kapan saja)
  async function sleep(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      await checkAbortOrPause();
      const remaining = ms - (Date.now() - start);
      await new Promise((r) => setTimeout(r, Math.min(100, remaining)));
    }
  }

  // Helper Sleep dengan durasi acak (menghindari pola millisecond yang kaku/terdeteksi bot)
  async function randomSleep(minMs, maxMs) {
    const ms = getRandomInt(minMs, maxMs);
    await sleep(ms);
  }

  // Menambahkan variasi acak (jitter ±25%) pada base delay agar ritme eksekusi natural layaknya manusia
  function getJitterDelay(baseDelayMs) {
    const min = Math.max(300, Math.round(baseDelayMs * 0.8));
    const max = Math.round(baseDelayMs * 1.25);
    return getRandomInt(min, max);
  }

  // Helper mapping key code keyboard untuk dispatch event realistis
  function getKeyboardCode(char) {
    if (/[a-zA-Z]/.test(char)) return `Key${char.toUpperCase()}`;
    if (/[0-9]/.test(char)) return `Digit${char}`;
    if (char === '#') return 'Digit3';
    if (char === '_') return 'Minus';
    if (char === ' ') return 'Space';
    if (char === '.') return 'Period';
    return 'Unidentified';
  }

  // Helper Log
  function notifyStep(stepName, details = '', status = 'progress') {
    console.log(`[TUNTAS] ${stepName}: ${details}`);
    try {
      chrome.runtime.sendMessage({
        action: 'UPDATE_STEP',
        step: stepName,
        details: details,
        status: status,
        url: window.location.href
      });
    } catch (e) {
      // Background mungkin tidak mendengarkan atau reload
    }
  }

  // Helper wait for element dengan timeout dan custom evaluator
  async function waitForElement(finderFn, timeoutMs = 20000, intervalMs = 400) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await checkAbortOrPause();
      try {
        const el = finderFn();
        if (el) return el;
      } catch (err) {
        if (err instanceof AbortError) throw err;
        // Abaikan sementara mencari
      }
      await sleep(intervalMs);
    }
    return null;
  }

  // Simulasi klik manusiawi (human-like click):
  // 1. Smooth scroll ke elemen
  // 2. Pre-click hover & mouseover pause (160ms - 320ms)
  // 3. Pointer & Mouse down event
  // 4. Contact hold duration (50ms - 110ms) layaknya jari menekan tombol fisik
  // 5. Pointer & Mouse up event, lalu click
  // 6. Post-click reaction delay (100ms - 220ms)
  async function humanClick(el) {
    if (!el) return false;
    await checkAbortOrPause();

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    // Jeda alami manusia mengarahkan kursor dan melihat elemen
    await randomSleep(160, 320);
    await checkAbortOrPause();

    // Event hover / mouseover
    try {
      el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));
    } catch (_) {
      el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));

    // Jeda sesaat sebelum tombol ditekan
    await randomSleep(40, 90);
    await checkAbortOrPause();

    // Mouse down
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    } catch (_) {
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    // Durasi hold tombol mouse ditekan
    await randomSleep(50, 110);
    await checkAbortOrPause();

    // Mouse up & click
    try {
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
    } catch (_) {
      el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();

    // Jeda reaksi manusia setelah klik
    await randomSleep(100, 220);
    return true;
  }

  // Wrapper triggerClick untuk kompatibilitas
  async function triggerClick(el) {
    return await humanClick(el);
  }

  // Simulasi ketikan manusiawi (human-like typing):
  // 1. Focus ke textarea
  // 2. Jeda reaksi awal sebelum mengetik (180ms - 320ms)
  // 3. Mengetik karakter per karakter dengan jeda acak (55ms - 125ms per keystroke)
  // 4. Memancarkan keydown, beforeinput, input, keyup secara natural
  // 5. Menjaga reaktivitas SolidJS/Kobalte lewat native value setter
  // 6. Jeda selesai ketik sebelum blur/submit (200ms - 380ms)
  async function simulateHumanTyping(textarea, text) {
    if (!textarea) return false;
    await checkAbortOrPause();

    textarea.focus();
    await randomSleep(180, 320);

    const proto = textarea.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    let currentVal = '';

    for (let i = 0; i < text.length; i++) {
      await checkAbortOrPause();
      const char = text[i];
      currentVal += char;
      const code = getKeyboardCode(char);

      // Keydown
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: char, code: code, bubbles: true, cancelable: true }));

      // Update nilai
      try {
        if (nativeSetter) {
          nativeSetter.call(textarea, currentVal);
        } else {
          textarea.value = currentVal;
        }
      } catch (e) {
        textarea.value = currentVal;
      }

      // Input event chain
      try {
        textarea.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: char, inputType: 'insertText' }));
      } catch (e) {}
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      try {
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: char, inputType: 'insertText' }));
      } catch (e) {}

      // Keyup
      textarea.dispatchEvent(new KeyboardEvent('keyup', { key: char, code: code, bubbles: true, cancelable: true }));

      // Jeda alami antar ketukan tombol (meniru kecepatan manusia 40-70 WPM)
      await randomSleep(55, 125);
    }

    // Event change & selesai mengetik
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    await randomSleep(200, 380);
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // Wrapper simulateTextareaInput untuk backward compatibility
  async function simulateTextareaInput(textarea, text) {
    return await simulateHumanTyping(textarea, text);
  }

  // Helper deteksi server down atau halaman error HTTP (500, 502, 503, 504, maintenance)
  function detectServerDownOrErrorPage() {
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body ? document.body.innerText || document.body.textContent : '').toLowerCase();

    // 1. Cek dari title browser
    if (
      title.includes('502 bad gateway') ||
      title.includes('503 service') ||
      title.includes('504 gateway') ||
      title.includes('500 internal') ||
      title.includes('service unavailable') ||
      (title.includes('error') && title.includes('gateway'))
    ) {
      return `SERVER_DOWN: ${document.title.trim()}`;
    }

    // 2. Cek pesan error server / Cloudflare / Nginx / Apache
    if (
      bodyText.includes('502 bad gateway') ||
      bodyText.includes('503 service temporarily unavailable') ||
      bodyText.includes('504 gateway time-out') ||
      bodyText.includes('web server is returning an unknown error') ||
      bodyText.includes('an error occurred while processing your request') ||
      bodyText.includes("server error in '/' application")
    ) {
      return 'SERVER_DOWN: Server FASIH-SM merespons Bad Gateway / Service Unavailable (502/503/504).';
    }

    // 3. Cek jika halaman offline / ERR_CONNECTION
    if (
      bodyText.includes('err_connection_timed_out') ||
      bodyText.includes('err_connection_refused') ||
      bodyText.includes('this site can’t be reached') ||
      bodyText.includes('tidak dapat dijangkau')
    ) {
      return 'SERVER_DOWN: Koneksi terputus ke server FASIH-SM (ERR_CONNECTION).';
    }

    return null;
  }

  // Helper deteksi dan pembentukan URL /edit
  function checkIsEditUrl(urlStr) {
    try {
      const parsed = new URL(urlStr || window.location.href);
      const pathname = parsed.pathname.replace(/\/+$/, '');
      return pathname.endsWith('/edit');
    } catch (e) {
      const clean = (urlStr || window.location.href).split('?')[0].split('#')[0].replace(/\/+$/, '');
      return clean.endsWith('/edit');
    }
  }

  // Link /app/assignment-detail/<id> tidak punya halaman /edit (404) -> kembalikan null
  function isAssignmentDetailUrl(urlStr) {
    return /\/assignment-detail\//i.test(String(urlStr || window.location.href));
  }

  function getEditUrl(urlStr) {
    const src = urlStr || window.location.href;
    if (isAssignmentDetailUrl(src)) return null;
    if (!/\/assignment\//i.test(String(src))) return null;
    try {
      const parsed = new URL(src);
      let pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname.endsWith('/edit')) {
        pathname += '/edit';
      }
      parsed.pathname = pathname;
      return parsed.toString();
    } catch (e) {
      let clean = src.replace(/\/+$/, '');
      if (!clean.endsWith('/edit')) {
        clean += '/edit';
      }
      return clean;
    }
  }

  // Deteksi halaman 404 FASIH ("404 - Not Found")
  function detectNotFoundPage() {
    const text = (document.body ? document.body.innerText || '' : '').toLowerCase();
    return text.includes('404 - not found') || (text.includes('404') && text.includes("page you're looking for doesn't exist"));
  }

  // ===================== SSO & LOGIN HELPERS =====================

  let isSsoLoginInProgress = false;

  // Helper: pastikan TIDAK PERNAH memilih tombol "Login dengan Google"
  function isGoogleAuthElement(el) {
    if (!el) return false;
    const info = [
      el.innerText,
      el.textContent,
      el.value,
      el.id,
      typeof el.className === 'string' ? el.className : '',
      el.getAttribute && el.getAttribute('href'),
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('title')
    ].filter(Boolean).join(' ').toLowerCase();
    return info.includes('google');
  }

  // 1. Mencari tombol / link "Lanjutkan dengan SSO Eksternal" secara presisi
  function findSsoEksternalButton() {
    const keywords = [
      'lanjutkan dengan sso eksternal',
      'lanjutkan sso eksternal',
      'masuk dengan sso eksternal',
      'lanjutkan dengan sso external',
      'lanjutkan sso external',
      'sso eksternal',
      'sso external'
    ];

    const isElemVisible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    // 1. Prioritaskan elemen <button> dan <a> secara langsung (bukan div pembungkus luar!)
    const primaryButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(el => isElemVisible(el) && !isGoogleAuthElement(el) && !el.querySelector('button, a'));

    const matches = [];
    for (const el of primaryButtons) {
      const text = (el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text || text.length > 65) continue;
      // Pastikan mengandung kata 'eksternal' / 'external' agar tidak salah klik "Lanjutkan dengan SSO" (internal)
      if (!text.includes('eksternal') && !text.includes('external')) continue;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          matches.push({ el, len: text.length });
          break;
        }
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => a.len - b.len);
      return matches[0].el;
    }

    // 2. Cek atribut ID khusus tombol SSO eksternal
    const idCandidates = Array.from(document.querySelectorAll(
      '#social-sso-eksternal, #z-sso-eksternal, [id*="sso-eksternal" i], [id*="sso_eksternal" i]'
    ));
    for (const el of idCandidates) {
      if (isElemVisible(el) && !isGoogleAuthElement(el)) return el;
    }

    // 3. Fallback: cari elemen teks terdalam yang bertuliskan "Lanjutkan dengan SSO Eksternal" lalu ambil tombol pembungkus terdekatnya
    const textElements = Array.from(document.querySelectorAll('span, p, div, b, strong, label'));
    for (const el of textElements) {
      if (el.children.length > 2) continue;
      if (!isElemVisible(el) || isGoogleAuthElement(el)) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text || text.length > 55) continue;
      if (!text.includes('eksternal') && !text.includes('external')) continue;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          const parentBtn = el.closest('button, a, [role="button"]');
          if (parentBtn && isElemVisible(parentBtn) && !isGoogleAuthElement(parentBtn)) {
            return parentBtn;
          }
          // Jika div tombol tidak punya tag button, ambil parent langsung yang ukurannya wajar (bukan container seluruh kartu)
          const p = el.parentElement;
          if (p && isElemVisible(p) && ((p.innerText || '').trim().length <= 65) && !isGoogleAuthElement(p)) {
            return p;
          }
          return el;
        }
      }
    }

    return null;
  }

  // 2. Mencari input Email / Username SSO
  function findSsoEmailInput() {
    const selectors = [
      'input#username',
      'input[name="username"]',
      'input[type="email"]',
      'input#email',
      'input[name="email"]',
      'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      'input[id*="email" i]',
      'input[name*="email" i]',
      'input[id*="username" i]',
      'input[name*="username" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && !el.disabled && el.type !== 'hidden') {
        return el;
      }
    }

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])'));
    for (const inp of inputs) {
      if (inp.offsetParent === null || inp.disabled) continue;
      const hints = [
        inp.placeholder,
        inp.getAttribute('aria-label'),
        inp.id,
        inp.name,
        inp.getAttribute('title')
      ].filter(Boolean).join(' ').toLowerCase();

      if (
        hints.includes('email') ||
        hints.includes('surel') ||
        hints.includes('username') ||
        hints.includes('pengguna') ||
        hints.includes('user') ||
        hints.includes('akun') ||
        hints.includes('nik')
      ) {
        return inp;
      }
    }

    const pass = findSsoPasswordInput();
    if (pass) {
      const container = pass.closest('form') || pass.closest('div[class*="login" i], div[class*="auth" i]') || document.body;
      const firstText = container.querySelector('input[type="text"], input[type="email"], input:not([type])');
      if (firstText && firstText !== pass && firstText.offsetParent !== null && !firstText.disabled) {
        return firstText;
      }
    }

    return null;
  }

  // 3. Mencari input Password SSO
  function findSsoPasswordInput() {
    const passInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    for (const el of passInputs) {
      if (el.offsetParent !== null && !el.disabled) return el;
    }

    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
    for (const inp of inputs) {
      if (inp.offsetParent === null || inp.disabled) continue;
      const hints = [inp.id, inp.name, inp.placeholder, inp.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
      if (hints.includes('password') || hints.includes('sandi') || hints.includes('kata sandi')) {
        return inp;
      }
    }

    return null;
  }

  // 4. Mencari tombol Submit / Masuk / Log In SSO (PASTIKAN BUKAN Login dengan Google)
  function findSsoSubmitButton() {
    const kc = document.querySelector('#kc-login, input#kc-login, button#kc-login, input[name="login"], button[name="login"]');
    if (kc && kc.offsetParent !== null && !kc.disabled && !isGoogleAuthElement(kc)) return kc;

    const pass = findSsoPasswordInput();
    const form = pass ? (pass.closest('form') || pass.closest('div[class*="login" i], div[class*="auth" i]') || document.body) : document.body;

    const submitInputs = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    for (const el of submitInputs) {
      if (el.offsetParent !== null && !el.disabled && !isGoogleAuthElement(el)) return el;
    }

    const buttons = Array.from(form.querySelectorAll('button, input[type="button"], a, [role="button"], div.tw\\:cursor-pointer, div.cursor-pointer'));
    for (const btn of buttons) {
      if (btn.offsetParent === null || btn.disabled) continue;
      if (isGoogleAuthElement(btn)) continue;
      const t = (btn.innerText || btn.textContent || btn.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (
        t === 'log in' ||
        t === 'login' ||
        t === 'masuk' ||
        t === 'sign in' ||
        t === 'submit' ||
        t === 'masuk ke akun'
      ) {
        return btn;
      }
    }

    return null;
  }

  // 5. Mencari modal notifikasi sesi berakhir
  function findSessionExpiredElement() {
    const modalSelectors = [
      '[role="dialog"]',
      '.modal',
      '.tw\\:modal',
      '.swal2-modal',
      '.swal2-popup',
      'div[class*="dialog" i]',
      'div[class*="modal" i]'
    ];
    
    for (const sel of modalSelectors) {
      const dialogs = Array.from(document.querySelectorAll(sel));
      for (const d of dialogs) {
        if (d.offsetParent === null) continue;
        const text = (d.innerText || d.textContent || '').toLowerCase();
        if (
          (text.includes('sesi') && (text.includes('berakhir') || text.includes('habis') || text.includes('kadaluarsa') || text.includes('expired') || text.includes('timeout'))) ||
          text.includes('session expired') ||
          text.includes('silakan login kembali')
        ) {
          const btn = d.querySelector('button, a, [role="button"]');
          return { modal: d, actionBtn: btn };
        }
      }
    }

    const bodyText = (document.body ? document.body.innerText || '' : '').toLowerCase();
    if (
      bodyText.includes('sesi anda telah berakhir') ||
      bodyText.includes('sesi telah habis') ||
      bodyText.includes('session expired') ||
      bodyText.includes('silakan login kembali')
    ) {
      const btn = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(b => {
        if (isGoogleAuthElement(b)) return false;
        const t = (b.innerText || b.textContent || '').trim().toLowerCase();
        return t.includes('login') || t.includes('masuk') || t.includes('ok') || t.includes('muat ulang');
      });
      return { modal: document.body, actionBtn: btn || null };
    }

    return null;
  }

  // 6. Mendeteksi apakah halaman saat ini adalah Login / SSO BPS
  function isLoginPage() {
    if (isAnyFormBlockPresent() && !findSessionExpiredElement()) {
      return false;
    }

    const url = window.location.href.toLowerCase();
    const title = (document.title || '').toLowerCase();
    const bodyText = (document.body ? document.body.innerText || '' : '').toLowerCase();

    // Cek URL
    if (
      url.includes('/login') ||
      url.includes('/auth') ||
      url.includes('/signin') ||
      url.includes('sso.bps.go.id') ||
      url.includes('auth.bps.go.id') ||
      url.includes('cas.bps.go.id') ||
      url.includes('protocol/openid-connect')
    ) {
      return true;
    }

    // Tombol SSO Eksternal terdeteksi
    if (findSsoEksternalButton()) return true;

    // Password & email input terdeteksi
    if (findSsoPasswordInput() && findSsoEmailInput()) return true;

    // Modal sesi berakhir terdeteksi
    if (findSessionExpiredElement()) return true;

    // Judul atau teks halaman
    if (
      title.includes('login') ||
      title.includes('masuk') ||
      title.includes('single sign on') ||
      title.includes('sso bps') ||
      bodyText.includes('lanjutkan sso eksternal') ||
      bodyText.includes('sso eksternal') ||
      (bodyText.includes('masuk') && bodyText.includes('kata sandi'))
    ) {
      return true;
    }

    return false;
  }

  // Helper pengisian input yang kompatibel dengan berbagai frontend framework & native form
  async function fillInputField(input, value) {
    if (!input) return false;
    await checkAbortOrPause();

    try {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    await randomSleep(120, 240);
    input.focus();
    await randomSleep(80, 160);

    input.value = '';
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(input, '');
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await simulateHumanTyping(input, value);

    if (input.value !== value) {
      if (nativeSetter) {
        nativeSetter.call(input, value);
      } else {
        input.value = value;
      }
    }

    try {
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, data: value, inputType: 'insertText' }));
    } catch (e) {}
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await randomSleep(100, 200);
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  // Helper klik ekstra pasti untuk tombol SSO Eksternal
  async function clickSsoEksternalElement(btn) {
    if (!btn) return;
    const target = btn.closest('button, a, [role="button"]') || btn;
    await humanClick(target);
    try {
      const inner = target.querySelector && target.querySelector('button, a');
      if (inner && inner !== target) inner.click();
    } catch (e) {}
  }

  // Alur Eksekusi Login SSO Eksternal
  async function handleSsoLogin(options = {}) {
    if (isSsoLoginInProgress) {
      console.log('[TUNTAS SSO] Login SSO sudah sedang berjalan...');
      await sleep(2000);
      return { success: true, inProgress: true };
    }

    isSsoLoginInProgress = true;
    try {
      const email = options.ssoEmail || 'Haerulhaeruddin003@gmail.com';
      const password = options.ssoPassword || 'Mitra123';

      notifyStep('SSO_LOGIN', 'Terdeteksi halaman login SSO...', 'progress');

      // 1. Tangani modal sesi berakhir jika ada
      const sessionExp = findSessionExpiredElement();
      if (sessionExp && sessionExp.actionBtn) {
        notifyStep('SSO_LOGIN', 'Menutup notifikasi sesi berakhir / klik login kembali...', 'progress');
        await humanClick(sessionExp.actionBtn);
        await randomSleep(1500, 2500);
      }

      // 2. Tunggu sebentar jika halaman baru saja dimuat agar elemen tombol/input sempat dirender oleh SPA
      for (let w = 0; w < 10; w++) {
        if (findSsoPasswordInput() || findSsoEksternalButton()) break;
        await sleep(400);
      }

      let emailInput = findSsoEmailInput();
      let passInput = findSsoPasswordInput();

      // 3. Jika kolom password BELUM tampil (masih di halaman "Selamat Datang Kembali"),
      //    cari dan klik tombol "Lanjutkan dengan SSO Eksternal"
      if (!passInput) {
        let ssoBtn = findSsoEksternalButton();
        if (ssoBtn) {
          notifyStep('SSO_LOGIN', 'Tombol "Lanjutkan dengan SSO Eksternal" ditemukan. Mengklik...', 'progress');
          await clickSsoEksternalElement(ssoBtn);
          await randomSleep(1800, 2600);
        }

        // Tunggu hingga halaman berpindah ke form input Password & Email (atau ulangi klik tiap ~2.5 detik jika tombol masih ada)
        const startTime = Date.now();
        let pollCount = 0;
        emailInput = findSsoEmailInput();
        passInput = findSsoPasswordInput();

        while (!passInput && Date.now() - startTime < 20000) {
          await sleep(600);
          pollCount++;

          if (isAnyFormBlockPresent()) {
            return { success: true, ssoLoggedIn: true, ssoStage: 'FORM_READY' };
          }

          emailInput = findSsoEmailInput();
          passInput = findSsoPasswordInput();
          if (passInput) break;

          // Jika tombol "Lanjutkan dengan SSO Eksternal" masih ada di layar (belum berpindah halaman), klik lagi setiap ~2.4 detik
          const currentSsoBtn = findSsoEksternalButton();
          if (currentSsoBtn && (!ssoBtn || pollCount % 4 === 0)) {
            ssoBtn = currentSsoBtn;
            notifyStep('SSO_LOGIN', 'Mengklik tombol "Lanjutkan dengan SSO Eksternal"...', 'progress');
            await clickSsoEksternalElement(ssoBtn);
            await randomSleep(1200, 1800);
          }
        }
      }

      if (!passInput) {
        // Jika tombol sudah diklik dan halaman sedang proses redirect
        notifyStep('SSO_LOGIN', 'Menunggu pengalihan halaman SSO Eksternal...', 'progress');
        return { success: true, ssoStage: 'CLICKED_SSO_EKSTERNAL' };
      }

      // 4. Langsung masukkan Email (halaman EKSTERNAL BPS)
      emailInput = findSsoEmailInput() || emailInput;
      if (emailInput) {
        notifyStep('SSO_LOGIN', `Memasukkan email (${email})...`, 'progress');
        await fillInputField(emailInput, email);
        await randomSleep(200, 400);
      }

      // 5. Langsung masukkan Password
      notifyStep('SSO_LOGIN', 'Memasukkan password SSO...', 'progress');
      await fillInputField(passInput, password);
      await randomSleep(300, 600);

      // 6. Klik tombol "Log In" (Hijau) / Submit (TIDAK PERNAH klik Login dengan Google)
      const submitBtn = findSsoSubmitButton();
      if (submitBtn) {
        notifyStep('SSO_LOGIN', 'Mengklik tombol Log In...', 'progress');
        await humanClick(submitBtn);
      } else {
        notifyStep('SSO_LOGIN', 'Menekan Enter pada password...', 'progress');
        passInput.focus();
        passInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        passInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        passInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        const form = passInput.closest('form');
        if (form) {
          try { form.submit(); } catch (e) {}
        }
      }

      notifyStep('SSO_LOGIN', 'Data login SSO berhasil dikirim. Menunggu redirect kembali ke FASIH...', 'progress');

      // Tunggu hingga halaman redirect keluar dari form login SSO (maksimal 12 detik)
      const waitRedirectStart = Date.now();
      while (Date.now() - waitRedirectStart < 12000) {
        await sleep(800);
        if (!findSsoPasswordInput() && !window.location.hostname.includes('sso.bps.go.id')) {
          break;
        }
      }

      return { success: true, ssoLoggedIn: true, ssoStage: 'SUBMITTED_CREDENTIALS' };
    } finally {
      isSsoLoginInProgress = false;
    }
  }

  // ===================== FINDERS =====================

  // 1. Tombol Edit
  function findEditButton() {
    // 0. Halaman /app/assignment-detail/<id>: tombol oranye bertuliskan "Review" (atau "Edit") di kanan atas
    const textButtons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const btn of textButtons) {
      const label = (btn.innerText || btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if ((label === 'review' || label === 'edit') && btn.offsetParent !== null && !btn.disabled) {
        return btn;
      }
    }

    // 1. Cari langsung button yang memiliki icon tabler-icon-edit
    const svgIcon = document.querySelector('svg.tabler-icon-edit, svg[class*="tabler-icon-edit"]');
    if (svgIcon) {
      const btn = svgIcon.closest('button, [role="button"], a');
      if (btn) return btn;
    }

    // 2. Cari button bulat f:rounded-full (size-10, bg-primary) yang memuat icon edit
    const roundButtons = Array.from(document.querySelectorAll('button[class*="rounded-full"], button.f\\:rounded-full, button[class*="size-10"]'));
    for (const btn of roundButtons) {
      const svg = btn.querySelector('svg');
      if (svg) {
        const hasEditClass = (svg.getAttribute('class') || '').includes('tabler-icon-edit') || svg.classList.contains('tabler-icon-edit');
        const hasEditPath = svg.querySelector('path[d*="M7 7h-1"], path[d*="8.415 8.385"], path[d*="M16 5l3 3"], path[d*="20.385"]');
        if (hasEditClass || hasEditPath) return btn;
      }
    }

    // 3. Fallback: cari button apapun dengan path SVG pensil/edit atau attribute edit
    const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const btn of allButtons) {
      const hasEditPath = btn.querySelector('path[d*="M7 7h-1"], path[d*="8.415 8.385"], path[d*="M16 5l3 3"], path[d*="20.385"]');
      if (hasEditPath) return btn;
      
      const title = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').toLowerCase();
      if (title.includes('edit') || title.includes('ubah')) return btn;
    }
    return null;
  }

  // 2. Menu Blok II
  function findBlockIIButton() {
    // Cari elemen dengan title atau teks SE2026 - L BLOK II
    const byTitle = document.querySelector('[title*="SE2026 - L BLOK II"], [title*="BLOK II"]');
    if (byTitle) return byTitle;

    // Cari dari text node
    const allDivs = Array.from(document.querySelectorAll('div, a, button, li'));
    for (const el of allDivs) {
      const text = (el.textContent || '').trim();
      if (text.includes('SE2026 - L BLOK II') || (text.includes('BLOK II') && text.includes('KETERANGAN USAHA'))) {
        return el.closest('.tw\\:cursor-pointer, [role="button"], div') || el;
      }
    }
    return null;
  }

  // 2a. Menu BLOK I (IDENTITAS USAHA/PERUSAHAAN - untuk SE2026 - UB)
  function findBlockIButton() {
    // 1. Cari elemen dengan title memuat BLOK I atau IDENTITAS
    const byTitle = document.querySelector('[title="BLOK I"], [title*="BLOK I"], [title*="Blok I"], [title="IDENTITAS USAHA/PERUSAHAAN"], [title*="IDENTITAS"]');
    if (byTitle) {
      return byTitle.closest('.tw\\:cursor-pointer, [role="button"]') || byTitle;
    }

    // 2. Cari dari data-id="BLOK I" atau data-id memuat BLOK I
    const byDataId = document.querySelector('[data-id="BLOK I"], [data-id*="BLOK I"], [data-id*="IDENTITAS"]');
    if (byDataId) {
      return byDataId.closest('.tw\\:cursor-pointer, [role="button"], div') || byDataId;
    }

    // 3. Cari dari text node yang memuat BLOK I (pastikan bukan BLOK II, BLOK III, dll)
    const allDivs = Array.from(document.querySelectorAll('div, a, button, li, span'));
    for (const el of allDivs) {
      if (el.children.length > 2) continue;
      const text = (el.textContent || '').trim().toUpperCase();
      if (
        (text.includes('BLOK I') || text.includes('SECTION I') || text.startsWith('I.')) &&
        !text.includes('BLOK II') && !text.includes('BLOK III') && !text.includes('BLOK IV')
      ) {
        return el.closest('.tw\\:cursor-pointer, [role="button"], div') || el;
      }
    }

    return null;
  }

  function isAnyFormBlockPresent() {
    return !!(findBlockIIButton() || findBlockIButton());
  }

  // 2b. Cari menu sidebar "CATATAN" (ikon merah peringatan/anomali)
  function findMenuCatatanButton() {
    // Cari elemen dengan title="CATATAN" atau text "CATATAN"
    const byTitle = document.querySelector('[title="CATATAN"], [title="Catatan"]');
    if (byTitle) {
      return byTitle.closest('.tw\\:cursor-pointer, [role="button"]') || byTitle;
    }

    // Cari dari text node dan class cursor-pointer
    const allDivs = Array.from(document.querySelectorAll('.tw\\:cursor-pointer, .fasih-form-sidebar div, div'));
    for (const el of allDivs) {
      const text = (el.textContent || '').trim();
      const title = (el.getAttribute('title') || '').trim();
      if (title.toUpperCase() === 'CATATAN' || text.toUpperCase() === 'CATATAN') {
        return el.closest('.tw\\:cursor-pointer, [role="button"]') || el;
      }
    }

    // Fallback: cari dari SVG berkelas tw:text-destructive dengan icon peringatan
    const svgAlert = document.querySelector('svg.tw\\:text-destructive, svg[class*="text-destructive"]');
    if (svgAlert) {
      const parentBtn = svgAlert.closest('.tw\\:cursor-pointer, [role="button"], div');
      if (parentBtn && (parentBtn.textContent || '').toUpperCase().includes('CATATAN')) {
        return parentBtn;
      }
    }

    return null;
  }

  // 3. Dropdown Keterangan Usaha / Perusahaan
  function findKeteranganUsahaHeader() {
    const byTitle = document.querySelector('[title*="Keterangan Usaha" i], [title*="Keterangan Usaha/Perusahaan" i]');
    if (byTitle) return byTitle.closest('button, [role="button"], .tw\\:cursor-pointer') || byTitle;

    const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span, p, a'));
    for (const el of candidates) {
      if (el.children.length > 3) continue;
      const text = normalizeFasihText(el.textContent || '');
      if (text.includes('keterangan usaha') && !text.includes('blok i') && !text.includes('blok ii')) {
        return el.closest('button, [role="button"], .tw\\:cursor-pointer, div') || el;
      }
    }
    return null;
  }

  // Cari container sidebar navigasi yang memuat menu blok form
  function getSidebarNavigationElement() {
    const b2 = findBlockIIButton() || findBlockIButton();
    if (!b2) return document.body;
    let p = b2.parentElement;
    for (let i = 0; i < 8 && p && p !== document.body; i++) {
      if (['ASIDE', 'NAV'].includes(p.tagName) || p.getAttribute('role') === 'navigation') {
        return p;
      }
      if (p.classList && (p.classList.contains('fasih-form-sidebar') || String(p.className).includes('sidebar'))) {
        return p;
      }
      if (p.querySelectorAll && p.querySelectorAll('[title*="BLOK"], [title*="CATATAN"]').length >= 2) {
        return p;
      }
      p = p.parentElement;
    }
    return b2.closest('aside, nav') || document.body;
  }

  // 4. Cari collapsible container untuk Keterangan Usaha
  function findKeteranganUsahaCollapsible() {
    const header = findKeteranganUsahaHeader();
    if (!header) return null;

    // Cari dari container sidebar atau parent
    const sidebarGroup = header.closest('.fasih-form-sidebar') || header.parentElement;
    if (sidebarGroup) {
      const coll = sidebarGroup.querySelector('[id^="collapsible-"], [id^="radix-"], [data-expanded], [role="region"]');
      if (coll && coll !== header) return coll;
    }

    // Cari sibling berikutnya
    let sibling = header.nextElementSibling;
    while (sibling) {
      if (
        sibling.id?.includes('collapsible') ||
        sibling.id?.includes('radix') ||
        sibling.hasAttribute('data-state') ||
        sibling.querySelector?.('[id*="collapsible"], [id^="radix-"]')
      ) {
        return sibling;
      }
      sibling = sibling.nextElementSibling;
    }

    return null;
  }

  // 5. Temukan semua item unit usaha dalam dropdown
  function getBusinessItems() {
    const header = findKeteranganUsahaHeader();
    const coll = findKeteranganUsahaCollapsible();
    const sidebar = getSidebarNavigationElement();

    // Kumpulkan area pencarian potensial
    const searchRoots = [];
    if (coll) searchRoots.push(coll);
    if (header && header.parentElement) searchRoots.push(header.parentElement);
    if (sidebar && sidebar !== document.body) searchRoots.push(sidebar);

    const candidates = [];
    for (const root of searchRoots) {
      const els = Array.from(root.querySelectorAll('.tw\\:cursor-pointer, [role="button"], button, a, div[title]'));
      for (const e of els) {
        if (!candidates.includes(e)) candidates.push(e);
      }
    }

    const items = [];
    for (const c of candidates) {
      const title = c.getAttribute('title') || c.querySelector('[title]')?.getAttribute('title') || '';
      const text = (c.textContent || '').trim();
      const norm = normalizeFasihText(`${title} ${text}`);

      // Abaikan header menu utama
      if (
        norm.includes('keterangan usaha/perusahaan') ||
        norm.includes('keterangan usaha') ||
        norm.includes('blok i') ||
        norm.includes('blok ii') ||
        norm.includes('blok iii') ||
        norm.includes('blok iv') ||
        norm.includes('catatan') ||
        norm.includes('ringkasan') ||
        norm.includes('submit') ||
        norm.includes('kirim')
      ) {
        continue;
      }

      // Pastikan memiliki teks / title nama usaha dengan panjang memadai
      if ((title && title.length >= 3) || (text && text.length >= 3)) {
        const itemEl = c.classList?.contains('tw:cursor-pointer') ? c : (c.closest('.tw\\:cursor-pointer, [role="button"]') || c);
        if (!items.includes(itemEl)) {
          items.push(itemEl);
        }
      }
    }

    // Buang elemen yang membungkus item lain, dan item dengan nama sama
    const nested = items.filter(it => !items.some(o => o !== it && it.contains(o)));
    const seen = new Set();
    return nested.filter(it => {
      const key = normUsaha(it.getAttribute('title') || it.textContent || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Normalisasi nama unit usaha untuk pencocokan dengan kolom nama_usaha Excel
  function normUsaha(str) {
    return String(str || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  function stripLeadingNumber(str) {
    return String(str || '').replace(/^\d+[\s\.\-]+/, '').trim();
  }

  function usahaLabel(el) {
    if (!el) return '';
    return (
      el.getAttribute('title') ||
      el.querySelector?.('[title]')?.getAttribute('title') ||
      el.getAttribute('aria-label') ||
      (el.textContent || '').trim().split('\n')[0]
    ).trim();
  }

  // Hitung skor kemiripan antara target (dari Excel) dengan label unit usaha di FASIH
  function scoreUsahaMatch(target, candidate) {
    if (!target || !candidate) return 0;
    const nt = normUsaha(target);
    const nc = normUsaha(candidate);
    if (!nt || !nc) return 0;
    if (nt === nc) return 1.0;

    const st = stripLeadingNumber(nt);
    const sc = stripLeadingNumber(nc);
    if (st && sc && (st === sc || st === nc || nt === sc)) return 0.98;

    // Cek nama unik di dalam kurung, misal "(BAHARUDDIN)" atau "(HASAN IBRAHIM)"
    const mParen = String(target).match(/\(([^)]+)\)/);
    if (mParen && mParen[1]) {
      const distName = normUsaha(mParen[1]);
      if (distName.length >= 3 && nc.includes(distName)) {
        return 0.95;
      }
    }

    // Cek substring
    if (sc.length >= 4 && (st.includes(sc) || sc.includes(st))) return 0.9;
    if (nc.length >= 4 && (nt.includes(nc) || nc.includes(nt))) return 0.85;

    // Cek token kata
    const tokT = nt.split(/\s+/).filter(w => w.length >= 3);
    const tokC = nc.split(/\s+/).filter(w => w.length >= 3);
    if (tokT.length && tokC.length) {
      const common = tokT.filter(w => tokC.includes(w));
      if (common.length >= 2) {
        return common.length / Math.max(tokT.length, tokC.length);
      }
    }
    return 0;
  }

  // Pilih unit usaha sesuai nama_usaha: cocok persis lebih diutamakan, lalu yang paling mirip
  function filterBusinessItemsByName(items, target) {
    if (!items || !items.length) return [];
    if (!target) return items;
    const scored = items.map(el => {
      const lbl = usahaLabel(el);
      return { el, label: lbl, score: scoreUsahaMatch(target, lbl) };
    });
    scored.sort((a, b) => b.score - a.score);
    const matches = scored.filter(s => s.score >= 0.5);
    if (matches.length) return matches.map(m => m.el);
    return [];
  }

  // Cari elemen unit usaha langsung di sidebar berdasarkan targetUsaha
  function findBusinessItemByTargetName(target) {
    if (!target) return null;
    const all = getBusinessItems();
    const matched = filterBusinessItemsByName(all, target);
    if (matched && matched.length) return matched[0];

    // Fallback: telusuri seluruh elemen di sidebar
    const sidebar = getSidebarNavigationElement();
    const els = Array.from(sidebar.querySelectorAll('.tw\\:cursor-pointer, [role="button"], button, a, div[title]'));
    let bestEl = null;
    let bestScore = 0;
    for (const el of els) {
      const lbl = usahaLabel(el);
      if (!lbl || lbl.toLowerCase().includes('keterangan usaha') || lbl.toLowerCase().includes('blok ')) continue;
      const score = scoreUsahaMatch(target, lbl);
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestEl = el;
      }
    }
    return bestEl;
  }

  // 6a. Deteksi apakah kuisioner adalah SE2026 - UB / sensus_UB
  function isUBQuestionnaire() {
    // 1. PRIORITAS UTAMA: Cek tag <h1>, <h2>, <h3>, <h4> langsung dari header dokumen
    // Sesuai HTML FASIH: <h1>SE2026 - UB</h1> dan <h2> SE2026 (UB)</h2>
    const hList = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
    for (const h of hList) {
      const text = (h.textContent || '').trim().toUpperCase();
      if (
        text.includes('SE2026 - UB') ||
        text.includes('SE2026-UB') ||
        text.includes('SE2026 (UB)') ||
        /\bSE2026\s*[-_]?\s*\(?UB\)?\b/i.test(text) ||
        /\bSENSUS\s*[-_]?\s*\(?UB\)?\b/i.test(text)
      ) {
        return true;
      }
    }

    // 2. Cek elemen judul lainnya (tracking-tight, font-semibold, header, nav)
    const titleElements = Array.from(document.querySelectorAll('[class*="tracking-tight"], [class*="font-semibold"], [class*="font-bold"], nav, header, [data-id]'));
    for (const el of titleElements) {
      const text = (el.textContent || '').trim().toUpperCase();
      if (
        text.includes('SE2026 - UB') ||
        text.includes('SE2026-UB') ||
        text.includes('SE2026 (UB)') ||
        /\bSE2026\s*[-_]?\s*\(?UB\)?\b/i.test(text) ||
        /\bSENSUS\s*[-_]?\s*\(?UB\)?\b/i.test(text)
      ) {
        return true;
      }
    }

    // 3. Cek document.title secara ketat
    if (document.title && /\b(?:SE2026|SENSUS)\s*[-_]?\s*\(?UB\)?\b/i.test(document.title)) {
      return true;
    }

    // 4. Cek breadcrumb navigasi
    const breadcrumb = document.querySelector('nav, [aria-label*="breadcrumb"], .breadcrumb');
    if (breadcrumb && /\bUB\b/i.test(breadcrumb.textContent)) {
      return true;
    }

    // 5. Cek apakah ada menu BLOK I di sidebar tanpa adanya BLOK II
    if (findBlockIButton() && !findBlockIIButton()) {
      return true;
    }

    return false;
  }

  // Helper normalisasi teks DOM FASIH: menghapus spasi berlebih, tanda baca, slash, dan bintang
  function normalizeFasihText(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[\/\\]/g, ' ')
      .replace(/[*\-_:;,()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Helper mengambil baris container pertanyaan (row) yang terisolasi
  // Sesuai DOM FASIH:
  // <div class="tw:flex tw:gap-2 tw:rounded-lg tw:py-2 tw:@lg/form:flex-row tw:flex-col">
  function getQuestionRowFromElement(el) {
    if (!el) return null;
    if (el.classList && el.classList.contains('tw:rounded-lg') && el.classList.contains('tw:py-2')) {
      return el;
    }
    const row = el.closest('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"], [class*="rounded-lg"]') ||
                el.closest('div[class*="@lg/form:w-1/3"]')?.parentElement ||
                el.closest('div[class*="@lg/form:flex-row"]');
    if (row && row !== document.body && row !== document.documentElement) {
      return row;
    }
    return null;
  }

  // Helper pencarian elemen pertanyaan secara PRESISI DAN TERISOLASI
  // Kriteria wajib:
  // - Harus ada nomor pertanyaan yang cocok (kecuali allowNumberOmission = true)
  // - Harus ada huruf rincian yang cocok ('a' atau 'b')
  // - Harus mengandung kata kunci dari mustInclude
  // - DIJAMIN TIDAK MENGANDUNG rincian lain atau mustExclude
  // - Baris pertanyaan (row) harus valid
  function findQuestionElementByCriteria({ number, letter, mustInclude = [], mustExclude = [], allowNumberOmission = false }) {
    const numStr = String(number);
    const letStr = String(letter).toLowerCase();

    // Helper validasi kecocokan teks
    const matchesCriteria = (text) => {
      if (!text || text.length > 300) return false;
      const norm = normalizeFasihText(text);

      // 1. Cek kata terlarang (mustExclude)
      for (const ex of mustExclude) {
        if (norm.includes(normalizeFasihText(ex))) return false;
      }

      // 2. Cek kata kunci wajib (mustInclude)
      let hasKeyword = false;
      for (const inc of mustInclude) {
        if (norm.includes(normalizeFasihText(inc))) {
          hasKeyword = true;
          break;
        }
      }
      if (!hasKeyword) return false;

      // 3. Cek nomor pertanyaan (harus ada, kecuali allowNumberOmission = true)
      const hasNumber = norm.includes(numStr) || new RegExp(`\\b${numStr}\\b`).test(norm);
      if (!hasNumber && !allowNumberOmission) {
        return false;
      }

      // Pastikan jika ada nomor selain numStr yang berpasangan dengan rincian (misal '13. a' saat mencari '23. a'), tolak!
      const otherNumberMatch = norm.match(/\b(\d+)\s*[\.\s]\s*[a-z]\b/);
      if (otherNumberMatch && otherNumberMatch[1] !== numStr) {
        return false;
      }
      const leadingNumberMatch = norm.match(/^(\d+)[\.\s]/);
      if (leadingNumberMatch && leadingNumberMatch[1] !== numStr) {
        return false;
      }

      // 4. Cek huruf rincian ('a' atau 'b')
      // Harus cocok sebagai rincian: '27 a', '27. a', atau ' a ' / berawalan 'a '
      const numLetterPattern = new RegExp(`\\b${numStr}\\s*${letStr}\\b`);
      const letterPattern = new RegExp(`(^|\\s|\\.)${letStr}(\\s|\\.|$)`);
      if (!numLetterPattern.test(norm) && !letterPattern.test(norm)) {
        return false;
      }

      // 5. Pastikan TIDAK ADA rincian huruf lain yang salah
      // Misal jika mencari 'a', tidak boleh ada '27 b', '27 c', ' rincian b', ' rincian c'
      if (letStr === 'a') {
        if (norm.includes(`${numStr} b`) || norm.includes(`${numStr} c`)) return false;
        if (norm.includes(' b.') || norm.includes(' c.') || norm.startsWith('b ') || norm.startsWith('c ') || norm.startsWith('b.') || norm.startsWith('c.')) return false;
      } else if (letStr === 'b') {
        if (norm.includes(`${numStr} a`) || norm.includes(`${numStr} c`)) return false;
        if (norm.includes(' a.') || norm.includes(' c.') || norm.startsWith('a ') || norm.startsWith('c ') || norm.startsWith('a.') || norm.startsWith('c.')) return false;
      }

      return true;
    };

    // TINGKAT 1: Cek dari atribut data-id
    const dataIdElements = Array.from(document.querySelectorAll('[data-id]'));
    for (const el of dataIdElements) {
      const dataId = el.getAttribute('data-id') || '';
      if (matchesCriteria(dataId) || matchesCriteria(el.textContent)) {
        const row = getQuestionRowFromElement(el);
        if (row) return el;
      }
    }

    // TINGKAT 2: Cek dari elemen judul pertanyaan (.tw:font-semibold atau space-x-2)
    const titleElements = Array.from(document.querySelectorAll('.tw\\:font-semibold, [class*="font-semibold"], div.tw\\:space-x-2 > div, .numbering-3, .numbering, [class*="numbering"]'));
    for (const el of titleElements) {
      if (matchesCriteria(el.textContent)) {
        const row = getQuestionRowFromElement(el);
        if (row) return el;
      }
    }

    // TINGKAT 3: Cek dari baris formulir (row) langsung
    const rows = Array.from(document.querySelectorAll('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"]'));
    for (const row of rows) {
      const labelCol = row.querySelector('div[class*="@lg/form:w-1/3"], .tw\\:font-semibold, [class*="font-semibold"]');
      const textToTest = labelCol ? labelCol.textContent : row.textContent;
      if (matchesCriteria(textToTest)) {
        return labelCol || row;
      }
    }

    return null;
  }

  // 6b. Temukan pertanyaan "23. a. Nilai penjualan / produksi barang dan jasa*" (untuk SE2026 - UB)
  function findQuestion23aElement() {
    // 1. CARI PRESISI BERDASARKAN ATRIBUT FASIH & SPAN DATA-ID:
    // Sesuai DOM FASIH SE2026-UB: <span data-id="a. Nilai ">a. Nilai </span>penjualan<span data-id=" barang dan jasa">
    const spanA = document.querySelector('span[data-id="a. Nilai "], span[data-id="a. Nilai"], [data-id*="a. Nilai"]');
    if (spanA) {
      const row = getQuestionRowFromElement(spanA);
      if (row) {
        const text = (row.textContent || '').toLowerCase();
        if ((text.includes('penjualan') || text.includes('produksi') || text.includes('pendapatan')) &&
            text.includes('barang dan jasa') &&
            !text.includes('13.') && !text.startsWith('13')) {
          return spanA.closest('div[class*="@lg/form:w-1/3"]') || row;
        }
      }
    }

    // 2. Fallback pencarian kriteria
    return findQuestionElementByCriteria({
      number: '23',
      letter: 'a',
      allowNumberOmission: true, // Di DOM SE2026-UB nomor 23 tidak dicantumkan di baris (hanya "a. Nilai penjualan barang dan jasa*")
      mustInclude: ['nilai penjualan', 'penjualan barang', 'nilai produksi', 'produksi barang', 'nilai pendapatan'],
      mustExclude: [
        '13', '13.', '13. a', '13 a', '13a',
        'jenis barang', 'pendapatan lainnya', 'biaya produksi',
        '23 b', '23. b', '23 c', '23. c', 'b pendapatan', 'rincian c', 'rincian b'
      ]
    });
  }

  // 6bb. Temukan pertanyaan "23. b. Pendapatan lainnya yang dihasilkan perusahaan" (untuk SE2026 - UB)
  function findQuestionUB23bElement() {
    // 1. CARI PRESISI BERDASARKAN ATRIBUT FASIH & SPAN DATA-ID:
    // Sesuai DOM FASIH SE2026-UB: <span data-id="b. Pendapatan lainnya yang dihasilkan perusahaan">
    const spanB = document.querySelector('span[data-id="b. Pendapatan lainnya yang dihasilkan perusahaan"], [data-id*="b. Pendapatan lainnya"]');
    if (spanB) {
      const row = getQuestionRowFromElement(spanB);
      if (row) {
        return spanB.closest('div[class*="@lg/form:w-1/3"]') || row;
      }
    }

    // 2. Fallback pencarian kriteria
    return findQuestionElementByCriteria({
      number: '23',
      letter: 'b',
      allowNumberOmission: true, // Di DOM SE2026-UB hanya tertulis "b. Pendapatan lainnya yang dihasilkan perusahaan*"
      mustInclude: ['pendapatan lainnya'],
      mustExclude: [
        '13', '13.', '13. b', '13 b', '13b',
        'nilai produksi', 'penjualan barang', 'biaya produksi',
        '23 a', '23. a', '23 c', '23. c', 'a nilai', 'rincian c', 'rincian a'
      ]
    });
  }

  // 6c. Baca Tahun Beroperasi Komersial dari pertanyaan 25
  function getQuestion25Year() {
    const candidates = Array.from(document.querySelectorAll('div, label, span, p, h3, h4, h5'));
    let q25El = null;

    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      if (
        text.includes('25.') &&
        (text.includes('beroperasi secara komersial') || text.includes('mulai beroperasi') || text.includes('Tahun beroperasi komersial'))
      ) {
        if (text.length < 350) {
          q25El = el;
          break;
        }
      }
    }

    if (!q25El) {
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (text.includes('beroperasi secara komersial') && text.length < 200) {
          q25El = el;
          break;
        }
      }
    }

    if (q25El) {
      // 1. Cari input di dalam container pertanyaan 25
      let container = q25El;
      for (let depth = 0; depth < 5; depth++) {
        if (!container || container === document.body) break;
        const inputs = Array.from(container.querySelectorAll('input'));
        for (const input of inputs) {
          const val = (input.value || input.getAttribute('value') || '').trim();
          if (val) {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num >= 1800 && num <= 2100) {
              return num;
            }
          }
        }
        container = container.parentElement;
      }

      // 2. Fallback: Cari input terdekat berikutnya di DOM
      const allInputs = Array.from(document.querySelectorAll('input'));
      const qRect = q25El.getBoundingClientRect();
      const nearbyInputs = allInputs.filter(inp => {
        const rect = inp.getBoundingClientRect();
        return rect.top >= qRect.top - 20 && rect.top <= qRect.bottom + 250;
      });
      for (const inp of nearbyInputs) {
        const val = (inp.value || inp.getAttribute('value') || '').trim();
        if (val) {
          const num = parseInt(val, 10);
          if (!isNaN(num) && num >= 1800 && num <= 2100) {
            return num;
          }
        }
      }

      // 3. Fallback: Cek jika tahun ditampilkan sebagai teks (bukan input)
      if (q25El.parentElement) {
        const parentText = q25El.parentElement.textContent || '';
        // Bersihkan teks contoh seperti "Contoh: 1990; 2025;dsb." agar tidak salah terbaca
        const cleaned = parentText.replace(/contoh\s*:\s*1990[\s;]*2025[^.]*/gi, '');
        const matches = cleaned.match(/\b(19\d{2}|20\d{2})\b/g);
        if (matches && matches.length > 0) {
          const lastNum = parseInt(matches[matches.length - 1], 10);
          if (!isNaN(lastNum) && lastNum >= 1800 && lastNum <= 2100) {
            return lastNum;
          }
        }
      }
    }

    return null;
  }

  // 6d. Temukan pertanyaan "27. a. Nilai produksi/pendapatan/penjualan barang dan jasa"
  function findQuestion27aElement() {
    return findQuestionElementByCriteria({
      number: '27',
      letter: 'a',
      mustInclude: ['nilai produksi', 'penjualan barang', 'pendapatan penjualan', 'nilai pendapatan'],
      mustExclude: ['pendapatan lainnya', 'biaya produksi', '27 b', '27. b', '27 c', '27. c', 'b pendapatan', 'rincian c', 'rincian b']
    });
  }

  // 6dd. Temukan pertanyaan "27. b. Pendapatan lainnya yang dihasilkan perusahaan"
  function findQuestion27bElement() {
    return findQuestionElementByCriteria({
      number: '27',
      letter: 'b',
      mustInclude: ['pendapatan lainnya'],
      mustExclude: ['nilai produksi', 'penjualan barang', 'biaya produksi', '27 a', '27. a', '27 c', '27. c', 'a nilai', 'rincian c', 'rincian a']
    });
  }

  // 6e. Temukan pertanyaan "31. a. Nilai penjualan barang dan jasa*" (Tahun op > 2025)
  function findQuestion31aElement() {
    // 1. CARI PRESISI BERDASARKAN ID CONTAINER RESMI FASIH:
    // Sesuai DOM FASIH: <div id="nilai_pendapatan_bln#2001">
    const container31a = document.querySelector('[id^="nilai_pendapatan_bln"], [id*="nilai_pendapatan_bln"]');
    if (container31a) {
      const row = container31a.querySelector('.tw\\:rounded-lg, [class*="rounded-lg"]') || container31a;
      return row.querySelector('div[class*="@lg/form:w-1/3"], .tw\\:font-semibold') || row;
    }

    // 2. Fallback pencarian kriteria
    return findQuestionElementByCriteria({
      number: '31',
      letter: 'a',
      allowNumberOmission: false,
      mustInclude: ['nilai penjualan', 'penjualan barang', 'nilai pendapatan', 'pendapatan barang'],
      mustExclude: [
        '13', '13.', '23', '23.', '27', '27.', '30', '30.',
        'pendapatan lainnya', 'biaya produksi', '31 b', '31. b', '31 c', '31. c', '30 b', 'b pendapatan', 'rincian c', 'rincian b'
      ]
    });
  }

  // 6ee. Temukan pertanyaan "30. b. Biaya produksi *" (Tahun op > 2025)
  function findQuestion30bElement() {
    return findQuestionElementByCriteria({
      number: '30',
      letter: 'b',
      mustInclude: ['biaya produksi'],
      mustExclude: ['nilai pendapatan', 'pendapatan lainnya', '30 a', '30. a', '30 c', '30. c', '31 a', '31 b', 'a biaya', 'rincian c', 'rincian a']
    });
  }

  // 6eee. Temukan pertanyaan "31. b. Pendapatan lainnya yang dihasilkan" (Tahun op > 2025)
  function findQuestion31bElement() {
    // 1. CARI PRESISI BERDASARKAN ID CONTAINER RESMI FASIH:
    // Sesuai DOM FASIH: <div id="pendapatan_lain_bln#2001">
    const container31b = document.querySelector('[id^="pendapatan_lain_bln"], [id*="pendapatan_lain_bln"]');
    if (container31b) {
      const row = container31b.querySelector('.tw\\:rounded-lg, [class*="rounded-lg"]') || container31b;
      return row.querySelector('div[class*="@lg/form:w-1/3"], .tw\\:font-semibold') || row;
    }

    // 2. Fallback pencarian kriteria
    return findQuestionElementByCriteria({
      number: '31',
      letter: 'b',
      allowNumberOmission: false,
      mustInclude: ['pendapatan lainnya'],
      mustExclude: [
        '13', '13.', '23', '23.', '27', '27.', '30', '30.',
        'nilai pendapatan', 'nilai penjualan', 'biaya produksi', '31 a', '31. a', '31 c', '31. c', '30 b', 'a nilai', 'rincian c', 'rincian a'
      ]
    });
  }

  // 6f. Menentukan target pertanyaan yang harus diberi catatan berdasarkan kondisi kuisioner dan tahun operasi
  function getTargetQuestionInfo() {
    // KONDISI 1: Kuisioner SE2026 - UB -> Target 23.a
    if (isUBQuestionnaire()) {
      const q23a = findQuestion23aElement();
      return {
        element: q23a,
        code: '23.a',
        label: '23. a. Nilai produksi barang dan jasa (SE2026 - UB)',
        condition: 'SE2026_UB'
      };
    }

    // KONDISI 2: Selain SE2026 - UB -> Periksa Tahun Beroperasi Komersial (Pertanyaan 25)
    const opYear = getQuestion25Year();

    if (opYear !== null) {
      if (opYear <= 2025) {
        const q27a = findQuestion27aElement();
        return {
          element: q27a,
          code: '27.a',
          label: `27. a. Nilai produksi/pendapatan/penjualan barang dan jasa (Tahun op: ${opYear} <= 2025)`,
          condition: `YEAR_${opYear}<=2025`
        };
      } else {
        const q31a = findQuestion31aElement();
        return {
          element: q31a,
          code: '31.a',
          label: `31. a. Nilai penjualan barang dan jasa (Tahun op: ${opYear} > 2025)`,
          condition: `YEAR_${opYear}>2025`
        };
      }
    }

    // KONDISI 3: Fallback jika Tahun Beroperasi tidak dapat dibaca dari DOM
    // Cek langsung ketersediaan 27.a vs 31.a pada formulir yang tampil
    const q27a = findQuestion27aElement();
    if (q27a) {
      return {
        element: q27a,
        code: '27.a',
        label: '27. a. Nilai produksi/pendapatan/penjualan barang dan jasa (Fallback deteksi form)',
        condition: 'FALLBACK_27A'
      };
    }

    const q31a = findQuestion31aElement();
    if (q31a) {
      return {
        element: q31a,
        code: '31.a',
        label: '31. a. Nilai pendapatan barang dan jasa (Fallback deteksi form)',
        condition: 'FALLBACK_31A'
      };
    }

    return {
      element: null,
      code: 'unknown',
      label: 'Pertanyaan Target Catatan',
      condition: 'UNKNOWN'
    };
  }

  // Helper mendapatkan elemen yang bisa discroll di halaman FASIH
  function getScrollableContainer() {
    const mainEl = document.querySelector('main, [role="main"], div[class*="overflow-y-auto"]');
    if (mainEl && mainEl.scrollHeight > mainEl.clientHeight + 50) {
      return mainEl;
    }
    return window;
  }

  function smoothScrollBy(yDelta) {
    const container = getScrollableContainer();
    if (container === window) {
      window.scrollBy({ top: yDelta, behavior: 'smooth' });
    } else {
      container.scrollBy({ top: yDelta, behavior: 'smooth' });
    }
  }

  function smoothScrollToTop() {
    const container = getScrollableContainer();
    if (container === window) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Pindai viewport dan DOM secara dinamis agar pertanyaan target (terutama 'a') tidak terlewat
  async function findTargetQuestionWithDynamicScroll(finder, targetCode = '', maxScanSteps = 10) {
    // 1. Cek langsung pada viewport saat ini
    let el = finder();
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      return el;
    }

    console.log(`[TUNTAS] Pertanyaan ${targetCode} belum terlihat di viewport, memulai dynamic scan scroll...`);

    // 2. Scan bertahap ke bawah (400px per langkah)
    for (let step = 0; step < maxScanSteps; step++) {
      smoothScrollBy(420);
      await randomSleep(200, 350);
      el = finder();
      if (el) {
        console.log(`[TUNTAS] Pertanyaan ${targetCode} ditemukan pada langkah scroll ${step + 1}!`);
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        await randomSleep(250, 400);
        return el;
      }
    }

    // 3. Scan kembali dari atas jika belum ditemukan
    smoothScrollToTop();
    await randomSleep(350, 500);
    el = finder();
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      return el;
    }

    for (let step = 0; step < 5; step++) {
      smoothScrollBy(600);
      await randomSleep(200, 300);
      el = finder();
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        return el;
      }
    }

    return null;
  }

  // 6g. Menentukan seluruh daftar pertanyaan target catatan (hanya catatan utama)
  function getTargetQuestionsList(options = {}) {
    const list = [];
    // Menu #DC_0: satu catatan (default #DC_0). Target: nilai produksi (alur v8) atau 13.g Kode KBLI.
    const mainCommentUB = options.commentText || '#DC_00';
    const mainCommentNonUB = options.commentText || '#DC_00';

    if (options.dc0Target === 'kbli') {
      if (isUBQuestionnaire()) return list; // 13.g Kode KBLI hanya ada di kuesioner non-UB
      list.push({
        code: '13.g',
        label: '13. g. Kode KBLI',
        finder: findQuestion13gKbliElement,
        effectiveComment: mainCommentNonUB,
        isSecondary: false,
        exactCodeOnly: true,
        condition: 'DC0_KBLI'
      });
      return list;
    }

    // KONDISI 1: Kuisioner SE2026 - UB
    if (isUBQuestionnaire()) {
      // 1. Pertanyaan 23.a: Nilai produksi barang dan jasa* (default #DC_00)
      list.push({
        code: '23.a',
        label: '23. a. Nilai produksi barang dan jasa* (SE2026 - UB)',
        finder: findQuestion23aElement,
        effectiveComment: mainCommentUB,
        isSecondary: false,
        exactCodeOnly: true,
        condition: 'SE2026_UB'
      });

      return list;
    }

    // KONDISI 2: Selain SE2026 - UB -> Periksa Tahun Beroperasi Komersial (Pertanyaan 25)
    const opYear = getQuestion25Year();

    if (opYear !== null) {
      if (opYear <= 2025) {
        // Tahun Operasi <= 2025:
        // 1. Pertanyaan 27.a: Nilai produksi/pendapatan/penjualan barang dan jasa (default #DC_00)
        list.push({
          code: '27.a',
          label: `27. a. Nilai produksi/pendapatan/penjualan barang dan jasa (Tahun op: ${opYear} <= 2025)`,
          finder: findQuestion27aElement,
          effectiveComment: mainCommentNonUB,
          isSecondary: false,
          exactCodeOnly: true,
          condition: `YEAR_${opYear}<=2025`
        });
        return list;
      } else {
        // Tahun Operasi > 2025:
        // HANYA pertanyaan 31.a
        // 1. Pertanyaan 31.a: Nilai penjualan barang dan jasa* (default #DC_00)
        list.push({
          code: '31.a',
          label: `31. a. Nilai penjualan barang dan jasa* (Tahun op: ${opYear} > 2025)`,
          finder: findQuestion31aElement,
          effectiveComment: mainCommentNonUB,
          isSecondary: false,
          exactCodeOnly: true,
          condition: `YEAR_${opYear}>2025`
        });
        return list;
      }
    }

    // KONDISI 3: Fallback jika Tahun Beroperasi tidak dapat dibaca dari DOM
    // Cek keberadaan 31.a atau kontainer nilai_pendapatan_bln / pendapatan_lain_bln (menandakan formulir tahun > 2025)
    const q31a = findQuestion31aElement();
    if (q31a || document.querySelector('[id^="nilai_pendapatan_bln"], [id^="pendapatan_lain_bln"]')) {
      list.push({
        code: '31.a',
        label: '31. a. Nilai penjualan barang dan jasa* (Deteksi form >2025)',
        finder: findQuestion31aElement,
        effectiveComment: mainCommentNonUB,
        isSecondary: false,
        exactCodeOnly: true,
        condition: 'FORM_DETECT_31A'
      });
      return list;
    }

    // Default fallback: 27.a
    list.push({
      code: '27.a',
      label: '27. a. Nilai produksi/pendapatan/penjualan barang dan jasa (Default fallback)',
      finder: findQuestion27aElement,
      effectiveComment: mainCommentNonUB,
      isSecondary: false,
      exactCodeOnly: true,
      condition: 'DEFAULT_FALLBACK'
    });
    return list;
  }

  function findTargetQuestionElement() {
    const info = getTargetQuestionInfo();
    return info.element;
  }

  // 7. Temukan tombol catatan untuk pertanyaan target secara presisi
  // DIJAMIN ISOLASI MUTLAK: HANYA MENCARI DI DALAM BARIS (ROW) PERTANYAAN TARGET
  // TIDAK AKAN PERNAH KELUAR DARI BARIS FORMULIR ATAU MENYENTUH PERTANYAAN LAIN!
  function findCommentButtonForQuestion(questionEl, targetCode = '') {
    if (!questionEl) return null;

    const prepareButton = (btn) => {
      if (!btn) return null;
      if (btn.classList.contains('tw:hidden')) {
        btn.classList.remove('tw:hidden');
        btn.classList.add('tw:flex');
      }
      return btn;
    };

    const isCommentBtn = (b) => {
      if (!b || b.tagName !== 'BUTTON') return false;
      const title = (b.getAttribute('title') || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (title.includes('catatan') || aria.includes('catatan')) return true;
      const svg = b.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path[d*="M18 4a3 3 0 0 1 3 3v8"], path[d*="M8 9h8"], path[d*="M3 20l1.3 -3.9"], path[d*="M12 20"], path[d*="M21 15"], path[d*="M7.9 20"]');
        if (path) return true;
      }
      return false;
    };

    // Cari baris pembungkus pertanyaan (row) yang terisolasi
    const row = getQuestionRowFromElement(questionEl);
    if (!row) {
      console.warn(`[FASIH] Baris pertanyaan untuk ${targetCode} tidak terisolasi.`);
      return null;
    }

    // ISOLASI LEVEL 1: Cari tombol di kolom input (@lg/form:flex-1!) terlebih dahulu
    // Di desktop FASIH, tombol Catatan aktif terletak di samping input field di kolom kanan
    const inputCol = row.querySelector('div[class*="@lg/form:flex-1"], div.tw\\:space-y-2');
    if (inputCol) {
      const inputBtns = Array.from(inputCol.querySelectorAll('button')).filter(isCommentBtn);
      const visibleInputBtn = inputBtns.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (visibleInputBtn) return prepareButton(visibleInputBtn);
      const desktopInputBtn = inputBtns.find(b => b.className.includes('@lg/form:flex'));
      if (desktopInputBtn) return prepareButton(desktopInputBtn);
      if (inputBtns.length > 0) return prepareButton(inputBtns[0]);
    }

    // ISOLASI LEVEL 2: Cari seluruh tombol di dalam baris (row) ini
    const rowBtns = Array.from(row.querySelectorAll('button')).filter(isCommentBtn);
    if (rowBtns.length > 0) {
      // Prioritaskan tombol visible
      const visibleBtn = rowBtns.find(b => b.offsetWidth > 0 && b.offsetHeight > 0);
      if (visibleBtn) return prepareButton(visibleBtn);

      // Prioritaskan tombol desktop
      const desktopBtn = rowBtns.find(b => b.className.includes('@lg/form:flex'));
      if (desktopBtn) return prepareButton(desktopBtn);

      return prepareButton(rowBtns[0]);
    }

    // PERINGATAN: JANGAN PERNAH mencari di luar 'row'!
    // Jika tidak ada tombol di dalam baris ini, kembalikan null untuk mencegah
    // menyentuh tombol dari pertanyaan lain (misal Provinsi)!
    console.warn(`[FASIH] Tidak ada tombol catatan di dalam baris pertanyaan ${targetCode}`);
    return null;
  }

  // 8. Temukan textarea modal catatan
  function findCommentModalTextarea() {
    const specificSelectors = 'textarea[placeholder*="catatan" i], textarea[placeholder*="Tambah catatan" i], textarea#textfield-cl-290-textarea';
    const candidates = Array.from(document.querySelectorAll(specificSelectors));
    for (const ta of candidates) {
      if (ta.offsetParent !== null) return ta;
    }

    // Cari textarea di dalam dialog / modal catatan yang sedang terbuka (hindari textarea form kuesioner)
    const modals = Array.from(document.querySelectorAll('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal], [data-state="open"]'));
    for (const modal of modals) {
      if (modal.id === 'fasih-custom-confirm-panel' || modal.closest('#fasih-custom-confirm-panel')) continue;
      if (modal.offsetParent === null && getComputedStyle(modal).position !== 'fixed') continue;
      const ta = modal.querySelector('textarea');
      if (ta && ta.offsetParent !== null) return ta;
    }
    return null;
  }

  // 9. Temukan tombol submit di dalam modal catatan
  function findSubmitCommentButton(textarea) {
    const modal = textarea ? (textarea.closest('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal], [data-state="open"]') || textarea.parentElement?.parentElement) : document;
    if (!modal) return null;

    // Cari button di sebelah textarea (biasanya icon send atau tombol simpan/kirim)
    const buttons = Array.from(modal.querySelectorAll('button'));
    for (const b of buttons) {
      const text = (b.textContent || '').trim().toLowerCase();
      const title = (b.getAttribute('title') || b.getAttribute('aria-label') || '').toLowerCase();
      
      if (text.includes('kirim') || text.includes('simpan') || title.includes('kirim') || title.includes('simpan')) {
        return b;
      }

      // Icon send / plane: M10 14l11 -11 atau semisalnya
      const svg = b.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path[d*="M10 14l11 -11"], path[d*="21 3l-6.5 18"]');
        if (path) return b;
      }
    }

    // Jika ada tombol di samping textarea langsung
    if (textarea && textarea.parentElement) {
      const siblingBtn = textarea.parentElement.querySelector('button');
      if (siblingBtn) return siblingBtn;
    }

    return null;
  }

  // 9a. Tutup modal catatan jika sudah ada isinya atau batal
  async function closeCommentModal(textarea, modalDialog) {
    const modal = modalDialog || (textarea ? (textarea.closest('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal], [data-state="open"]') || textarea.parentElement?.parentElement) : null) || document.querySelector('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal]');
    if (!modal) return;

    // 1. Cari tombol Dismiss / Close (X) bawaan Kobalte di pojok modal
    const dismissBtn = modal.querySelector('button[aria-label="Dismiss"], button[aria-label="Close"], button[aria-label="Tutup"], button[data-kb-dialog-close-button], button:has(svg path[d*="M18 6l-12 12"])');
    if (dismissBtn) {
      await humanClick(dismissBtn);
      await randomSleep(350, 500);
      return;
    }

    // 2. Cari tombol Batal / Tutup di dalam modal
    const allBtns = Array.from(modal.querySelectorAll('button'));
    for (const b of allBtns) {
      const text = (b.textContent || '').trim().toLowerCase();
      if (text === 'batal' || text === 'tutup' || text === 'kembali') {
        await humanClick(b);
        await randomSleep(350, 500);
        return;
      }
    }

    // 3. Cari tombol dengan icon X atau SVG silang
    for (const b of allBtns) {
      const svg = b.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path[d*="M18 6l-12 12"], path[d*="M6 18L18 6"], path[d*="M6 6l12 12"], path[d*="18 6L6 18"]');
        if (path) {
          await humanClick(b);
          await randomSleep(350, 500);
          return;
        }
      }
    }

    // 4. Klik backdrop overlay jika ada
    const overlay = document.querySelector('[data-kb-dialog-overlay], div.fixed.inset-0, div.tw\\:fixed.tw\\:inset-0, [data-state="open"][data-kb-overlay]');
    if (overlay) {
      await humanClick(overlay);
      await randomSleep(350, 500);
      return;
    }

    // 5. Fallback: Dispatch Escape key
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    await randomSleep(350, 500);
  }

  // 9a-2. Memastikan modal catatan benar-benar tertutup sebelum melanjutkan
  async function ensureCommentModalClosed() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const openTa = findCommentModalTextarea();
      const openModal = Array.from(document.querySelectorAll('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal]'))
        .find(d => d.id !== 'fasih-custom-confirm-panel' && !d.closest('#fasih-custom-confirm-panel') && (d.offsetParent !== null || getComputedStyle(d).position === 'fixed'));
      if (!openModal && !openTa) {
        return true;
      }
      await closeCommentModal(openTa, openModal);
      await randomSleep(250, 450);
    }
    return true;
  }

  // 9b. Cek apakah switch adalah switch "Tampilkan Anomali Usaha dan Keluarga"
  function isTampilkanAnomaliSwitch(switchControl) {
    if (!switchControl) return false;
    const row = switchControl.closest('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"], [class*="rounded-lg"]');
    if (row) {
      const labelEl = row.querySelector('div[class*="@lg/form:w-1/3"], .tw\\:font-semibold, label, [class*="font-semibold"]');
      const text = (labelEl?.textContent || row.textContent || '').toLowerCase();
      if (text.includes('admin')) return false; // Pasti BUKAN jika ada kata admin!
      return text.includes('tampilkan anomali') || (text.includes('anomali') && text.includes('usaha'));
    }
    return false;
  }

  // 9b-1. Deteksi presisi apakah "Tampilkan Anomali Usaha dan Keluarga" sudah AKTIF (ON / sudah) atau BELUM (OFF / belum)
  function isTampilkanAnomaliActive(switchControl, switchInfo = {}) {
    // 0A. CEK LANGSUNG CONTAINER RESMI FASIH #cek_anomali_button
    const cekBtnContainer = document.getElementById('cek_anomali_button') ||
                            (switchControl?.closest ? switchControl.closest('#cek_anomali_button') : null) ||
                            (switchInfo?.row?.closest ? switchInfo.row.closest('#cek_anomali_button') : null);

    if (cekBtnContainer) {
      // JIKA ada aria-checked="false", tombol ini PASTI BELUM AKTIF (OFF)!
      const ariaFalseEl = cekBtnContainer.querySelector('[aria-checked="false"]');
      if (ariaFalseEl) {
        return false;
      }

      // Cek atribut data-checked Kobalte (HANYA MUNCUL DI DOM KETIKA ON)
      const dataCheckedEl = cekBtnContainer.querySelector('[data-checked]:not([data-checked="false"])');
      if (dataCheckedEl) return true;

      // Cek aria-checked="true"
      const ariaTrueEl = cekBtnContainer.querySelector('[aria-checked="true"]');
      if (ariaTrueEl) return true;

      // Cek native input checked
      const nativeInp = cekBtnContainer.querySelector('input[type="checkbox"]');
      if (nativeInp && nativeInp.checked && nativeInp.getAttribute('aria-checked') !== 'false') {
        return true;
      }

      // Cek posisi geometris thumb (saat ON offset >= 9px, saat OFF offset < 6px)
      const controlEl = cekBtnContainer.querySelector('[id$="-control"]');
      const thumbEl = cekBtnContainer.querySelector('[id$="-thumb"]');
      if (controlEl && thumbEl) {
        try {
          const cRect = controlEl.getBoundingClientRect();
          const tRect = thumbEl.getBoundingClientRect();
          if (cRect.width > 0 && tRect.width > 0) {
            const offset = tRect.left - cRect.left;
            if (offset >= 9) return true;
            if (offset < 6) return false;
          }
        } catch (_) {}

        // Cek computed transform CSS aktual (saat ON transform matrix translateX >= 8)
        try {
          const transform = window.getComputedStyle(thumbEl).transform;
          if (transform && transform !== 'none') {
            const match = transform.match(/matrix\(([^)]+)\)/);
            if (match) {
              const parts = match[1].split(',').map(s => parseFloat(s.trim()));
              const translateX = parts[4];
              if (translateX >= 8) return true;
              if (translateX <= 2) return false;
            }
          }
        } catch (_) {}
      }

      return false;
    }

    if (!switchControl && !switchInfo.control) return false;

    const control = switchInfo.control || (switchControl.matches?.('[id$="-control"]') ? switchControl : switchControl.querySelector?.('[id$="-control"]')) || switchControl;
    const thumb = switchInfo.thumb || control?.querySelector?.('[id$="-thumb"]') || control?.querySelector?.('div') || (switchControl.id?.endsWith('-thumb') ? switchControl : null);
    const row = switchInfo.row || control?.closest?.('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"], [class*="rounded-lg"]');
    const input = switchInfo.input || row?.querySelector?.('input[type="checkbox"][id*="switch"], input[type="checkbox"]');
    const group = switchInfo.group || control?.closest?.('[role="group"]') || row?.querySelector?.('[role="group"]');

    // JIKA ADA aria-checked="false", PASTI BELUM AKTIF!
    if (input && input.getAttribute('aria-checked') === 'false') return false;
    if (control && control.getAttribute('aria-checked') === 'false') return false;

    // Cek atribut data-checked Kobalte (hanya disematkan saat aktif)
    if (control && control.hasAttribute('data-checked') && control.getAttribute('data-checked') !== 'false') return true;
    if (thumb && thumb.hasAttribute('data-checked') && thumb.getAttribute('data-checked') !== 'false') return true;
    if (group && group.hasAttribute('data-checked') && group.getAttribute('data-checked') !== 'false') return true;
    if (input && input.hasAttribute('data-checked') && input.getAttribute('data-checked') !== 'false') return true;

    // Cek aria-checked="true"
    if (control && control.getAttribute('aria-checked') === 'true') return true;
    if (group && group.getAttribute('aria-checked') === 'true') return true;
    if (input && input.getAttribute('aria-checked') === 'true') return true;

    // Cek posisi fisik thumb (offset horizontal relatif terhadap kontrol)
    if (thumb && control && thumb !== control) {
      try {
        const cRect = control.getBoundingClientRect();
        const tRect = thumb.getBoundingClientRect();
        if (cRect.width > 0 && tRect.width > 0) {
          const offset = tRect.left - cRect.left;
          if (offset >= 9) return true;
          if (offset < 6) return false;
        }
      } catch (_) {}
    }

    // Cek computed transform CSS aktual pada thumb (translateX)
    if (thumb) {
      try {
        const transform = window.getComputedStyle(thumb).transform;
        if (transform && transform !== 'none') {
          const match = transform.match(/matrix\(([^)]+)\)/);
          if (match) {
            const parts = match[1].split(',').map(s => parseFloat(s.trim()));
            const translateX = parts[4];
            if (translateX >= 8) return true;
            if (translateX <= 2) return false;
          }
        } else if (transform === 'none') {
          return false;
        }
      } catch (_) {}
    }

    // Cek apakah ada tabel anomali yang sudah terbuka di bawah baris ini
    if (row) {
      try {
        let sib = row.nextElementSibling;
        while (sib) {
          if (sib.querySelector('table, [role="table"], tbody tr, .tw\\:overflow-x-auto, [class*="anomali"]')) {
            return true;
          }
          sib = sib.nextElementSibling;
        }
      } catch (_) {}
    }

    return false;
  }

  function isAdminResolvedSwitch(switchControl) {
    if (!switchControl) return false;

    // 1. Cek container ID resmi FASIH #anomali_admin -> PASTI SWITCH ADMIN!
    if (switchControl.closest('#anomali_admin, [id="anomali_admin"]')) {
      return true;
    }

    // 2. Cek container ID resmi FASIH #cek_anomali_button -> PASTI BUKAN ADMIN!
    if (switchControl.closest('#cek_anomali_button, [id="cek_anomali_button"]')) {
      return false;
    }

    // 3. Switch "Tampilkan Anomali Usaha dan Keluarga" PASTI BUKAN switch admin
    if (isTampilkanAnomaliSwitch(switchControl)) {
      return false;
    }

    // Cek pada row dari switch
    const row = switchControl.closest('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"], [class*="rounded-lg"]');
    if (row) {
      const labelEl = row.querySelector('div[class*="@lg/form:w-1/3"], .tw\\:font-semibold, label, [class*="font-semibold"]');
      const text = (labelEl?.textContent || row.textContent || '').toLowerCase();
      if (
        text.includes('diselesaikan oleh admin') ||
        text.includes('diselesaikan admin') ||
        text.includes('anomali diselesaikan') ||
        text.includes('oleh admin') ||
        (text.includes('admin') && text.includes('anomali')) ||
        (text.includes('admin') && text.includes('selesai'))
      ) {
        return true;
      }
      if (text.includes('tampilkan anomali') && !text.includes('admin')) {
        return false;
      }
    }

    // Cek atribut dan parent hierarchy lokal (maksimal 4 level, tidak boleh keluar dari row)
    let curr = switchControl;
    for (let i = 0; i < 4 && curr && curr !== document.body; i++) {
      if (curr.classList && curr.classList.contains('tw:rounded-lg')) break;
      const text = (curr.textContent || '').toLowerCase();
      const aria = (curr.getAttribute?.('aria-label') || '').toLowerCase();
      const title = (curr.getAttribute?.('title') || '').toLowerCase();
      const id = (curr.id || '').toLowerCase();
      const name = (curr.getAttribute?.('name') || '').toLowerCase();

      if (
        text.includes('diselesaikan oleh admin') ||
        text.includes('diselesaikan admin') ||
        text.includes('anomali diselesaikan') ||
        text.includes('oleh admin') ||
        (text.includes('admin') && text.includes('anomali')) ||
        (text.includes('admin') && text.includes('selesai')) ||
        aria.includes('admin') ||
        title.includes('admin') ||
        id.includes('admin') ||
        name.includes('admin')
      ) {
        return true;
      }
      curr = curr.parentElement;
    }

    return false;
  }

  // 9c. Temukan toggle switch galat / konfirmasi (Kobalte Switch Component pada Catatan)
  function findGalatToggleSwitch(container = document) {
    if (!container) container = document;

    // Prioritas 1: Selector ID switch-cl-*-control atau [id^="switch-"][id$="-control"]
    const switchById = container.querySelector('[id^="switch-"][id$="-control"], [id*="switch-"][id*="-control"]');
    if (switchById && !isAdminResolvedSwitch(switchById)) return switchById;

    // Prioritas 2: Selector role switch
    const switchByRole = container.querySelector('[role="switch"]');
    if (switchByRole && !isAdminResolvedSwitch(switchByRole)) return switchByRole;

    // Prioritas 3: Komponen dengan kelas kobalte switch thumb
    const thumb = container.querySelector('[id^="switch-"][id$="-thumb"], .tw\\:data-checked\\:translate-x-4');
    if (thumb && thumb.parentElement && !isAdminResolvedSwitch(thumb.parentElement)) return thumb.parentElement;

    // Prioritas 4: Elemen dengan class data-checked switch
    const switchByClass = container.querySelector('.tw\\:data-checked\\:bg-primary');
    if (switchByClass && !isAdminResolvedSwitch(switchByClass)) return switchByClass;

    // Fallback: cari input type checkbox di dalam modal atau container
    const checkbox = container.querySelector('input[type="checkbox"][id*="switch"], input[type="checkbox"]');
    if (checkbox && !isAdminResolvedSwitch(checkbox)) return checkbox;

    return null;
  }

  // Cek apakah toggle switch sedang dalam keadaan aktif (checked / ON)
  function isSwitchChecked(switchControl) {
    if (!switchControl) return false;

    // Jika ini adalah switch "Tampilkan Anomali Usaha dan Keluarga", gunakan deteksi presisi isTampilkanAnomaliActive
    if (isTampilkanAnomaliSwitch(switchControl)) {
      return isTampilkanAnomaliActive(switchControl);
    }

    const thumb = switchControl.querySelector?.('[id$="-thumb"]') || (switchControl.id?.endsWith('-thumb') ? switchControl : null);

    // Cek posisi fisik thumb jika sudah dirender
    if (thumb && switchControl !== thumb) {
      try {
        const cRect = switchControl.getBoundingClientRect();
        const tRect = thumb.getBoundingClientRect();
        if (cRect.width > 0 && tRect.width > 0) {
          const offset = tRect.left - cRect.left;
          if (offset >= 9) return true;
          if (offset < 6) return false;
        }
      } catch (_) {}
    }

    // 1. Kobalte data-checked dan aria-checked attribute
    if (switchControl.getAttribute('aria-checked') === 'true') return true;
    if (switchControl.hasAttribute('data-checked')) return true;

    // 2. Cek checkbox native jika switchControl adalah input
    if (switchControl.tagName === 'INPUT' && switchControl.type === 'checkbox') {
      return switchControl.checked;
    }

    // 3. Cek input checkbox di dalam atau di sekitar switchControl
    const input = switchControl.querySelector?.('input[type="checkbox"], [role="switch"]');
    if (input) {
      if (input.checked) return true;
      if (input.getAttribute('aria-checked') === 'true') return true;
    }

    // 4. Cek parent role="group"
    const group = switchControl.closest?.('[role="group"]');
    if (group && group.getAttribute('aria-checked') === 'true') {
      return true;
    }

    const labelInput = switchControl.closest?.('label')?.querySelector('input[type="checkbox"]');
    if (labelInput && labelInput.checked) return true;

    return false;
  }

  // Mengaktifkan toggle switch agar berstatus ON
  async function ensureSwitchActive(switchControl, textarea = null) {
    if (!switchControl) return false;

    // SAFETY GUARD: Jangan pernah mengaktifkan "Anomali diselesaikan oleh admin"
    if (isAdminResolvedSwitch(switchControl)) {
      console.warn('[TUNTAS] DIABAIKAN: Switch adalah "Anomali diselesaikan oleh admin" (dilarang diaktifkan).');
      return false;
    }

    // SATU-SATUNYA switch yang boleh diaktifkan adalah "Tampilkan Anomali Usaha dan Keluarga"
    if (!isTampilkanAnomaliSwitch(switchControl)) {
      console.warn('[TUNTAS] DIABAIKAN: Switch bukan "Tampilkan Anomali Usaha dan Keluarga". Ditolak untuk diaktifkan.');
      return false;
    }

    if (isSwitchChecked(switchControl)) {
      console.log('[TUNTAS] Toggle switch sudah berstatus ON.');
      return true;
    }

    // Jika switch masih disabled (data-disabled), beri sedikit jeda dan re-trigger input di textarea
    if (switchControl.hasAttribute('data-disabled') || switchControl.getAttribute('aria-disabled') === 'true') {
      console.log('[TUNTAS] Toggle switch masih disabled, merefresh trigger input pada textarea...');
      if (textarea) {
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        try {
          textarea.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: textarea.value }));
        } catch (e) {}
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      await randomSleep(450, 700);
    }

    // Klik kontrol switch
    console.log('[TUNTAS] Mengklik toggle switch untuk mengaktifkan...');
    await humanClick(switchControl);
    await randomSleep(350, 550);

    if (isSwitchChecked(switchControl)) return true;

    // Fallback: klik thumb di dalamnya
    const thumb = switchControl.querySelector('[id$="-thumb"]');
    if (thumb) {
      await humanClick(thumb);
      await randomSleep(250, 450);
    }

    if (isSwitchChecked(switchControl)) return true;

    // Fallback: klik label pembungkus jika ada
    const label = switchControl.closest('label');
    if (label) {
      await humanClick(label);
      await randomSleep(250, 450);
    }

    if (isSwitchChecked(switchControl)) return true;

    // Fallback: dispatch key Space / Enter
    switchControl.focus();
    switchControl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    switchControl.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }));
    await randomSleep(250, 450);

    return isSwitchChecked(switchControl);
  }

  // Angka GALAT di pop-up Kirim FASIH (kartu "GALAT / 0 / Perlu diperbaiki"); null bila pop-up tidak terbaca
  function readKirimModalGalat() {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-kb-dialog-content], [role="alertdialog"]'));
    for (const d of dialogs) {
      const t = (d.innerText || '').replace(/\s+/g, ' ');
      const m = t.match(/GALAT\s*(\d+)/i);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  // 10. Tombol Kirim Survei di Pojok Kanan Atas
  function findTopRightSubmitSurveyButton() {
    const inDialog = (el) => el.closest('[role="dialog"], [role="alertdialog"], [data-kb-dialog-content], #fasih-custom-confirm-panel');
    const els = Array.from(document.querySelectorAll('button, [role="button"], a'))
      .filter(b => !inDialog(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    const visible = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const label = (b) => (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // 1. Tombol bertuliskan persis "Kirim" (header form, ikon pesawat kertas)
    const exact = els.filter(b => label(b) === 'kirim' && visible(b));
    if (exact.length) {
      exact.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
      return exact[0];
    }
    // 2. Tombol berisi kata Kirim + ikon send / kelas primary
    for (const b of els) {
      const t = label(b);
      if (!t.includes('kirim') || t.length > 20) continue;
      const svg = b.querySelector('svg');
      const svgCls = svg ? (svg.getAttribute('class') || '') : '';
      if (svgCls.includes('send') || (svg && svg.querySelector('path[d*="M10 14l11 -11"], path[d*="21 3l-6.5 18"]'))) return b;
      if (String(b.className).includes('bg-primary') || String(b.className).includes('text-primary-foreground')) return b;
    }
    return null;
  }

  // 10b. Tombol Kirim kedua (jika ada tombol Kirim lanjutan setelah klik Kirim header)
  function findSecondaryKirimButton(excludeBtn) {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const b of buttons) {
      if (b === excludeBtn) continue;
      if (b.closest('#fasih-custom-confirm-panel')) continue;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;

      const text = (b.textContent || '').trim().toLowerCase();
      // Pastikan bukan tombol Konfirmasi atau Batal
      if (text === 'kirim' || text === 'kirimkan' || text === 'kirim survei') {
        const rect = b.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return b;
        }
      }
    }
    return null;
  }

  // 11. Modal Konfirmasi Kirim Survei bawaan FASIH ("Konfirmasi Kirim" -> tombol "Konfirmasi")
  function findConfirmSubmitButton() {
    if (isSubmitSuccessVisible()) return null;

    const isBackToReviewBtn = (b) => {
      const t = (b?.textContent || '').trim().toLowerCase();
      return t.includes('kembali ke review') || t.includes('kembali') || t.includes('tutup') || t.includes('batal');
    };

    // 1. Cari langsung berdasarkan judul dialog "Konfirmasi Kirim" atau teks "Apakah Anda yakin ingin mengirimkan data ini?"
    const allTitles = Array.from(document.querySelectorAll('[id*="dialog-"][id*="-title"], div, h2, h3'));
    for (const t of allTitles) {
      const text = (t.textContent || '').trim();
      if (text === 'Konfirmasi Kirim' || text.includes('Konfirmasi Kirim')) {
        const dialogBox = t.closest('.tw\\:border\\!, .tw\\:shadow-lg\\!, [role="dialog"], [role="alertdialog"], div') || t.parentElement?.parentElement;
        if (dialogBox) {
          const dText = (dialogBox.textContent || '').toLowerCase();
          if (dText.includes('berhasil disubmit') || dText.includes('berhasil disimpan')) continue;
          const btns = Array.from(dialogBox.querySelectorAll('button'));
          for (const b of btns) {
            if (isBackToReviewBtn(b)) continue;
            const btnText = (b.textContent || '').trim().toLowerCase();
            if (btnText === 'konfirmasi' || btnText.includes('konfirmasi')) {
              return b;
            }
          }
          // Jika tidak ada teks 'konfirmasi', ambil tombol primary (bukan 'Batal' / 'Kembali ke Review')
          for (const b of btns) {
            if (isBackToReviewBtn(b)) continue;
            if (b.className.includes('bg-primary') || b.className.includes('primary-foreground')) {
              return b;
            }
          }
        }
      }
    }

    // 2. Cari tombol dengan teks tepat "Konfirmasi"
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const b of allButtons) {
      if (b.closest('#fasih-custom-confirm-panel')) continue;
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
      const text = (b.textContent || '').trim();
      if (text === 'Konfirmasi' || text.toLowerCase() === 'konfirmasi') {
        return b;
      }
    }

    // 3. Fallback: cari dari dialog / modal konfirmasi kirim di halaman (bukan navbar .tw:fixed dan bukan modal sukses kirim)
    const dialogs = Array.from(document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], [data-kb-dialog-content], [data-kb-modal]'
    )).filter(d => !d.closest('#fasih-custom-confirm-panel') && d.id !== 'fasih-custom-confirm-panel');

    for (const dlg of dialogs) {
      const text = (dlg.textContent || '').toLowerCase();
      // Abaikan jika dialog ini merupakan peringatan galat/kesalahan atau dialog sukses submit
      if (
        text.includes('galat') ||
        text.includes('tidak dapat') ||
        text.includes('kesalahan') ||
        text.includes('belum diisi') ||
        text.includes('berhasil disubmit') ||
        text.includes('berhasil disimpan') ||
        text.includes('kembali ke review')
      ) {
        continue;
      }
      if (text.includes('konfirmasi') || text.includes('yakin')) {
        const btns = Array.from(dlg.querySelectorAll('button'));
        for (const b of btns) {
          if (b.disabled || b.getAttribute('aria-disabled') === 'true' || isBackToReviewBtn(b)) continue;
          const btnText = (b.textContent || '').trim().toLowerCase();
          if (btnText === 'konfirmasi' || btnText === 'kirim' || btnText.includes('ya') || btnText.includes('setuju')) {
            return b;
          }
        }
        for (const b of btns) {
          if (b.disabled || b.getAttribute('aria-disabled') === 'true' || isBackToReviewBtn(b)) continue;
          if (b.className.includes('bg-primary')) {
            return b;
          }
        }
      }
    }

    return null;
  }

  // 12. Modal Konfirmasi Manual sebelum Kirim (Floating Panel Interaktif & Bebas Scroll)
  let activeManualConfirmResolver = null;

  function showManualConfirmModal(commentText) {
    return new Promise((resolve) => {
      // Hapus modal lama jika ada
      const existing = document.getElementById('fasih-custom-confirm-panel');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.id = 'fasih-custom-confirm-panel';
      panel.style.cssText = `
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        width: 440px !important;
        max-width: calc(100vw - 48px) !important;
        background: #ffffff !important;
        color: #0f172a !important;
        border: 2px solid #1565C0 !important;
        border-radius: 14px !important;
        box-shadow: 0 20px 30px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.05) !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        overflow: hidden !important;
        transition: all 0.2s ease !important;
      `;

      panel.innerHTML = `
        <div style="background: linear-gradient(135deg, #1565C0, #0D3B7A) !important; color: #ffffff !important; padding: 12px 16px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; cursor: default !important; user-select: none !important;">
          <div style="display: flex !important; align-items: center !important; gap: 8px !important; font-weight: 700 !important; font-size: 14px !important;">
            <span>📋</span>
            <span>Konfirmasi Pengiriman Survei</span>
          </div>
          <span style="font-size: 11px !important; background: rgba(255,255,255,0.2) !important; padding: 2px 8px !important; border-radius: 9999px !important;">
            Silakan Cek Isian
          </span>
        </div>

        <div style="padding: 16px !important;">
          <div style="background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-radius: 8px !important; padding: 10px 12px !important; margin-bottom: 12px !important; font-size: 13px !important; color: #166534 !important; line-height: 1.4 !important;">
            <div style="font-weight: 600 !important; margin-bottom: 4px !important;">
              ✔ Seluruh rincian unit usaha telah diisi catatan: <u>${commentText}</u>
            </div>
            <div style="font-size: 12px !important; color: #15803d !important;">
              Anda dapat scroll dan periksa halaman formulir ini sekarang.
            </div>
          </div>

          <div style="display: flex !important; flex-direction: column !important; gap: 8px !important;">
            <button id="fasih-btn-confirm-yes" type="button" style="
              background: #16a34a !important;
              color: #ffffff !important;
              border: none !important;
              padding: 12px 16px !important;
              border-radius: 8px !important;
              font-size: 13px !important;
              font-weight: 700 !important;
              cursor: pointer !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              gap: 8px !important;
              box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3) !important;
              pointer-events: auto !important;
              user-select: none !important;
            ">
              ✅ Ya, Sudah Sesuai & Lanjut Kirim (Enter)
            </button>

            <button id="fasih-btn-confirm-skip" type="button" style="
              background: #f1f5f9 !important;
              color: #334155 !important;
              border: 1px solid #cbd5e1 !important;
              padding: 9px 16px !important;
              border-radius: 8px !important;
              font-size: 12px !important;
              font-weight: 600 !important;
              cursor: pointer !important;
              pointer-events: auto !important;
              user-select: none !important;
            ">
              ⏩ Lewati Kirim (Simpan Catatan & Lanjut Antrian)
            </button>

            <button id="fasih-btn-confirm-stop" type="button" style="
              background: transparent !important;
              color: #dc2626 !important;
              border: none !important;
              padding: 6px 16px !important;
              border-radius: 6px !important;
              font-size: 11px !important;
              font-weight: 600 !important;
              cursor: pointer !important;
              text-decoration: underline !important;
              pointer-events: auto !important;
              user-select: none !important;
            ">
              🛑 Hentikan di Sini (Periksa Manual di Tab Ini) (Esc)
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(panel);

      let handled = false;
      const cleanAndResolve = (decision) => {
        if (handled) return;
        handled = true;
        activeManualConfirmResolver = null;
        window.removeEventListener('keydown', keyListener, true);
        panel.remove();
        resolve(decision);
      };
      activeManualConfirmResolver = cleanAndResolve;

      const keyListener = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cleanAndResolve('CONFIRM');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanAndResolve('STOP');
        }
      };
      window.addEventListener('keydown', keyListener, true);

      // Pasang event listener dengan capture phase dan fallback onclick
      const btnYes = document.getElementById('fasih-btn-confirm-yes');
      const btnSkip = document.getElementById('fasih-btn-confirm-skip');
      const btnStop = document.getElementById('fasih-btn-confirm-stop');

      if (btnYes) {
        ['click', 'pointerdown', 'mousedown'].forEach(ev => {
          btnYes.addEventListener(ev, (e) => {
            e.stopPropagation();
            cleanAndResolve('CONFIRM');
          }, true);
        });
        btnYes.onclick = () => cleanAndResolve('CONFIRM');
      }

      if (btnSkip) {
        ['click', 'pointerdown', 'mousedown'].forEach(ev => {
          btnSkip.addEventListener(ev, (e) => {
            e.stopPropagation();
            cleanAndResolve('SKIP');
          }, true);
        });
        btnSkip.onclick = () => cleanAndResolve('SKIP');
      }

      if (btnStop) {
        ['click', 'pointerdown', 'mousedown'].forEach(ev => {
          btnStop.addEventListener(ev, (e) => {
            e.stopPropagation();
            cleanAndResolve('STOP');
          }, true);
        });
        btnStop.onclick = () => cleanAndResolve('STOP');
      }
    });
  }

  // 13. Cari baris dan kontrol switch "Tampilkan Anomali Usaha dan Keluarga"
  function findTampilkanAnomaliRowAndSwitch() {
    // PRIORITAS 1: Gunakan container ID resmi FASIH #cek_anomali_button
    const cekAnomaliContainer = document.getElementById('cek_anomali_button') || document.querySelector('#cek_anomali_button');
    if (cekAnomaliContainer) {
      const row = cekAnomaliContainer.querySelector('.tw\\:rounded-lg, [class*="rounded-lg"]') || cekAnomaliContainer;
      const control = cekAnomaliContainer.querySelector('[id^="switch-"][id$="-control"], [id*="switch-"][id*="-control"], [role="switch"]');
      const thumb = cekAnomaliContainer.querySelector('[id^="switch-"][id$="-thumb"]');
      const input = cekAnomaliContainer.querySelector('input[type="checkbox"][id*="switch"], input[type="checkbox"]');
      const group = cekAnomaliContainer.querySelector('[role="group"][id^="switch-"], [role="group"]');
      const label = cekAnomaliContainer.querySelector('.tw\\:font-semibold, label, div');

      if (control || group || thumb || input) {
        return {
          row,
          control: control || group || input,
          input,
          group,
          thumb: thumb || control?.querySelector?.('[id$="-thumb"]'),
          label
        };
      }
    }

    // PRIORITAS 2: Pencarian teks "Tampilkan Anomali Usaha dan Keluarga"
    const textEls = Array.from(document.querySelectorAll('div, label, span, p, h2, h3, h4'));
    for (const el of textEls) {
      if (el.children.length > 2) continue;
      const text = (el.textContent || '').trim().toLowerCase();
      if (
        (text === 'tampilkan anomali usaha dan keluarga' ||
         text.includes('tampilkan anomali usaha dan keluarga') ||
         (text.includes('tampilkan anomali') && text.includes('usaha'))) &&
        !text.includes('admin') &&
        !el.closest('#anomali_admin')
      ) {
        // Cari baris pembungkus (row) yang presisi, BUKAN container umum yang luas
        const row = el.closest('.tw\\:rounded-lg, [class*="rounded-lg"][class*="tw:py-2"], [class*="rounded-lg"]') ||
                    el.closest('div[class*="@lg/form:w-1/3"]')?.parentElement ||
                    el.closest('div[class*="@lg/form:flex-row"]');
        if (row && !row.closest('#anomali_admin')) {
          // Cari spesifik di kolom sebelah kanan label (sibling) jika ada
          const rightCol = el.closest('div[class*="@lg/form:w-1/3"]')?.nextElementSibling || row;

          const thumbs = Array.from(rightCol.querySelectorAll('[id^="switch-"][id$="-thumb"]'));
          const controls = Array.from(rightCol.querySelectorAll('[id^="switch-"][id$="-control"], [id*="switch-"][id*="-control"], [role="switch"]'));

          let validControl = controls.find(c => !isAdminResolvedSwitch(c) && !c.closest('#anomali_admin'));
          let validThumb = thumbs.find(t => !isAdminResolvedSwitch(t) && !t.closest('#anomali_admin'));

          if (!validControl && validThumb) {
            validControl = validThumb.parentElement;
          }

          if (validControl && (isAdminResolvedSwitch(validControl) || validControl.closest('#anomali_admin'))) {
            continue; // Jangan pernah ambil switch admin!
          }

          const group = rightCol.querySelector('[role="group"][id^="switch-"], [role="group"]');
          const input = rightCol.querySelector('input[type="checkbox"][id*="switch"], input[type="checkbox"]');

          return {
            row,
            control: validControl || group || input,
            input,
            group,
            thumb: validThumb || validControl?.querySelector?.('[id$="-thumb"]'),
            label: el
          };
        }
      }
    }
    return null;
  }

  // Mengaktifkan toggle switch "Tampilkan Anomali Usaha dan Keluarga"
  async function activateTampilkanAnomaliSwitch(switchInfo) {
    if (!switchInfo) return { success: false };
    const { row, control, input, group, thumb, label } = switchInfo;

    // 1. Cek apakah SUDAH aktif (ON) sebelum melakukan interaksi apa pun (JANGAN klik jika sudah ON!)
    if (isTampilkanAnomaliActive(control, switchInfo)) {
      console.log('[TUNTAS] Toggle "Tampilkan Anomali Usaha dan Keluarga" sudah berstatus ON. Lewati klik!');
      return { success: true, alreadyOn: true };
    }

    if (row) {
      try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      await randomSleep(200, 350);
    }

    // 2. Buka kunci atribut disabled / data-disabled jika ada agar klik diproses
    const unlockElements = [input, control, group, thumb].filter(Boolean);
    for (const el of unlockElements) {
      try {
        if (el.hasAttribute('disabled')) el.removeAttribute('disabled');
        if (el.hasAttribute('data-disabled')) el.removeAttribute('data-disabled');
        if (el.hasAttribute('aria-disabled')) el.removeAttribute('aria-disabled');
        if (el.tagName === 'INPUT') el.disabled = false;
      } catch (_) {}
    }

    // Helper untuk menunggu status menjadi ON (polling setiap 100ms hingga timeout)
    async function waitForActiveState(timeoutMs = 1500) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (isTampilkanAnomaliActive(control, switchInfo)) {
          return true;
        }
        await sleep(100);
      }
      return false;
    }

    // 3. LAKUKAN 1x KLIK UTAMA pada target utama (control atau group)
    const primaryTarget = control || group || thumb;
    if (primaryTarget) {
      console.log('[TUNTAS] Mengklik toggle switch anomali (klik utama)...');
      try { primaryTarget.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      await randomSleep(150, 250);

      await humanClick(primaryTarget);

      // Tunggu hingga animasi/transisi toggle selesai dan verifikasi status ON
      const becameActive = await waitForActiveState(1500);
      if (becameActive) {
        console.log('[TUNTAS] Toggle switch anomali BERHASIL aktif (ON)! Berhenti mengeklik agar tidak ter-off kan kembali.');
        return { success: true };
      }
    }

    // 4. FALLBACK HANYA JIKA KLIK PERTAMA BELUM MENGAKTIFKAN
    if (isTampilkanAnomaliActive(control, switchInfo)) {
      console.log('[TUNTAS] Toggle sudah aktif setelah klik pertama.');
      return { success: true };
    }

    console.log('[TUNTAS] Klik utama belum mengaktifkan switch, mencoba fallback ke group/label...');
    const secondaryTarget = (primaryTarget === control) ? (group || label) : control;
    if (secondaryTarget) {
      await humanClick(secondaryTarget);
      const becameActive = await waitForActiveState(1200);
      if (becameActive) {
        console.log('[TUNTAS] Toggle aktif melalui klik sekunder.');
        return { success: true };
      }
    }

    // 5. FALLBACK TERAKHIR: Trigger native input jika masih belum aktif
    if (!isTampilkanAnomaliActive(control, switchInfo) && input) {
      try {
        input.checked = true;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.click();
      } catch (_) {}
      await waitForActiveState(800);
    }

    const finalStatus = isTampilkanAnomaliActive(control, switchInfo);
    return { success: finalStatus };
  }

  // 13. Buka Menu Sidebar CATATAN & Aktifkan Toggle "Tampilkan Anomali Usaha dan Keluarga"
  async function handleCatatanAnomaliSection(stepDelay = 1500) {
    notifyStep('STEP_5B_MENU_CATATAN', 'Mencari menu sidebar "CATATAN"...', 'progress');
    const menuCatatan = await waitForElement(findMenuCatatanButton, 8000);
    if (!menuCatatan) {
      notifyStep('STEP_5B_MENU_CATATAN_WARN', 'Menu sidebar "CATATAN" tidak ditemukan. Melanjutkan ke pengiriman...', 'warning');
      return false;
    }

    notifyStep('STEP_5B_CLICK_CATATAN', 'Membuka menu "CATATAN"...', 'progress');
    await humanClick(menuCatatan);
    await sleep(getJitterDelay(stepDelay));

    // Beri jeda sejenak agar DOM section CATATAN termuat penuh
    await randomSleep(400, 650);

    // Cari teks / bagian "Tampilkan Anomali Usaha dan Keluarga"
    notifyStep('STEP_5B_ANOMALI_FIND', 'Memeriksa toggle "Tampilkan Anomali Usaha dan Keluarga"...');
    
    let switchInfo = null;
    const startFind = Date.now();
    while (Date.now() - startFind < 8000) {
      await checkAbortOrPause();
      switchInfo = findTampilkanAnomaliRowAndSwitch();
      if (switchInfo && switchInfo.control) break;
      await randomSleep(250, 450);
    }

    // Jika toggle ditemukan
    if (switchInfo && switchInfo.control) {
      // 1. CEK STATUS: Kalo sudah ON, langsung dilewatin!
      const isAlreadyOn = isTampilkanAnomaliActive(switchInfo.control, switchInfo);

      if (isAlreadyOn) {
        notifyStep('STEP_5B_ALREADY_ON', 'Toggle "Tampilkan Anomali Usaha dan Keluarga" sudah ON. Langsung lanjut ke pengiriman!', 'success');
        await sleep(getJitterDelay(stepDelay));
        return true;
      }

      // 2. Kalo belum ON: Di-klik sampai aktif (ON)!
      notifyStep('STEP_5B_TOGGLE_ON', 'Toggle "Tampilkan Anomali Usaha dan Keluarga" belum aktif. Mengklik untuk mengaktifkan...', 'progress');
      const res = await activateTampilkanAnomaliSwitch(switchInfo);
      if (res.success || res.alreadyOn) {
        notifyStep('STEP_5B_DONE', 'Toggle "Tampilkan Anomali Usaha dan Keluarga" berhasil diaktifkan. Langsung lanjut ke pengiriman!', 'success');
      } else {
        notifyStep('STEP_5B_DONE', 'Pemeriksaan toggle anomali selesai. Langsung lanjut ke pengiriman...', 'progress');
      }
      await sleep(getJitterDelay(stepDelay));
      return true;
    }

    notifyStep('STEP_5B_CHECK', 'Toggle "Tampilkan Anomali Usaha dan Keluarga" tidak ditemukan pada menu CATATAN. Langsung lanjut ke pengiriman.');
    await sleep(getJitterDelay(stepDelay));
    return true;
  }

  // 13b. Mengisi catatan untuk satu pertanyaan target dengan pengecekan apakah sudah terisi
  async function fillCommentForTargetQuestion({
    questionEl,
    targetCode,
    targetLabel,
    effectiveComment,
    isSecondary,
    exactCodeOnly = false,
    stepDelay = 1500,
    indexStr = '1/1',
    closeModalOnExisting = false
  }) {
    if (!questionEl) return false;

    // 0. Pastikan modal catatan sebelumnya benar-benar tertutup agar tidak terjadi tumpang tindih
    await ensureCommentModalClosed();
    await randomSleep(250, 450);

    questionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomSleep(350, 550);

    // 1. Cari tombol Catatan spesifik untuk targetCode (misal 23.b, 27.b, 30.b atau 23.a, 27.a, 31.a)
    notifyStep('STEP_5_COMMENT_BTN', `[${indexStr}] Mencari tombol Catatan untuk ${targetCode}...`);
    let commentBtn = findCommentButtonForQuestion(questionEl, targetCode);
    if (!commentBtn) {
      notifyStep('STEP_5_COMMENT_BTN_WARN', `[${indexStr}] Tombol Catatan untuk ${targetCode} tidak ditemukan. Melewati...`, 'warning');
      return false;
    }

    // 2. Klik tombol Catatan
    notifyStep('STEP_5_COMMENT_CLICK', `[${indexStr}] Mengklik tombol Catatan untuk ${targetCode}...`, 'progress');
    await humanClick(commentBtn);
    await sleep(getJitterDelay(stepDelay));

    // 3. Tunggu textarea modal terbuka
    let textarea = await waitForElement(findCommentModalTextarea, 6000);
    if (!textarea) {
      await humanClick(commentBtn);
      await randomSleep(850, 1250);
      textarea = await waitForElement(findCommentModalTextarea, 4000);
    }

    if (!textarea) {
      notifyStep('STEP_5_MODAL_FAIL', `[${indexStr}] Modal catatan gagal terbuka untuk ${targetCode}. Melewati...`, 'warning');
      return false;
    }

    const findModalContainer = () => {
      let dlg = textarea.closest('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal], [data-state="open"]');
      if (!dlg) {
        let p = textarea.parentElement;
        for (let depth = 0; depth < 8 && p && p !== document.body; depth++) {
          const cls = typeof p.className === 'string' ? p.className : '';
          if (
            p.getAttribute('role') === 'dialog' ||
            /^dialog-/i.test(p.id || '') ||
            cls.includes('fixed') ||
            cls.includes('shadow-lg')
          ) {
            dlg = p;
            break;
          }
          p = p.parentElement;
        }
      }
      return dlg || textarea.parentElement?.parentElement;
    };

    const modalDialog = findModalContainer();

    // 4. Periksa apakah sudah ada isinya (baik #DC_00, #0, maupun effectiveComment)
    const checkExistingRemark = () => {
      const curDialog = findModalContainer();
      const openDialogsText = Array.from(document.querySelectorAll('[role="dialog"], [id^="dialog-"][id$="-content"], [data-kb-dialog-content], [data-kb-modal]'))
        .filter(d => d.id !== 'fasih-custom-confirm-panel' && !d.closest('#fasih-custom-confirm-panel') && (d.offsetParent !== null || getComputedStyle(d).position === 'fixed'))
        .map(d => d.innerText || d.textContent || '').join('\n');
      const modalText = (((curDialog && (curDialog.innerText || curDialog.textContent)) || '') + '\n' + openDialogsText).toUpperCase();
      const textareaVal = ((textarea && textarea.value) || '').toUpperCase();
      const questionText = ((questionEl && questionEl.textContent) || '').toUpperCase();

      const dc0AliasRe = /(?<![A-Z0-9])(#DC_?00?|#0)(?![A-Z0-9_])/;

      if (exactCodeOnly) {
        const esc = String(effectiveComment || '').toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?<![A-Z0-9])${esc}(?![A-Z0-9_])`);
        if (effectiveComment && (re.test(modalText) || re.test(textareaVal))) {
          return { alreadyHasComment: true, foundCode: effectiveComment };
        }
        const m = modalText.match(dc0AliasRe) || textareaVal.match(dc0AliasRe);
        if (m && !String(effectiveComment || '').toUpperCase().includes('01')) {
          return { alreadyHasComment: true, foundCode: m[1] };
        }
      } else if (isSecondary) {
        if (modalText.includes('#DC12') || textareaVal.includes('#DC12') || questionText.includes('#DC12')) {
          return { alreadyHasComment: true, foundCode: '#DC12' };
        }
        if (modalText.includes('#DC_12') || textareaVal.includes('#DC_12') || questionText.includes('#DC_12')) {
          return { alreadyHasComment: true, foundCode: '#DC_12' };
        }
        if (effectiveComment && (modalText.includes(effectiveComment.toUpperCase()) || textareaVal.includes(effectiveComment.toUpperCase()))) {
          return { alreadyHasComment: true, foundCode: effectiveComment };
        }
      } else {
        const dc0OrDc3Re = /(?<![A-Z0-9])(#DC_?00?|#DC_?03|#0)(?![A-Z0-9_])/;
        const m = modalText.match(dc0OrDc3Re) || textareaVal.match(dc0OrDc3Re) || questionText.match(dc0OrDc3Re);
        if (m) {
          return { alreadyHasComment: true, foundCode: m[1] };
        }
        if (effectiveComment && (modalText.includes(effectiveComment.toUpperCase()) || textareaVal.includes(effectiveComment.toUpperCase()))) {
          return { alreadyHasComment: true, foundCode: effectiveComment };
        }
      }

      return { alreadyHasComment: false, foundCode: '' };
    };

    let { alreadyHasComment, foundCode } = checkExistingRemark();
    if (!alreadyHasComment) {
      // Beri jeda singkat untuk memastikan daftar riwayat catatan di dalam modal telah selesai dirender
      await sleep(250);
      ({ alreadyHasComment, foundCode } = checkExistingRemark());
    }

    // Jika sudah ada isinya (#DC_00 atau #0): tidak perlu diisi lagi, tutup modal & kembali
    if (alreadyHasComment) {
      notifyStep('STEP_5_ALREADY_EXISTS', `[${indexStr}] Remark ${foundCode} sudah ada pada ${targetCode}.`, 'warning');

      if (closeModalOnExisting) {
        await closeCommentModal(textarea, modalDialog);
      }

      return { ok: true, alreadyExists: true, foundCode };
    }

    // Jika belum ada isinya: Isi catatan
    notifyStep('STEP_5_FILL', `[${indexStr}] Mengisi catatan: "${effectiveComment}" pada ${targetCode}...`, 'progress');
    await simulateHumanTyping(textarea, effectiveComment);
    await randomSleep(450, 700);

    // Simpan catatan
    let submitCommentBtn = findSubmitCommentButton(textarea);
    if (submitCommentBtn) {
      notifyStep('STEP_5_SUBMIT_COMMENT', `[${indexStr}] Menyimpan catatan...`, 'progress');
      await humanClick(submitCommentBtn);
      await sleep(getJitterDelay(stepDelay));
    } else {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await sleep(getJitterDelay(stepDelay));
    }

    // Pastikan modal ditutup setelah catatan tersimpan agar tidak mengganggu target berikutnya
    await randomSleep(400, 650);
    await closeCommentModal(textarea, modalDialog);
    await ensureCommentModalClosed();
    await randomSleep(350, 500);

    notifyStep('STEP_5_DONE_ITEM', `[${indexStr}] Catatan "${effectiveComment}" untuk ${targetCode} berhasil disimpan!`, 'progress');
    await randomSleep(400, 650);
    return { ok: true, alreadyExists: false, foundCode: effectiveComment };
  }

  // 14. Ekstrak label / nomor pertanyaan dari elemen form
  function extractQuestionLabelFromElement(el) {
    if (!el) return '';
    try {
      // a. Cek atribut data-id
      const dataIdEl = el.querySelector ? el.querySelector('[data-id]') : null;
      if (dataIdEl && dataIdEl.getAttribute('data-id')) {
        return dataIdEl.getAttribute('data-id').trim();
      }
      if (el.getAttribute && el.getAttribute('data-id')) {
        return el.getAttribute('data-id').trim();
      }

      // b. Cek elemen font-semibold (judul pertanyaan)
      const semi = el.querySelector ? el.querySelector('.tw\\:font-semibold') : null;
      if (semi) {
        const raw = (semi.textContent || '').replace(/\*/g, '').trim();
        if (raw) return raw;
      }

      // c. Cek teks berawalan format pertanyaan seperti "27. a", "30. b", "23. a", "b."
      const allTexts = el.querySelectorAll ? Array.from(el.querySelectorAll('div, span, p, label')) : [];
      for (const t of allTexts) {
        const txt = (t.textContent || '').trim();
        const match = txt.match(/^(\d+\s*[\.\)]\s*[a-z]?[\.\)]?\s*[^:\n*]{2,50})/i);
        if (match) return match[1].trim();
      }
      for (const t of allTexts) {
        const txt = (t.textContent || '').trim();
        const match = txt.match(/^([a-z]\s*[\.\)]\s*[^:\n*]{2,50})/i);
        if (match) return match[1].trim();
      }
    } catch (_) {}
    return '';
  }

  // 15. Deteksi Galat, Peringatan, atau Pertanyaan Wajib yang Belum Terisi pada Formulir FASIH
  function detectFormGalatOrErrors() {
    const issues = [];
    const seen = new Set();

    // 1. Deteksi Toast Notification (Sonner, Radix toast)
    const toasts = Array.from(document.querySelectorAll(
      '[data-sonner-toast], [data-radix-toast-content], [role="status"], [role="alert"], .toaster > div, div[class*="toast"], [id*="toast"]'
    ));
    for (const t of toasts) {
      if (t.closest('#fasih-custom-confirm-panel')) continue;
      const text = (t.textContent || '').trim();
      if (!text) continue;
      const lower = text.toLowerCase();
      if (lower.includes('berhasil') || lower.includes('sukses') || lower.includes('success')) continue;
      if (
        lower.includes('gagal') ||
        lower.includes('galat') ||
        lower.includes('belum diisi') ||
        lower.includes('belum lengkap') ||
        lower.includes('wajib diisi') ||
        lower.includes('tidak valid') ||
        lower.includes('tidak boleh') ||
        lower.includes('error') ||
        lower.includes('anomali') ||
        lower.includes('periksa kembali')
      ) {
        const clean = text.replace(/\s+/g, ' ').slice(0, 120);
        if (!seen.has(clean)) {
          seen.add(clean);
          issues.push(`Toast: ${clean}`);
        }
      }
    }

    // 2. Deteksi Modal Dialog / AlertDialog Peringatan Galat
    const dialogs = Array.from(document.querySelectorAll(
      '[role="alertdialog"], [role="alert"], [data-kb-dialog-content], div.tw\\:shadow-lg\\!, div[class*="shadow-lg"]'
    ));
    for (const dlg of dialogs) {
      if (dlg.closest('#fasih-custom-confirm-panel')) continue;
      if (dlg.id === 'fasih-custom-confirm-panel') continue;
      const text = (dlg.textContent || '').trim();
      if (!text) continue;
      const lower = text.toLowerCase();
      // Lewati modal konfirmasi kirim normal jika tidak mengandung peringatan galat
      if (lower.includes('apakah anda yakin') && !lower.includes('galat') && !lower.includes('belum diisi') && !lower.includes('wajib')) {
        continue;
      }
      if (
        lower.includes('galat') ||
        lower.includes('belum diisi') ||
        lower.includes('belum lengkap') ||
        lower.includes('wajib diisi') ||
        lower.includes('tidak valid') ||
        lower.includes('peringatan') ||
        lower.includes('periksa kembali') ||
        lower.includes('masih terdapat')
      ) {
        const clean = text.replace(/\s+/g, ' ').slice(0, 120);
        if (!seen.has(clean)) {
          seen.add(clean);
          issues.push(`Dialog: ${clean}`);
        }
      }
    }

    // 3. Deteksi Pesan Error Inline atau Pertanyaan Wajib Kosong pada Form
    const errorElements = Array.from(document.querySelectorAll(
      '.tw\\:text-destructive, [class*="text-destructive"], [class*="border-destructive"], .text-danger, [aria-invalid="true"], [data-invalid="true"]'
    ));

    for (const el of errorElements) {
      if (el.closest('#fasih-custom-confirm-panel')) continue;
      if (el.tagName === 'svg' || el.tagName === 'path') continue;

      const elText = (el.textContent || '').trim();
      const isOnlyAsterisk = (elText === '*' || elText === '**');
      const lowerText = elText.toLowerCase();

      const isExplicitErrorText = !isOnlyAsterisk && (
        lowerText.includes('wajib') ||
        lowerText.includes('belum diisi') ||
        lowerText.includes('harus diisi') ||
        lowerText.includes('tidak boleh') ||
        lowerText.includes('galat') ||
        lowerText.includes('tidak valid') ||
        lowerText.includes('salah') ||
        lowerText.includes('harus berupa') ||
        lowerText.includes('melebihi') ||
        lowerText.includes('kurang dari')
      );

      // Cari baris pertanyaan tempat elemen berada
      const qRow = el.closest('.tw\\:rounded-lg, [role="group"], div.tw\\:py-2, div.tw\\:flex-col') || el.parentElement?.parentElement;
      const qLabel = extractQuestionLabelFromElement(qRow) || '';

      if (isExplicitErrorText) {
        const errKey = qLabel ? `${qLabel}: ${elText}` : elText;
        if (!seen.has(errKey)) {
          seen.add(errKey);
          issues.push(qLabel ? `[${qLabel}: ${elText}]` : `[${elText}]`);
        }
      } else if (isOnlyAsterisk && qRow) {
        // Tanda bintang wajib (*): periksa apakah isian di baris ini kosong
        const input = qRow.querySelector('input[type="text"], input[type="number"], textarea');
        if (input && input.value.trim() === '') {
          const errKey = `${qLabel || 'Pertanyaan Wajib'}_empty`;
          if (!seen.has(errKey)) {
            seen.add(errKey);
            issues.push(`[${qLabel || 'Pertanyaan Wajib'}: Wajib diisi (belum ada nilai)]`);
          }
        }

        // Cek radio button bertanda wajib jika ada
        const radios = Array.from(qRow.querySelectorAll('input[type="radio"]'));
        if (radios.length > 0 && !radios.some(r => r.checked)) {
          const errKey = `${qLabel || 'Pertanyaan Pilihan'}_unselected`;
          if (!seen.has(errKey)) {
            seen.add(errKey);
            issues.push(`[${qLabel || 'Pertanyaan Pilihan'}: Belum dipilih]`);
          }
        }
      }
    }

    // 4. Deteksi Input dengan tanda invalid atribut
    const invalidInputs = Array.from(document.querySelectorAll('input[aria-invalid="true"], [data-invalid="true"], input[class*="border-destructive"]'));
    for (const inp of invalidInputs) {
      if (inp.closest('#fasih-custom-confirm-panel')) continue;
      const qRow = inp.closest('.tw\\:rounded-lg, [role="group"], div.tw\\:py-2, div.tw\\:flex-col') || inp.parentElement;
      const qLabel = extractQuestionLabelFromElement(qRow) || '';
      const errKey = `${qLabel || 'Input'}_invalid`;
      if (!seen.has(errKey)) {
        seen.add(errKey);
        issues.push(`[${qLabel || 'Pertanyaan'}: Isian tidak valid]`);
      }
    }

    // 5. Deteksi Sidebar / Stepper Error Badges
    const sidebarErrors = Array.from(document.querySelectorAll(
      '.fasih-form-sidebar .tw\\:text-destructive, .fasih-form-sidebar [class*="text-destructive"], .fasih-form-sidebar [class*="bg-destructive"]'
    ));
    for (const s of sidebarErrors) {
      const sText = (s.textContent || '').trim();
      if (sText && sText !== '*' && !seen.has('sidebar_' + sText)) {
        seen.add('sidebar_' + sText);
        const parentNav = s.closest('.tw\\:cursor-pointer, [role="button"], div');
        const navTitle = parentNav ? (parentNav.getAttribute('title') || parentNav.textContent || '').trim() : '';
        issues.push(`Bagian ${navTitle || 'Formulir'}: Terdapat ${sText} galat`);
      }
    }

    if (issues.length === 0) return null;

    // Format output rapi (maksimal 3 item rincian teratas)
    const uniqueIssues = Array.from(new Set(issues));
    if (uniqueIssues.length <= 3) {
      return uniqueIssues.join(' | ');
    }
    return `${uniqueIssues.slice(0, 3).join(' | ')} (+${uniqueIssues.length - 3} galat lainnya)`;
  }

  // ===================== WORKFLOW EXECUTOR =====================

  // ===================== MODE KBLI (template Excel anomali KBLI) =====================
  // Baris dari template KBLI membawa options.kbliTask:
  //   { idAssignment, kbliAwal, kbliTujuan, gantiKbli, deskripsiBaru }
  // Alur per unit usaha di BLOK II:
  //   1. Baca KBLI terpilih di "13. g. Kode KBLI" (radio "[A] 01121 Pertanian Padi Hibrida", dst.)
  //   2. Unit usaha diproses bila KBLI terpilih = kbliAwal (atau sudah = kbliTujuan pada proses ulang)
  //   3. KBLI diganti -> klik radio kbliTujuan (hanya bila ada di daftar pilihan; "Pilih dari Master KBLI" TIDAK diotomasi)
  //   4. Catatan di tombol Catatan 13.g: #DC_1 (diganti) / #DC_0 (sudah sesuai)
  // Bila tidak ada unit usaha yang cocok, atau KBLI tujuan tidak ada di pilihan, dokumen TIDAK dikirim.

  function findQuestion13gKbliElement() {
    const nodes = Array.from(document.querySelectorAll('div, span, label, p'));
    let best = null;
    for (const el of nodes) {
      if (el.closest('#fasih-custom-confirm-panel, .fasih-form-sidebar')) continue;
      const raw = (el.textContent || '').trim();
      if (!raw || raw.length > 60) continue;
      const norm = normalizeFasihText(raw);
      if (norm.includes('kode kbli') && /\b13\s*\.?\s*g\b/.test(norm)) {
        if (!best || best.contains(el)) best = el;
      }
    }
    return best;
  }

  // Ambil daftar opsi radio KBLI pada baris pertanyaan 13.g
  function getKbliOptions(questionEl) {
    const row = getQuestionRowFromElement(questionEl);
    if (!row) return [];
    const options = [];
    const seenCodes = new Set();
    const candidates = Array.from(row.querySelectorAll('label, div, span, p'));
    for (const el of candidates) {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const m = txt.match(/^\[([A-Z])\]\s*(\d{5})\b/);
      if (!m || txt.length > 160) continue;
      // Ambil elemen terdalam yang memuat teks opsi
      const childMatch = Array.from(el.children).some(ch => /^\[[A-Z]\]\s*\d{5}\b/.test((ch.textContent || '').trim()));
      if (childMatch) continue;
      const code = m[2];
      if (seenCodes.has(code)) continue;

      // Naik maksimal 4 level untuk menemukan input radio yang menjadi pasangan opsi ini
      let container = el;
      let radio = null;
      for (let i = 0; i < 5 && container && container !== row; i++) {
        radio = container.querySelector('input[type="radio"], [role="radio"]');
        if (radio) break;
        container = container.parentElement;
      }
      if (!radio) continue;
      // Pastikan container tidak memuat beberapa opsi sekaligus
      const codesInContainer = ((container.textContent || '').match(/\[[A-Z]\]\s*\d{5}/g) || []).length;
      if (codesInContainer > 1) {
        radio = el.closest('label')?.querySelector('input[type="radio"], [role="radio"]') || null;
        container = el.closest('label') || el;
        if (!radio) continue;
      }

      const checked = Boolean(
        (radio.tagName === 'INPUT' && radio.checked) ||
        radio.getAttribute('aria-checked') === 'true' ||
        radio.hasAttribute('data-checked') ||
        container.querySelector('[data-checked], [aria-checked="true"]')
      );
      seenCodes.add(code);
      options.push({ code, label: txt, el, radio, container, checked });
    }
    return options;
  }

  async function selectKbliOption(questionEl, code, stepDelay) {
    let opts = getKbliOptions(questionEl);
    const target = opts.find(o => o.code === code);
    if (!target) return { ok: false, reason: `KBLI ${code} tidak ada di pilihan 13.g (perlu "Pilih dari Master KBLI" secara manual)` };
    if (target.checked) return { ok: true, already: true };

    target.container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomSleep(350, 550);
    await humanClick(target.radio.tagName === 'INPUT' ? (target.radio.closest('label') || target.radio) : target.radio);
    await sleep(getJitterDelay(stepDelay));

    opts = getKbliOptions(questionEl);
    let now = opts.find(o => o.code === code);
    if (!now || !now.checked) {
      // Coba klik teks opsinya
      await humanClick(target.el);
      await sleep(getJitterDelay(stepDelay));
      opts = getKbliOptions(questionEl);
      now = opts.find(o => o.code === code);
    }
    if (!now || !now.checked) return { ok: false, reason: `Gagal memilih KBLI ${code} pada 13.g` };
    return { ok: true };
  }

  // ---------- 13.g via "Pilih dari Master KBLI" (dropdown pencarian) ----------
  const KBLI_IN_TEXT = /\[[A-Z]\]\s*\[?\s*(\d{5})\s*\]?/;

  // Baris pertanyaan "Pilih dari Master KBLI" (label kiri + kotak pencarian), bukan opsi radio di 13.g
  function findMasterKbliRow() {
    const nodes = Array.from(document.querySelectorAll('div, span, label, p'));
    for (const el of nodes) {
      if (el.closest('#fasih-custom-confirm-panel, .fasih-form-sidebar')) continue;
      const t = normalizeFasihText((el.textContent || '').trim());
      if (t !== 'pilih dari master kbli') continue;
      if (el.closest('[role="radiogroup"], label') && el.closest('[role="radiogroup"], label').querySelector('input[type="radio"], [role="radio"]')) continue;
      const row = getQuestionRowFromElement(el);
      if (!row) continue;
      if (/\b13\s*\.?\s*g\b/.test(normalizeFasihText(row.innerText || ''))) continue;
      if (row.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), [role="combobox"]')) return row;
    }
    return null;
  }

  function readMasterKbli(row) {
    const f = findMasterKbliField();
    if (f && f.code) return f.code;
    if (!row) return null;
    const input = row.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])');
    const m = String((input && input.value) || row.innerText || '').match(KBLI_IN_TEXT);
    return m ? m[1] : null;
  }

  // Kotak Master KBLI: nilainya berformat "[A][01121]Pertanian Padi Hibrida" (kurung ganda),
  // berbeda dari radio rekomendasi "[A] 01121 ...". Dicari langsung tanpa bergantung pada struktur baris.
  const MASTER_VALUE_RE = /\[([A-Z])\]\s*\[\s*(\d{5})\s*\]/;
  function isInDropdown(el) {
    return Boolean(el.closest('[role="listbox"], [role="option"], [data-kb-option], [data-popper-placement], [data-radix-popper-content-wrapper], [role="dialog"]'));
  }
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function comboContainer(input) {
    let c = input;
    for (let i = 0; i < 4 && c && c.parentElement; i++) {
      c = c.parentElement;
      if (c.querySelector('button') && c.querySelectorAll('textarea, input:not([type="radio"])').length === 1) return c;
    }
    return input.parentElement;
  }
  // Struktur asli FASIH: <div id="kbli#1001"> ... <textarea placeholder="[A][01121]Pertanian Padi Hibrida">
  // Nilai terpilih ditampilkan sebagai PLACEHOLDER textarea (isi .value kosong).
  const FIELD_SEL = 'textarea, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="button"]):not([type="submit"])';
  function fieldCode(el) {
    if (!el) return null;
    const m = String(el.value || '').match(MASTER_VALUE_RE) || String(el.getAttribute('placeholder') || '').match(MASTER_VALUE_RE);
    return m ? m[2] : null;
  }
  function findMasterKbliField() {
    // 1. Kontainer resmi FASIH id="kbli#..."
    for (const box of Array.from(document.querySelectorAll('[id^="kbli#"], [id^="kbli"]'))) {
      if (!isVisible(box) || isInDropdown(box)) continue;
      const fld = box.querySelector(FIELD_SEL);
      if (!fld) continue;
      return { code: fieldCode(fld), input: fld, container: box, via: 'kbli#' };
    }
    // 2. Kotak isian mana pun yang value/placeholder-nya berformat [A][01121]
    for (const fld of Array.from(document.querySelectorAll(FIELD_SEL))) {
      if (isInDropdown(fld)) continue;
      const code = fieldCode(fld);
      if (code) return { code, input: fld, container: comboContainer(fld), via: 'field' };
    }
    // 3. Potongan teks di halaman
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.nodeValue || '';
      if (txt.indexOf('[') === -1) continue;
      const m = txt.match(MASTER_VALUE_RE);
      if (!m) continue;
      const el = node.parentElement;
      if (!el || isInDropdown(el) || el.closest('.fasih-form-sidebar, #fasih-custom-confirm-panel, script, style, noscript') || txt.length > 300) continue;
      let c = el, input = null;
      for (let i = 0; i < 6 && c && !input; i++) { c = c.parentElement; input = c && c.querySelector(FIELD_SEL); }
      return { code: m[2], input, container: input ? comboContainer(input) : el.parentElement, via: 'text' };
    }
    const row = findMasterKbliRow();
    const input = row && row.querySelector(FIELD_SEL);
    return input ? { code: null, input, container: comboContainer(input), via: 'empty' } : null;
  }

  // KBLI yang sedang terpilih di 13.g: dari radio rekomendasi, atau dari kotak Master KBLI
  function getCurrentKbli(qEl) {
    const opts = qEl ? getKbliOptions(qEl) : [];
    const checked = opts.find(o => o.checked);
    if (checked) return { code: checked.code, source: 'radio' };
    const f = findMasterKbliField();
    if (f && f.code) return { code: f.code, source: 'master' };
    return null;
  }

  // Radio "Pilih dari Master KBLI" di dalam 13.g
  function findMasterRadio(qEl) {
    const row = getQuestionRowFromElement(qEl);
    if (!row) return null;
    const lbl = Array.from(row.querySelectorAll('label, div, span')).find(el => normalizeFasihText((el.textContent || '').trim()) === 'pilih dari master kbli');
    if (!lbl) return null;
    let c = lbl;
    for (let i = 0; i < 5 && c && c !== row; i++) {
      const r = c.querySelector('input[type="radio"], [role="radio"]');
      if (r) return { radio: r, label: lbl, checked: (r.checked || r.getAttribute('aria-checked') === 'true' || r.hasAttribute('data-checked')) };
      c = c.parentElement;
    }
    return { radio: null, label: lbl, checked: false };
  }

  async function typeIntoInput(input, text) {
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    const setVal = (v) => { setter ? setter.call(input, v) : (input.value = v); };
    input.focus();
    await randomSleep(150, 260);
    setVal('');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let cur = '';
    for (const ch of text) {
      await checkAbortOrPause();
      cur += ch;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      setVal(cur);
      try { input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' })); } catch (e) { input.dispatchEvent(new Event('input', { bubbles: true })); }
      input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
      await randomSleep(60, 130);
    }
  }

  function findKbliListOption(code) {
    const nodes = Array.from(document.querySelectorAll('[role="option"], [data-kb-option], [role="listbox"] li, [role="listbox"] > div, ul[id*="listbox"] li'));
    const byRole = nodes.filter(isVisible).find(n => {
      const m = (n.innerText || n.textContent || '').match(KBLI_IN_TEXT);
      return m && m[1] === code;
    });
    if (byRole) return byRole;
    // Cadangan: teks opsi "[A][01122]Pertanian Padi Inbrida" di daftar melayang -> elemen paling spesifik
    const field = findMasterKbliField();
    const cands = Array.from(document.querySelectorAll('span, div, p, li, button, a'))
      .filter(el => isVisible(el) && !el.closest('script, style, noscript, textarea') && (el.textContent || '').length < 400)
      .filter(el => !(field && field.container && field.container.contains(el)))
      .filter(el => {
        const t = (el.textContent || '').trim();
        const m = t.match(MASTER_VALUE_RE);
        return m && m[2] === code && (t.match(/\[[A-Z]\]\s*\[\s*\d{5}\s*\]/g) || []).length === 1;
      })
      .sort((x, y) => (x.textContent || '').length - (y.textContent || '').length);
    for (const el of cands) {
      let target = el.closest('[role="option"], li, [data-kb-option], [class*="option"], [class*="cursor-pointer"]') || el;
      if (target === document.body || target === document.documentElement) continue;
      if (((target.textContent || '').match(/\[[A-Z]\]\s*\[\s*\d{5}\s*\]/g) || []).length > 1) target = el;
      return target;
    }
    return null;
  }

  async function selectKbliViaMaster(qEl, code, stepDelay) {
    // 1. Pastikan radio "Pilih dari Master KBLI" terpilih
    const mr = findMasterRadio(qEl);
    if (mr && !mr.checked) {
      await humanClick(mr.radio && mr.radio.tagName !== 'INPUT' ? mr.radio : mr.label);
      await sleep(getJitterDelay(stepDelay));
    }
    const field = await waitForElement(() => { const f = findMasterKbliField(); return f && f.input ? f : null; }, 8000);
    if (!field) return { ok: false, reason: 'Kotak "Pilih dari Master KBLI" tidak ditemukan' };
    if (field.code === code) return { ok: true, already: true };

    const input = field.input;
    if (input.disabled || input.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'Kotak Master KBLI terkunci (dokumen tidak dalam mode edit)' };
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomSleep(350, 550);

    // 2. Kosongkan pilihan lama (tombol ×) bila ada, lalu klik kotak dan ketik kode KBLI tujuan
    const clearBtn = field.container && Array.from(field.container.querySelectorAll('button')).find(b => {
      if (b.disabled || b.getAttribute('title') === 'Catatan' || b.getAttribute('aria-label') === 'Catatan') return false;
      const t = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${(b.textContent || '').trim()}`.toLowerCase();
      if (t.includes('reset')) return true;
      const svg = b.querySelector('svg');
      return /clear|hapus|×|✕/.test(t) || (svg && /icon-x\b|tabler-icon-x(?!-)/.test(svg.getAttribute('class') || ''));
    });
    if (clearBtn) {
      await humanClick(clearBtn);
      await randomSleep(400, 700);
    }
    const liveInput = (findMasterKbliField() || field).input || input;
    await humanClick(liveInput);
    await randomSleep(400, 700);
    await typeIntoInput(liveInput, code);

    // 3. Pilih opsi yang memuat kode tersebut
    let opt = await waitForElement(() => findKbliListOption(code), 10000);
    if (!opt) {
      const trigger = field.container && (field.container.querySelector('button[aria-haspopup]') ||
        Array.from(field.container.querySelectorAll('button')).find(b => b !== clearBtn && b.getAttribute('title') !== 'Catatan' && b.getAttribute('title') !== 'Tampilan Batch'));
      if (trigger) { await humanClick(trigger); await randomSleep(600, 900); await typeIntoInput(liveInput, code); }
      opt = await waitForElement(() => findKbliListOption(code), 8000);
    }
    if (!opt) return { ok: false, reason: `KBLI ${code} tidak muncul di daftar Master KBLI setelah diketik` };
    opt.scrollIntoView({ block: 'nearest' });
    await humanClick(opt);
    await sleep(getJitterDelay(stepDelay));

    // 4. Verifikasi
    let now = (findMasterKbliField() || {}).code;
    if (now !== code) {
      liveInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await sleep(getJitterDelay(stepDelay));
      now = (findMasterKbliField() || {}).code;
    }
    if (now !== code) return { ok: false, reason: `Master KBLI tidak berubah ke ${code} (terbaca: ${now || '-'})` };
    return { ok: true };
  }

  async function processKbliForCurrentUnit(t, options, usahaName, indexStr) {
    const stepDelay = options.stepDelay || 1500;
    smoothScrollToTop();
    await randomSleep(250, 400);
    const qEl = await findTargetQuestionWithDynamicScroll(findQuestion13gKbliElement, '13.g');
    if (!qEl) return { matched: false, note: `13.g Kode KBLI tidak ditemukan pada ${usahaName}` };

    // Nilai Master KBLI dimuat dari server setelah unit usaha dibuka: tunggu sampai terbaca (maks. 15 detik)
    qEl.scrollIntoView({ behavior: 'auto', block: 'center' });
    let current = await waitForElement(() => getCurrentKbli(findQuestion13gKbliElement() || qEl), 15000, 500);
    if (!current) {
      const mf = findMasterKbliField();
      if (mf && mf.input) { mf.input.scrollIntoView({ behavior: 'auto', block: 'center' }); await randomSleep(1200, 1800); }
      current = getCurrentKbli(findQuestion13gKbliElement() || qEl);
    }
    if (!current) {
      const mf = findMasterKbliField();
      const detail = mf ? `kotak Master ditemukan (${mf.via}) tetapi nilainya "${String(mf.input && mf.input.value || '').slice(0, 40)}"` : 'kotak Master tidak ditemukan';
      return { matched: false, note: `KBLI terpilih pada ${usahaName} tidak terbaca [${detail}; versi 16e]` };
    }

    const isAwal = current.code === t.kbliAwal;
    const isSudahTujuan = t.gantiKbli && current.code === t.kbliTujuan; // proses ulang setelah KBLI sempat diganti
    if (!isAwal && !isSudahTujuan) {
      return { matched: false, note: `${usahaName}: KBLI ${current.code} (bukan ${t.kbliAwal})` };
    }

    if (t.gantiKbli && !isSudahTujuan) {
      notifyStep('KBLI_CHANGE', `[${indexStr}] ${usahaName}: mengganti KBLI ${current.code} → ${t.kbliTujuan}...`, 'progress');
      const inRadio = getKbliOptions(qEl).some(o => o.code === t.kbliTujuan);
      let sel;
      if (inRadio) {
        sel = await selectKbliOption(qEl, t.kbliTujuan, stepDelay);
      } else {
        notifyStep('KBLI_MASTER', `[${indexStr}] KBLI ${t.kbliTujuan} dipilih lewat "Pilih dari Master KBLI"...`, 'progress');
        sel = await selectKbliViaMaster(findQuestion13gKbliElement() || qEl, t.kbliTujuan, stepDelay);
      }
      if (!sel.ok) return { matched: true, error: sel.reason };
      const after = getCurrentKbli(findQuestion13gKbliElement() || qEl);
      if (!after || after.code !== t.kbliTujuan) return { matched: true, error: `Setelah diganti, KBLI terbaca ${after ? after.code : '-'} (bukan ${t.kbliTujuan})` };
    } else {
      notifyStep('KBLI_KEEP', `[${indexStr}] ${usahaName}: KBLI ${current.code} sudah sesuai.`, 'progress');
    }

    const catatan = options.catatanKbliDiganti || '#DC_01';
    const qElAfter = findQuestion13gKbliElement() || qEl;
    const okComment = await fillCommentForTargetQuestion({
      questionEl: qElAfter,
      targetCode: '13.g',
      targetLabel: '13. g. Kode KBLI',
      effectiveComment: catatan,
      isSecondary: false,
      exactCodeOnly: true,
      stepDelay,
      indexStr,
      closeModalOnExisting: Boolean(options.isActiveTabTest) && isSudahTujuan
    });
    if (!okComment) return { matched: true, error: `Catatan ${catatan} gagal diisi pada 13.g (${usahaName})` };
    return {
      matched: true,
      changed: t.gantiKbli && !isSudahTujuan,
      alreadyExists: Boolean(okComment.alreadyExists),
      foundCode: okComment.foundCode || catatan,
      catatan
    };
  }

  // Ambil ID periode survei dari halaman /app/assignment-detail/<id> lalu bentuk URL edit
  function buildEditUrlFromDetailPage() {
    const m = window.location.pathname.match(/\/assignment-detail\/([0-9a-f-]{36})/i);
    if (!m) return null;
    const assignmentId = m[1];
    const nodes = Array.from(document.querySelectorAll('div, span, p, dt, label'));
    for (const el of nodes) {
      if ((el.textContent || '').trim().toUpperCase() !== 'PERIODE SURVEI') continue;
      const scope = el.parentElement || el;
      const uuid = (scope.textContent || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuid && uuid[0].toLowerCase() !== assignmentId.toLowerCase()) {
        return `${window.location.origin}/app/assignment/${uuid[0]}/${assignmentId}/edit`;
      }
    }
    return null;
  }

  // ===================== DIAGNOSA (baca-saja, tidak mengklik apa pun) =====================
  function diagnosePage() {
    const safe = (fn, dflt = null) => { try { return fn(); } catch (e) { return dflt; } };
    const label = (el) => el ? (el.getAttribute('title') || el.getAttribute('aria-label') || (el.innerText || el.textContent || '')).replace(/\s+/g, ' ').trim().slice(0, 80) : null;

    const q13 = safe(() => findQuestion13gKbliElement());
    const opts = q13 ? safe(() => getKbliOptions(q13), []) : [];
    const units = safe(() => getBusinessItems(), []) || [];
    const nilaiTargets = safe(() => getTargetQuestionsList({ dc0Target: 'nilai', commentText: '#DC_00' }), []) || [];
    const nilaiFound = nilaiTargets.map(t => ({ code: t.code, found: Boolean(safe(() => t.finder())) }));
    const approveBtn = safe(() => findApproveButton());
    const reviewBtn = safe(() => findEditButton());
    const kirimBtn = safe(() => findTopRightSubmitSurveyButton());

    // Tombol bulat ber-ikon (untuk mencari Approve / Reject bila tidak terdeteksi)
    const iconButtons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null && b.querySelector('svg') && (b.innerText || '').trim().length <= 2)
      .slice(0, 25)
      .map(b => ({
        label: label(b),
        svg: (b.querySelector('svg').getAttribute('class') || '').split(' ').filter(c => c.includes('icon')).join(' '),
        bg: getComputedStyle(b).backgroundColor
      }));

    // Potongan HTML di sekitar 13.g dan Master KBLI (untuk perbaikan presisi)
    const snip = (el, max = 6000) => {
      if (!el) return null;
      const clone = el.cloneNode(true);
      clone.querySelectorAll('svg').forEach(sv => { sv.innerHTML = ''; });
      clone.querySelectorAll('input').forEach(inp => inp.setAttribute('data-live-value', inp.value || ''));
      return clone.outerHTML.replace(/\s+/g, ' ').slice(0, max);
    };
    const masterLabel = Array.from(document.querySelectorAll('div, span, label, p')).find(el => normalizeFasihText((el.textContent || '').trim()) === 'pilih dari master kbli' && !el.querySelector('input'));
    let around = q13;
    for (let i = 0; i < 8 && around && masterLabel && !around.contains(masterLabel); i++) around = around.parentElement;
    const masterField = safe(() => findMasterKbliField());

    return {
      versi: 'TUNTAS-2026-10-19i',
      waktu: new Date().toISOString(),
      masterKbliVia: masterField ? masterField.via : null,
      htmlMasterKbli: snip(masterField && masterField.container ? masterField.container.parentElement : (masterLabel ? masterLabel.parentElement?.parentElement : null), 3000),
      html13gDanMaster: snip(around && around !== document.body ? around : (q13 ? q13.parentElement?.parentElement : null)),
      url: window.location.href,
      isEditUrl: checkIsEditUrl(window.location.href),
      isDetailPage: isAssignmentDetailUrl(window.location.href),
      editUrlDariHalaman: safe(() => buildEditUrlFromDetailPage()),
      formOpen: Boolean(safe(() => isAnyFormBlockPresent())),
      isUB: Boolean(safe(() => isUBQuestionnaire())),
      blokII: Boolean(safe(() => findBlockIIButton())),
      unitUsaha: units.map(u => label(u)),
      tahunOperasi_R25: safe(() => getQuestion25Year()),
      target: { code: (nilaiFound.find(t => t.found) || {}).code || null, found: nilaiFound.some(t => t.found), detail: nilaiFound },
      sso: {
        isLoginPage: Boolean(safe(() => isLoginPage())),
        hasSsoEksternalBtn: Boolean(safe(() => findSsoEksternalButton())),
        hasEmailInput: Boolean(safe(() => findSsoEmailInput())),
        hasPasswordInput: Boolean(safe(() => findSsoPasswordInput())),
        hasSubmitBtn: Boolean(safe(() => findSsoSubmitButton())),
        sessionExpiredDetected: Boolean(safe(() => findSessionExpiredElement()))
      },
      q13g: {
        found: Boolean(q13),
        text: q13 ? label(q13) : null,
        options: opts.map(o => `${o.code}${o.checked ? ' (terpilih)' : ''}`),
        selected: q13 ? (safe(() => getCurrentKbli(q13)) || {}).code || null : null,
        sumberKbli: q13 ? (safe(() => getCurrentKbli(q13)) || {}).source || null : null,
        masterKbliBox: Boolean(safe(() => findMasterKbliField())),
        masterKbliValue: (safe(() => findMasterKbliField()) || {}).code || null,
        commentButton: Boolean(q13 && safe(() => findCommentButtonForQuestion(q13, '13.g')))
      },
      kirimButton: Boolean(kirimBtn),
      reviewButton: Boolean(reviewBtn && /review/i.test(label(reviewBtn) || '')),
      approveButton: Boolean(approveBtn),
      approveLabel: label(approveBtn),
      iconButtons
    };
  }

  // ===================== APPROVE (halaman review assignment) =====================
  function findApproveButton() {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    // 1. Label eksplisit
    for (const b of buttons) {
      const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.getAttribute('data-tooltip') || ''}`.toLowerCase();
      if (label.includes('approve') && b.offsetParent !== null && !b.disabled) return b;
    }
    // 2. Tombol bulat hijau berisi ikon centang (tooltip "Approve")
    for (const b of buttons) {
      if (b.disabled || b.offsetParent === null) continue;
      const cls = (b.className && b.className.baseVal !== undefined ? b.className.baseVal : b.className) || '';
      const svg = b.querySelector('svg');
      if (!svg) continue;
      const svgCls = svg.getAttribute('class') || '';
      const isCheck = svgCls.includes('tabler-icon-check') && !svgCls.includes('checks') && !svgCls.includes('circle');
      const rgb = (getComputedStyle(b).backgroundColor.match(/\d+/g) || []).map(Number);
      const greenBg = rgb.length >= 3 && rgb[1] > rgb[0] + 40 && rgb[1] > rgb[2] + 30;
      const isGreen = /green|success|emerald/.test(cls) || greenBg;
      if (isCheck && isGreen) return b;
    }
    return null;
  }

  function isSubmitSuccessVisible() {
    const text = (document.body ? document.body.innerText || '' : '').toLowerCase();
    return text.includes('berhasil disubmit') || text.includes('perubahan anda berhasil disimpan');
  }

  // Tombol di toolbar melayang kanan (← · info · ✕ Reject · ✓ Approve · ✎ Edit). Nama tombol hanya
  // muncul sebagai tooltip saat disorot, jadi tombol dicari dengan cara menyorotnya satu per satu.
  function isInFloatingToolbar(el) {
    if (!el || el.closest('header, nav')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.top < 70) return false;
    let n = el;
    for (let i = 0; i < 8 && n && n !== document.body; i++) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
      n = n.parentElement;
    }
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
    if (String(cls).includes('rounded-full') && rect.left > window.innerWidth * 0.5) return true;
    return false;
  }

  function visibleTooltipText() {
    const nodes = Array.from(document.querySelectorAll('[role="tooltip"], [data-kb-tooltip-content], [data-radix-popper-content-wrapper], [data-popper-placement], [class*="tooltip"]'));
    return nodes
      .filter(n => n.offsetParent !== null || getComputedStyle(n).position === 'fixed')
      .map(n => (n.innerText || n.textContent || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function hoverEvents(el, enter) {
    const types = enter ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'focus'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave', 'blur'];
    for (const t of types) {
      try {
        if (t === 'focus') el.focus && el.focus();
        else if (t === 'blur') el.blur && el.blur();
        else el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
    }
  }

  async function findApproveButtonDeep() {
    const direct = findApproveButton();
    if (direct) return direct;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(b => b.offsetParent !== null && !b.disabled && b.querySelector('svg') && (b.innerText || '').trim().length <= 2 && isInFloatingToolbar(b))
      .slice(0, 12);
    for (const b of candidates) {
      hoverEvents(b, true);
      await sleep(320);
      const tips = visibleTooltipText();
      hoverEvents(b, false);
      await sleep(80);
      if (tips.some(t => t === 'approve' || t.startsWith('approve'))) return b;
    }
    return null;
  }

  async function executeApprove(options = {}) {
    const stepDelay = options.stepDelay || 1500;

    // Dari modal sukses kirim: klik "Kembali ke Review" seperti pengguna
    const backToReview = Array.from(document.querySelectorAll('button, a')).find(b => /kembali ke review/i.test((b.innerText || b.textContent || '').trim()));
    if (backToReview) {
      notifyStep('APPROVE_NAV', 'Mengklik "Kembali ke Review"...', 'progress');
      await humanClick(backToReview);
      await sleep(getJitterDelay(Math.max(stepDelay, 2000)));
    }

    notifyStep('APPROVE_WAIT', 'Mencari tombol Approve di toolbar kanan...', 'progress');
    let btn = null;
    const start = Date.now();
    let checkedAfterToolbarReady = 0;
    while (!btn && Date.now() - start < 8000) {
      await checkAbortOrPause();
      btn = await findApproveButtonDeep();
      if (btn) break;

      const hasToolbarButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
        .some(b => b.offsetParent !== null && b.querySelector('svg') && isInFloatingToolbar(b));
      if (hasToolbarButtons && (isAnyFormBlockPresent() || Date.now() - start > 3500)) {
        checkedAfterToolbarReady++;
        if (checkedAfterToolbarReady >= 2) break;
      }
      await sleep(500);
    }
    if (!btn) {
      notifyStep('APPROVE_SKIP', 'Tombol Approve tidak muncul. Langsung menutup tab & lanjut baris berikutnya...', 'warning');
      return {
        success: false,
        noApproveButton: true,
        error: 'Tombol Approve tidak muncul di halaman review'
      };
    }

    hoverEvents(btn, true);
    await randomSleep(300, 500);
    notifyStep('APPROVE_CLICK', 'Mengklik tombol Approve...', 'progress');
    await humanClick(btn);
    await sleep(getJitterDelay(Math.min(stepDelay, 1200)));

    // Dialog konfirmasi (bila ada)
    const confirmTexts = ['approve', 'ya', 'ya, approve', 'konfirmasi', 'setuju', 'simpan', 'ok', 'lanjutkan'];
    const findDialogConfirm = () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [data-kb-dialog-content]'));
      for (const d of dialogs) {
        if (d.closest('#fasih-custom-confirm-panel')) continue;
        const b = Array.from(d.querySelectorAll('button')).find(x => confirmTexts.includes((x.textContent || '').trim().toLowerCase()) && !x.disabled);
        if (b) return b;
      }
      return null;
    };
    const dlgBtn = await waitForElement(findDialogConfirm, 4500);
    if (dlgBtn) {
      notifyStep('APPROVE_CONFIRM', `Mengonfirmasi Approve ("${(dlgBtn.textContent || '').trim()}")...`, 'progress');
      await humanClick(dlgBtn);
      await randomSleep(1000, 1500);
    } else {
      await randomSleep(800, 1200);
    }

    notifyStep('APPROVE_DONE', 'Approve selesai.', 'success');
    return { success: true };
  }

  async function executeWorkflow(options = {}) {
    const kbliTask = options.kbliTask || null;
    const commentText = options.commentText || '#DC_00';
    const stepDelay = options.stepDelay || 1500;
    const autoSubmitSurvey = options.autoSubmitSurvey !== false;

    notifyStep('START', 'Memulai alur otomatisasi FASIH...');

    // 0. Deteksi dini apakah server BPS sedang down (500, 502, 503, 504, maintenance)
    const earlyServerDown = detectServerDownOrErrorPage();
    if (earlyServerDown) {
      notifyStep('SERVER_DOWN', earlyServerDown, 'error');
      return {
        success: false,
        isServerDown: true,
        error: earlyServerDown
      };
    }

    // STEP 0-SSO: Deteksi apakah halaman saat ini adalah Login / SSO BPS
    if (options.autoSsoLogin !== false && (isLoginPage() || findSsoEksternalButton() || findSessionExpiredElement())) {
      notifyStep('STEP_SSO', 'Sesi login dibutuhkan. Memproses login SSO Eksternal...', 'progress');
      const ssoRes = await handleSsoLogin(options);
      if (ssoRes && ssoRes.success) {
        const currentUrl = window.location.href;
        const targetUrl = options.targetUrl || getEditUrl(currentUrl) || '';
        notifyStep('STEP_SSO_REDIRECT', `Tahap login SSO selesai. Melanjutkan ke: ${targetUrl || 'FASIH'}`, 'progress');
        return { success: true, needRedirectEdit: true, ssoStage: ssoRes.ssoStage, editUrl: targetUrl };
      } else {
        return {
          success: false,
          error: ssoRes?.error || 'Gagal login SSO otomatis.'
        };
      }
    }

    // STEP 0b: Halaman 404 (link salah / format link tidak mendukung /edit)
    if (detectNotFoundPage()) {
      notifyStep('NOT_FOUND', `Halaman FASIH 404 Not Found: ${window.location.href}`, 'error');
      return {
        success: false,
        error: 'Halaman 404 Not Found. Periksa link_fasih_sm (link assignment-detail tidak bisa ditambah /edit).'
      };
    }

    // STEP 0c: Halaman /app/assignment-detail/<id> -> bentuk URL edit dari PERIODE SURVEI
    if (isAssignmentDetailUrl(window.location.href)) {
      notifyStep('STEP_1', 'Halaman detail assignment. Membaca periode survei untuk membuka mode edit...', 'progress');
      const detailOrSso = await waitForElement(() => {
        if (options.autoSsoLogin !== false && (findSsoEksternalButton() || findSsoPasswordInput() || findSessionExpiredElement() || isLoginPage())) {
          return { type: 'SSO' };
        }
        const u = buildEditUrlFromDetailPage();
        return u ? { type: 'URL', url: u } : null;
      }, 15000);
      if (detailOrSso && detailOrSso.type === 'SSO') {
        notifyStep('STEP_SSO', 'Sesi login dibutuhkan. Memproses SSO Eksternal...', 'progress');
        const ssoRes = await handleSsoLogin(options);
        if (ssoRes && ssoRes.success) {
          const currentUrl = window.location.href;
          const targetUrl = options.targetUrl || getEditUrl(currentUrl) || '';
          return { success: true, needRedirectEdit: true, ssoStage: ssoRes.ssoStage, editUrl: targetUrl };
        }
      }
      if (detailOrSso && detailOrSso.url) {
        notifyStep('STEP_1_REDIRECT', `Membuka mode edit: ${detailOrSso.url}`, 'progress');
        return { success: true, needRedirectEdit: true, editUrl: detailOrSso.url };
      }
      notifyStep('STEP_1', 'Periode survei tidak terbaca. Mencoba tombol Review...', 'warning');
    }

    // STEP 1: Pembukaan Form / Penanganan Mode Edit
    const isEditUrl = checkIsEditUrl(window.location.href);
    const isActiveTab = options.isActiveTabTest === true;

    // Link /edit langsung -> tunggu form (sambil pantau jika tiba-tiba muncul tombol Lanjutkan dengan SSO Eksternal).
    if (isEditUrl) {
      notifyStep('STEP_1', 'Mode antrian / URL edit terdeteksi. Menunggu formulir kuisioner termuat...', 'progress');

      let formOrSso = await waitForElement(() => {
        if (isAnyFormBlockPresent()) return 'FORM';
        if (options.autoSsoLogin !== false && (findSsoEksternalButton() || findSsoPasswordInput() || findSessionExpiredElement() || isLoginPage())) return 'SSO';
        return null;
      }, 20000);

      if (!formOrSso) {
        await randomSleep(1800, 2600);
        if (isAnyFormBlockPresent()) formOrSso = 'FORM';
        else if (options.autoSsoLogin !== false && (findSsoEksternalButton() || findSsoPasswordInput() || findSessionExpiredElement() || isLoginPage())) formOrSso = 'SSO';
      }

      if (formOrSso !== 'FORM') {
        // Periksa apakah halaman meminta login SSO saat menunggu form
        if (formOrSso === 'SSO' || (options.autoSsoLogin !== false && (isLoginPage() || findSsoEksternalButton() || findSessionExpiredElement()))) {
          notifyStep('STEP_SSO', 'Sesi login dibutuhkan saat menunggu form. Memproses SSO Eksternal...', 'progress');
          const ssoRes = await handleSsoLogin(options);
          if (ssoRes && ssoRes.success) {
            const currentUrl = window.location.href;
            const targetUrl = options.targetUrl || getEditUrl(currentUrl) || '';
            return { success: true, needRedirectEdit: true, ssoStage: ssoRes.ssoStage, editUrl: targetUrl };
          }
        }

        // Periksa apakah gagal karena server down di tengah pemuatan
        const downMsg = detectServerDownOrErrorPage();
        if (downMsg) {
          notifyStep('SERVER_DOWN', downMsg, 'error');
          return {
            success: false,
            isServerDown: true,
            error: downMsg
          };
        }

        notifyStep('SKIPPED', 'Formulir kuisioner tidak terbuka setelah 20 detik pada URL /edit. Melewati...', 'warning');
        return {
          success: true,
          skipped: true,
          reason: 'Formulir kuisioner tidak terbuka pada URL /edit'
        };
      }
      notifyStep('STEP_1', 'Formulir kuisioner berhasil termuat!', 'progress');
    } else {
      // KASUS 2: Pengujian di Tab Aktif / Halaman non-edit (atau Beranda pasca-login SSO)
      notifyStep('STEP_1', (isActiveTab ? 'Pengujian tab aktif' : 'Halaman non-edit') + ': Memeriksa status halaman...', 'progress');
      await sleep(getJitterDelay(Math.min(stepDelay, 1000)));

      // Cek segera apakah halaman ini adalah halaman Login SSO ("Selamat Datang Kembali")
      if (options.autoSsoLogin !== false && (findSsoEksternalButton() || findSsoPasswordInput() || findSessionExpiredElement() || isLoginPage())) {
        notifyStep('STEP_SSO', 'Sesi login dibutuhkan. Memproses SSO Eksternal...', 'progress');
        const ssoRes = await handleSsoLogin(options);
        if (ssoRes && ssoRes.success) {
          const currentUrl = window.location.href;
          const targetUrl = options.targetUrl || getEditUrl(currentUrl) || '';
          return { success: true, needRedirectEdit: true, ssoStage: ssoRes.ssoStage, editUrl: targetUrl };
        }
      }

      // Jika mendarat di Beranda / halaman umum FASIH setelah login SSO (bukan halaman /assignment/ atau /assignment-detail/)
      // dan kita memiliki options.targetUrl, langsung buka link edit tanpa menunggu!
      if (
        !isAnyFormBlockPresent() &&
        options.targetUrl &&
        !checkIsEditUrl(window.location.href) &&
        !isAssignmentDetailUrl(window.location.href) &&
        !/\/assignment\//i.test(window.location.pathname)
      ) {
        notifyStep('STEP_1_REDIRECT', `Login berhasil. Langsung membuka link edit: ${options.targetUrl}`, 'progress');
        return {
          success: true,
          needRedirectEdit: true,
          editUrl: options.targetUrl
        };
      }

      // Cek apakah formulir sudah langsung terbuka
      let formReady = isAnyFormBlockPresent();
      if (formReady) {
        notifyStep('STEP_1', 'Formulir sudah berada dalam mode pengisian. Melanjutkan...');
      } else {
        notifyStep('STEP_1', 'Mencari tombol Review / Edit...', 'progress');
        let editOrSso = await waitForElement(() => {
          if (options.autoSsoLogin !== false && (findSsoEksternalButton() || findSsoPasswordInput() || findSessionExpiredElement() || isLoginPage())) {
            return { type: 'SSO' };
          }
          const b = findEditButton();
          return b ? { type: 'EDIT', btn: b } : null;
        }, 8000);

        if (editOrSso && editOrSso.type === 'EDIT' && editOrSso.btn) {
          notifyStep('STEP_1', 'Tombol Review / Edit ditemukan. Mengklik...', 'progress');
          await humanClick(editOrSso.btn);
          await sleep(getJitterDelay(stepDelay));
          formReady = await waitForElement(isAnyFormBlockPresent, 20000);
        }

        // Jika tombol Edit tidak ada ATAU setelah diklik formulir belum muncul:
        if (!formReady) {
          // Periksa apakah halaman meminta login SSO
          if ((editOrSso && editOrSso.type === 'SSO') || (options.autoSsoLogin !== false && (isLoginPage() || findSsoEksternalButton() || findSessionExpiredElement()))) {
            notifyStep('STEP_SSO', 'Sesi login dibutuhkan. Memproses SSO Eksternal...', 'progress');
            const ssoRes = await handleSsoLogin(options);
            if (ssoRes && ssoRes.success) {
              const currentUrl = window.location.href;
              const targetUrl = options.targetUrl || getEditUrl(currentUrl) || '';
              return { success: true, needRedirectEdit: true, ssoStage: ssoRes.ssoStage, editUrl: targetUrl };
            }
          }

          const currentUrl = window.location.href;
          const targetEditUrl = options.targetUrl || getEditUrl(currentUrl);
          if (!checkIsEditUrl(currentUrl) && targetEditUrl) {
            notifyStep('STEP_1_REDIRECT', `Mengalihkan ke URL /edit: ${targetEditUrl}...`, 'progress');
            return {
              success: true,
              needRedirectEdit: true,
              editUrl: targetEditUrl
            };
          } else if (findApproveButton()) {
            notifyStep('STEP_1_REVIEW', 'Halaman review terdeteksi (sudah terkirim sebelumnya). Melanjutkan ke tahap Approve...', 'progress');
            return {
              success: true,
              submitted: false,
              alreadySubmitted: true,
              reviewUrl: window.location.href.split('?')[0].split('#')[0]
            };
          } else {
            notifyStep('SKIPPED', 'Formulir tidak ditemukan setelah mencari tombol Edit pada tab aktif. Melewati...', 'warning');
            return {
              success: true,
              skipped: true,
              reason: 'Formulir tidak terbuka: tombol Review/Edit tidak ditemukan atau tidak membuka form'
            };
          }
        }
        notifyStep('STEP_1', 'Formulir kuisioner berhasil dibuka!', 'progress');
      }
    }

    // STEP 2: Menunggu halaman form kuisioner terbuka, lalu pilih menu blok yang sesuai
    const isUB = isUBQuestionnaire();
    let businessItems = [];

    if (kbliTask && (!/^\d{5}$/.test(kbliTask.kbliAwal || '') || !/^\d{5}$/.test(kbliTask.kbliTujuan || '') || kbliTask.kbliAwal === kbliTask.kbliTujuan)) {
      return { success: false, error: 'Data KBLI tidak valid (kbli_awal/kbli_tujuan kosong atau sama)' };
    }
    if (kbliTask && isUB) {
      return { success: false, error: 'Mode KBLI hanya untuk kuesioner non-UB (13.g Kode KBLI di BLOK II)' };
    }

    if (isUB) {
      notifyStep('STEP_2', 'Kuisioner SE2026 - UB terdeteksi. Menunggu menu BLOK I (IDENTITAS USAHA/PERUSAHAAN)...');
      let blockIBtn = await waitForElement(findBlockIButton, 15000);
      if (!blockIBtn) {
        throw new Error('Menu BLOK I (IDENTITAS USAHA/PERUSAHAAN) tidak ditemukan setelah menunggu 15 detik.');
      }
      notifyStep('STEP_2', 'Mengklik menu BLOK I (IDENTITAS USAHA/PERUSAHAAN)...', 'progress');
      await humanClick(blockIBtn);
      await sleep(getJitterDelay(stepDelay));

      // STEP 3 & 4 untuk SE2026 - UB: Form pertanyaan berada langsung di BLOK I
      notifyStep('STEP_3', 'BLOK I aktif. Memeriksa ketersediaan sub-item atau langsung ke pertanyaan 23. a...');
      let usahaHeader = findKeteranganUsahaHeader();
      if (usahaHeader) {
        let coll = findKeteranganUsahaCollapsible();
        const isExpanded = coll && (coll.hasAttribute('data-expanded') || coll.getAttribute('aria-expanded') === 'true');
        if (!isExpanded) {
          await humanClick(usahaHeader);
          await sleep(getJitterDelay(stepDelay));
        }
        businessItems = getBusinessItems();
      }

      if (businessItems.length === 0) {
        businessItems = [null]; // Langsung proses form BLOK I
        notifyStep('STEP_4', 'Memulai pencarian pertanyaan 23. a pada BLOK I...');
      } else {
        notifyStep('STEP_4', `Ditemukan ${businessItems.length} sub-item pada BLOK I.`);
      }
    } else {
      // Alur untuk kuisioner selain UB (Blok II)
      notifyStep('STEP_2', 'Menunggu menu BLOK II (KETERANGAN USAHA/PERUSAHAAN) muncul...');
      let blockIIBtn = await waitForElement(findBlockIIButton, 15000);
      if (!blockIIBtn) {
        throw new Error('Menu BLOK II tidak ditemukan setelah menunggu 15 detik.');
      }
      notifyStep('STEP_2', 'Mengklik menu BLOK II...', 'progress');
      await humanClick(blockIIBtn);
      await sleep(getJitterDelay(stepDelay));

      // STEP 3: Expand dropdown Keterangan Usaha/Perusahaan
      notifyStep('STEP_3', 'Mencari dropdown Keterangan Usaha/Perusahaan...');
      let usahaHeader = await waitForElement(findKeteranganUsahaHeader, 8000);
      if (usahaHeader) {
        let coll = findKeteranganUsahaCollapsible();
        const isExpanded = coll && (coll.hasAttribute('data-expanded') || coll.getAttribute('aria-expanded') === 'true' || coll.getAttribute('data-state') === 'open');
        if (!isExpanded) {
          notifyStep('STEP_3', 'Membuka (expand) dropdown Keterangan Usaha/Perusahaan...', 'progress');
          await humanClick(usahaHeader);
          await sleep(getJitterDelay(stepDelay));
        } else {
          notifyStep('STEP_3', 'Dropdown Keterangan Usaha/Perusahaan sudah terbuka.');
        }
      }

      // STEP 4: Ambil daftar unit usaha & pilih yang sesuai nama_usaha
      notifyStep('STEP_4', 'Mendeteksi daftar unit usaha di BLOK II...');
      await randomSleep(400, 650);
      businessItems = getBusinessItems();
      if (businessItems.length === 0 && usahaHeader) {
        // Coba klik sekali lagi header jika belum muncul
        await humanClick(usahaHeader);
        await sleep(getJitterDelay(stepDelay));
        businessItems = getBusinessItems();
      }

      // Jika ada targetUsaha spesifik dari Excel:
      if (options.targetUsaha) {
        let matchedUnits = filterBusinessItemsByName(businessItems, options.targetUsaha);
        if (!matchedUnits.length) {
          const directEl = findBusinessItemByTargetName(options.targetUsaha);
          if (directEl) matchedUnits = [directEl];
        }

        if (matchedUnits.length) {
          businessItems = matchedUnits;
          const chosenLabel = usahaLabel(businessItems[0]);
          notifyStep('STEP_4_SELECT', `Memilih unit usaha yang sesuai: "${chosenLabel}" (Target: "${options.targetUsaha}")...`, 'progress');
          await humanClick(businessItems[0]);
          await sleep(getJitterDelay(stepDelay));
        } else if (businessItems.length > 0) {
          const daftar = businessItems.map(usahaLabel).join(' | ');
          notifyStep('STEP_4_NO_UNIT', `Unit usaha "${options.targetUsaha}" tidak ditemukan. Tersedia: ${daftar}`, 'error');
          return { success: false, error: `Unit usaha "${options.targetUsaha}" tidak ditemukan di BLOK II (tersedia: ${daftar})` };
        } else {
          notifyStep('STEP_4_SINGLE', `Unit usaha spesifik tidak terdeteksi di sidebar, memproses formulir aktif untuk "${options.targetUsaha}"...`, 'progress');
          businessItems = [null];
        }
      } else if (businessItems.length === 0) {
        notifyStep('STEP_4_SINGLE', 'Tidak ditemukan sub-item usaha di dropdown. Memproses langsung formulir yang tampil...');
        businessItems = [null];
      } else {
        notifyStep('STEP_4', `Ditemukan ${businessItems.length} unit usaha. Memulai iterasi pengisian catatan...`);
      }
    }

    // STEP 5: Menuju pertanyaan target pada unit usaha terpilih
    const kbliProcessed = [];
    const kbliSkippedNotes = [];
    let dc0TargetsFound = 0;
    let newRemarksAdded = 0;
    let existingRemarksCount = 0;
    let lastFoundExistingCode = '';
    let lastFoundExistingReason = '';

    for (let i = 0; i < businessItems.length; i++) {
      await checkAbortOrPause();
      await ensureCommentModalClosed();

      let itemEl = businessItems[i];
      if (i > 0 && itemEl && !document.body.contains(itemEl)) {
        const freshItems = getBusinessItems();
        if (freshItems && freshItems[i]) itemEl = freshItems[i];
      }

      let usahaName = options.targetUsaha || `Unit Usaha #${i + 1}`;

      if (itemEl) {
        usahaName = usahaLabel(itemEl) || usahaName;
        if (businessItems.length > 1 || !options.targetUsaha) {
          notifyStep('STEP_5_SELECT', `[${i + 1}/${businessItems.length}] Mengklik: ${usahaName}...`, 'progress');
          await humanClick(itemEl);
          await sleep(getJitterDelay(stepDelay));
        }
      }

      if (kbliTask) {
        const r = await processKbliForCurrentUnit(kbliTask, options, usahaName, `${i + 1}/${businessItems.length}`);
        if (r.error) {
          notifyStep('KBLI_ERROR', r.error, 'error');
          return { success: false, error: `KBLI: ${r.error}` };
        }
        if (r.matched && r.alreadyExists && !r.changed) {
          existingRemarksCount++;
          lastFoundExistingCode = r.foundCode;
          lastFoundExistingReason = `Remark ${r.foundCode} sudah ada pada 13.g (${usahaName})`;
          notifyStep('STEP_5_ALREADY_EXISTS', `${lastFoundExistingReason}. Langsung tutup tab & lanjut baris berikutnya...`, 'warning');
          return {
            success: true,
            skipped: true,
            alreadyHasRemark: true,
            foundCode: r.foundCode,
            reason: `${lastFoundExistingReason} (dilewati)`
          };
        }
        if (r.matched) {
          newRemarksAdded++;
          kbliProcessed.push(`${usahaName}${r.changed ? ` (${kbliTask.kbliAwal}→${kbliTask.kbliTujuan})` : ''} ${r.catatan}`);
        } else if (r.note) {
          kbliSkippedNotes.push(r.note);
          notifyStep('KBLI_SKIP_UNIT', r.note, 'progress');
        }
        await randomSleep(400, 650);
        continue;
      }

      // Dapatkan seluruh daftar target pertanyaan untuk unit usaha ini (primer & sekunder/tambahan)
      const targetQuestions = getTargetQuestionsList(options);
      if (targetQuestions.length === 0) {
        return { success: false, error: 'Target catatan tidak tersedia untuk kuesioner ini (13.g Kode KBLI hanya ada di non-UB)' };
      }
      notifyStep('STEP_5_QUESTION', `[${i + 1}/${businessItems.length}] Memeriksa ${targetQuestions.length} pertanyaan target catatan untuk ${usahaName}...`);

      for (let qIdx = 0; qIdx < targetQuestions.length; qIdx++) {
        await checkAbortOrPause();
        const tq = targetQuestions[qIdx];
        const qIndexStr = `${i + 1}/${businessItems.length} (${qIdx + 1}/${targetQuestions.length})`;

        // Pastikan modal dari pertanyaan sebelumnya sudah benar-benar tertutup sebelum mencari target berikutnya
        await ensureCommentModalClosed();
        await randomSleep(200, 350);

        // Untuk target pertama ('a'), pastikan scroll selalu mulai dari bagian atas form agar tidak pernah terlewat
        if (qIdx === 0) {
          smoothScrollToTop();
          await randomSleep(200, 350);
        }

        notifyStep('STEP_5_FIND_Q', `[${qIndexStr}] Mencari ${tq.label}...`);
        // Pindai viewport secara dinamis agar pertanyaan target (terutama 'a') tidak pernah terskip!
        let qEl = await findTargetQuestionWithDynamicScroll(tq.finder, tq.code);

        if (qEl) dc0TargetsFound++;
        if (!qEl) {
          notifyStep('STEP_5_QUESTION_SKIP', `[${qIndexStr}] Pertanyaan ${tq.code} (${tq.label}) tidak ditemukan pada formulir. Melanjutkan ke target berikutnya...`, 'warning');
          continue;
        }

        notifyStep('STEP_5_QUESTION_FOUND', `[${qIndexStr}] Target catatan: ${tq.label}`, 'progress');

        const commentRes = await fillCommentForTargetQuestion({
          questionEl: qEl,
          targetCode: tq.code,
          targetLabel: tq.label,
          effectiveComment: tq.effectiveComment,
          isSecondary: tq.isSecondary,
          exactCodeOnly: tq.exactCodeOnly === true,
          stepDelay,
          indexStr: qIndexStr,
          closeModalOnExisting: Boolean(options.isActiveTabTest || options.closeTabOnComplete === false)
        });

        if (!commentRes) {
          const failMsg = `Gagal pemberian remark "${tq.effectiveComment}" pada ${tq.code} (${usahaName}): tombol Catatan atau modal catatan tidak terbuka.`;
          notifyStep('STEP_5_REMARK_FAIL', failMsg, 'error');
          return {
            success: false,
            error: failMsg
          };
        }

        if (commentRes && commentRes.alreadyExists) {
          existingRemarksCount++;
          lastFoundExistingCode = commentRes.foundCode;
          lastFoundExistingReason = `Remark ${commentRes.foundCode} sudah ada pada ${tq.code} (${usahaName})`;
          notifyStep('STEP_5_ALREADY_EXISTS', `${lastFoundExistingReason}. Langsung tutup tab & lanjut baris berikutnya...`, 'warning');
          if (options.isActiveTabTest || options.closeTabOnComplete === false) {
            await ensureCommentModalClosed();
          }
          return {
            success: true,
            skipped: true,
            alreadyHasRemark: true,
            foundCode: commentRes.foundCode,
            reason: `${lastFoundExistingReason} (dilewati)`
          };
        }

        newRemarksAdded++;

        // Pastikan modal ditutup sempurna sebelum lanjut ke pertanyaan berikutnya
        await ensureCommentModalClosed();
        await randomSleep(350, 600);
      }

      notifyStep('STEP_5_DONE_ITEM', `Catatan untuk unit usaha "${usahaName}" selesai diproses!`, 'progress');
      await randomSleep(400, 650);
    }

    // Jika semua unit usaha sudah memiliki remark sebelumnya: langsung tutup tab & lanjut baris berikutnya
    if (newRemarksAdded === 0 && existingRemarksCount > 0) {
      notifyStep('STEP_5_ALREADY_EXISTS', `${lastFoundExistingReason || 'Remark sudah ada sebelumnya'}. Langsung tutup tab & lanjut baris berikutnya...`, 'warning');
      return {
        success: true,
        skipped: true,
        alreadyHasRemark: true,
        foundCode: lastFoundExistingCode,
        reason: `${lastFoundExistingReason || 'Remark sudah ada'} (dilewati)`
      };
    }

    if (!kbliTask && dc0TargetsFound === 0) {
      notifyStep('DC0_NO_TARGET', 'Pertanyaan target catatan tidak ditemukan di unit usaha mana pun. Dokumen TIDAK dikirim.', 'error');
      return { success: false, error: `Pertanyaan target catatan (${options.dc0Target === 'kbli' ? '13.g Kode KBLI' : 'nilai produksi 27.a/31.a/23.a'}) tidak ditemukan` };
    }
    if (kbliTask && kbliProcessed.length === 0) {
      const why = kbliSkippedNotes.length ? kbliSkippedNotes.join(' | ') : 'tidak ada unit usaha terbaca';
      notifyStep('KBLI_NO_MATCH', `Tidak ada unit usaha dengan KBLI ${kbliTask.kbliAwal}. Dokumen TIDAK dikirim.`, 'error');
      return { success: false, error: `KBLI ${kbliTask.kbliAwal} tidak ditemukan di unit usaha mana pun (${why})` };
    }
    if (kbliTask) {
      notifyStep('KBLI_DONE', `KBLI diproses: ${kbliProcessed.join('; ')}`, 'progress');
    }

    notifyStep('STEP_5_ALL_DONE', 'Semua item usaha dan pertanyaan target telah selesai diberi catatan!');
    await sleep(getJitterDelay(stepDelay));
    await checkAbortOrPause();

    // STEP 5B: Buka Menu CATATAN di sidebar & Aktifkan Toggle "Tampilkan Anomali Usaha dan Keluarga"
    await handleCatatanAnomaliSection(stepDelay);
    await checkAbortOrPause();

    // MODAL KONFIRMASI MANUAL (Jika opsi checkbox diaktifkan)
    if (options.requireManualConfirm) {
      notifyStep('MANUAL_CONFIRM_WAIT', 'Menunggu konfirmasi manual dari pengguna untuk memeriksa kesesuaian...', 'warning');
      const userDecision = await showManualConfirmModal(kbliTask ? `${options.catatanKbliDiganti || '#DC_01'} (KBLI ${kbliTask.kbliAwal} → ${kbliTask.kbliTujuan})` : commentText);

      if (userDecision === 'STOP') {
        notifyStep('STOPPED_BY_USER', 'Pengguna menghentikan proses otomatisasi untuk periksa manual.', 'warning');
        return { success: false, stoppedByUser: true };
      }

      if (userDecision === 'SKIP') {
        notifyStep('SKIPPED_SUBMIT', 'Pengguna memilih melewati pengiriman survei (hanya simpan catatan).', 'progress');
        notifyStep('FINISHED', 'Pengisian catatan selesai (pengiriman dilewati sesuai konfirmasi pengguna).', 'success');
        return { success: true, skippedSubmit: true };
      }

      notifyStep('CONFIRMED', 'Pengguna mengonfirmasi yakin. Melanjutkan proses pengiriman survei...');
      await randomSleep(400, 650);
    }

    await checkAbortOrPause();

    // STEP 6: Klik tombol Kirim di pojok kanan atas
    if (autoSubmitSurvey) {
      notifyStep('STEP_6_TOP_SUBMIT', 'Mencari tombol Kirim di pojok kanan atas...', 'progress');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await randomSleep(500, 800);

      window.scrollTo({ top: 0, behavior: 'auto' });
      let topSubmitBtn = await waitForElement(findTopRightSubmitSurveyButton,
    readKirimModalGalat, 12000);
      if (!topSubmitBtn) {
        const reviewUrlNoKirim = window.location.href.split('?')[0].split('#')[0].replace(/\/+$/, '').replace(/\/edit$/, '');
        notifyStep('STEP_6_NO_KIRIM', 'Tombol Kirim tidak ada: dokumen kemungkinan sudah terkirim. Lanjut ke Approve.', 'warning');
        return {
          success: true,
          submitted: false,
          alreadySubmitted: true,
          reviewUrl: reviewUrlNoKirim,
          alreadyHasRemark: Boolean(existingRemarksCount > 0 && newRemarksAdded === 0),
          existingRemarkCode: lastFoundExistingCode,
          kbliSummary: kbliTask ? kbliProcessed.join('; ') : undefined
        };
      }

      notifyStep('STEP_6_TOP_SUBMIT_CLICK', 'Mengklik tombol Kirim survei...', 'progress');
      await humanClick(topSubmitBtn);
      await randomSleep(850, 1300);

      // Cek apakah ada tombol Kirim kedua/lanjutan yang muncul
      const secondaryKirimBtn = findSecondaryKirimButton(topSubmitBtn);
      if (secondaryKirimBtn) {
        notifyStep('STEP_6_SECONDARY_KIRIM', 'Menemukan tombol Kirim lanjutan. Mengklik tombol Kirim...', 'progress');
        await humanClick(secondaryKirimBtn);
        await randomSleep(850, 1300);
      }

      // Cek apakah ada alert / modal galat setelah klik Kirim
      const alertGalat = document.querySelector('[role="alertdialog"], [role="alert"], .tw\\:text-destructive');
      if (alertGalat) {
        const textGalat = (alertGalat.textContent || '').toLowerCase();
        if (textGalat.includes('galat') || textGalat.includes('belum diisi') || textGalat.includes('tidak valid')) {
          notifyStep('STEP_6_GALAT', `Terdeteksi peringatan galat pada formulir: "${alertGalat.textContent.trim().slice(0, 80)}"`, 'warning');
        }
      }

      // STEP 7: Konfirmasi modal kirim FASIH ("Konfirmasi Kirim" -> tombol "Konfirmasi")
      notifyStep('STEP_7_CONFIRM', 'Menunggu modal "Konfirmasi Kirim" dari FASIH...', 'progress');
      await randomSleep(650, 1050); // beri jeda agar animasi dialog selesai

      // Tunggu modal Konfirmasi Kirim (dengan deteksi dini jika seketika muncul galat/dialog error)
      let confirmBtn = null;
      const waitStart = Date.now();
      const maxWaitConfirmMs = 8000;

      let submitSuccess = isSubmitSuccessVisible();
      while (!submitSuccess && Date.now() - waitStart < maxWaitConfirmMs) {
        await checkAbortOrPause();
        if (isSubmitSuccessVisible()) { submitSuccess = true; break; }
        confirmBtn = findConfirmSubmitButton();
        if (confirmBtn) break;

        // Cek cepat apakah ada galat atau pesan penolakan yang muncul seketika
        const earlyGalat = detectFormGalatOrErrors();
        if (earlyGalat) {
          notifyStep('STEP_7_GALAT', `Pengiriman ditolak FASIH karena galat: ${earlyGalat}`, 'error');
          return {
            success: false,
            hasGalat: true,
            error: `GALAT: ${earlyGalat}`
          };
        }

        await sleep(350);
      }

      if (submitSuccess) {
        notifyStep('STEP_7_SUCCESS', 'FASIH: "Assignment Berhasil Disubmit".', 'progress');
      } else if (confirmBtn) {
        notifyStep('STEP_7_CONFIRM_CLICK', 'Mengklik tombol "Konfirmasi" pada modal konfirmasi kirim...', 'progress');
        
        // Klik tombol Konfirmasi
        confirmBtn.focus();
        await humanClick(confirmBtn);
        await randomSleep(1300, 1800);

        // Verifikasi apakah modal masih terbuka (jika masih terbuka, coba klik ulang)
        const stillOpenBtn = findConfirmSubmitButton();
        if (stillOpenBtn) {
          notifyStep('STEP_7_RETRY', 'Mencoba klik tombol "Konfirmasi" ulang...', 'progress');
          stillOpenBtn.focus();
          await humanClick(stillOpenBtn);
          stillOpenBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
          await randomSleep(1300, 1800);
        }

        // Tunggu respon server setelah konfirmasi
        await randomSleep(1800, 2500);

        if (!isSubmitSuccessVisible()) {
          // Periksa apakah setelah konfirmasi justru muncul pesan galat / toast error
          const postConfirmGalat = detectFormGalatOrErrors();
          if (postConfirmGalat) {
            notifyStep('STEP_7_GALAT_POST', `Gagal kirim survei: ${postConfirmGalat}`, 'error');
            return {
              success: false,
              hasGalat: true,
              error: `GALAT: ${postConfirmGalat}`
            };
          }

          // Periksa apakah modal konfirmasi masih macet terbuka (berarti submit ditolak server)
          const modalStuck = findConfirmSubmitButton();
          if (modalStuck) {
            const stuckGalat = detectFormGalatOrErrors() || 'Modal konfirmasi tetap terbuka, kemungkinan terjadi kegagalan jaringan atau validasi data.';
            notifyStep('STEP_7_MODAL_STUCK', `Gagal kirim survei: ${stuckGalat}`, 'error');
            return {
              success: false,
              hasGalat: true,
              error: `GALAT: ${stuckGalat}`
            };
          }
        }

        await sleep(getJitterDelay(Math.min(stepDelay, 1200)));
      } else {
        // Modal konfirmasi TIDAK MUNCUL! Cek galat atau isian wajib yang belum terisi
        const formGalat = detectFormGalatOrErrors();
        if (formGalat) {
          notifyStep('STEP_7_GALAT', `Pengiriman ditolak FASIH karena galat: ${formGalat}`, 'error');
          return {
            success: false,
            hasGalat: true,
            error: `GALAT: ${formGalat}`
          };
        }

        // Jika tidak ada teks error spesifik, tapi URL masih /edit dan modal konfirmasi tidak muncul
        if (checkIsEditUrl(window.location.href)) {
          notifyStep('STEP_7_FAIL_NO_MODAL', 'Gagal kirim: Modal konfirmasi kirim tidak muncul. Formulir kuisioner belum lengkap.', 'error');
          return {
            success: false,
            hasGalat: true,
            error: 'GALAT: Formulir belum lengkap atau isian wajib belum terisi (Modal konfirmasi tidak muncul)'
          };
        }

        notifyStep('STEP_7_NO_CONFIRM', 'Modal konfirmasi tidak muncul atau sudah otomatis terkirim.');
      }
    } else {
      notifyStep('STEP_6_SKIP_SUBMIT', 'Opsi auto-submit dinonaktifkan oleh pengaturan.');
    }

    // URL halaman review (tanpa /edit) untuk langkah Approve yang dijalankan terpisah oleh background.js
    const baseAssignUrl = /\/assignment\//i.test(window.location.href)
      ? window.location.href
      : (options.targetUrl || '');
    const reviewUrl = baseAssignUrl
      ? baseAssignUrl.split('?')[0].split('#')[0].replace(/\/+$/, '').replace(/\/edit$/i, '')
      : null;

    notifyStep('FINISHED', 'Kuesioner terkirim.', 'success');
    return {
      success: true,
      submitted: true,
      reviewUrl,
      kbliSummary: kbliTask ? kbliProcessed.join('; ') : undefined
    };
  }

  // ===================== MESSAGE LISTENER =====================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[TUNTAS] Message received:', request);

    if (request.action === 'STOP_WORKFLOW' || request.action === 'ABORT_WORKFLOW') {
      executionState.isAborted = true;
      executionState.isPaused = false;
      executionState.isRunning = false;

      // Hapus floating panel jika sedang tampil dan batalkan tunggu konfirmasi
      const panel = document.getElementById('fasih-custom-confirm-panel');
      if (panel) panel.remove();
      if (typeof activeManualConfirmResolver === 'function') {
        activeManualConfirmResolver('STOP');
        activeManualConfirmResolver = null;
      }

      notifyStep('STOPPED', 'Otomasi dihentikan seketika oleh pengguna (STOP).', 'warning');
      sendResponse({ status: 'STOPPED' });
      return false;
    }

    if (request.action === 'PAUSE_WORKFLOW') {
      executionState.isPaused = true;
      notifyStep('PAUSED', 'Otomasi dijeda oleh pengguna (PAUSE).', 'warning');
      sendResponse({ status: 'PAUSED' });
      return false;
    }

    if (request.action === 'RESUME_WORKFLOW') {
      executionState.isPaused = false;
      notifyStep('RESUMED', 'Melanjutkan proses otomasi...', 'progress');
      sendResponse({ status: 'RESUMED' });
      return false;
    }

    if (request.action === 'EXECUTE_FASIH_WORKFLOW') {
      executionState.isRunning = true;
      executionState.isPaused = false;
      executionState.isAborted = false;

      executeWorkflow(request.options || {})
        .then((result) => {
          executionState.isRunning = false;
          sendResponse({ status: 'DONE', result });
        })
        .catch((error) => {
          executionState.isRunning = false;
          if (error.name === 'AbortError') {
            console.warn('[TUNTAS] Alur dibatalkan oleh pengguna (STOP).');
            sendResponse({ status: 'ABORTED', error: error.message });
          } else {
            console.error('[TUNTAS] Error:', error);
            notifyStep('ERROR', error.message || String(error), 'error');
            sendResponse({ status: 'ERROR', error: error.message || String(error) });
          }
        });
      return true; // Asynchronous response
    }

    if (request.action === 'READ_STATUS') {
      // Baca "STATUS ASSIGNMENT" di halaman /app/assignment-detail/<id>
      let statusText = '';
      const nodes = Array.from(document.querySelectorAll('div, span, p, dt, label'));
      const lbl = nodes.find(n => (n.textContent || '').trim().toUpperCase() === 'STATUS ASSIGNMENT');
      if (lbl && lbl.parentElement) statusText = (lbl.parentElement.innerText || '').replace(/STATUS ASSIGNMENT/i, '').trim();
      sendResponse({ status: 'DONE', statusText, url: window.location.href });
      return false;
    }

    if (request.action === 'DIAGNOSE_PAGE') {
      try {
        sendResponse({ status: 'DONE', report: diagnosePage() });
      } catch (e) {
        sendResponse({ status: 'ERROR', report: { error: e.message || String(e) } });
      }
      return false;
    }

    if (request.action === 'APPROVE_ASSIGNMENT') {
      executionState.isRunning = true;
      executionState.isAborted = false;
      executeApprove(request.options || {})
        .then((result) => { executionState.isRunning = false; sendResponse({ status: 'DONE', result }); })
        .catch((error) => {
          executionState.isRunning = false;
          sendResponse({ status: error.name === 'AbortError' ? 'ABORTED' : 'ERROR', error: error.message || String(error) });
        });
      return true;
    }

    // ---------- Menu "Ubah Variabel" (API FASIH) ----------
    // Pekerjaan panjang (simpan/restore) dijalankan sebagai job: balasan langsung, status ditanya berkala
    // agar tidak bergantung pada satu saluran pesan yang lama terbuka.
    if (request.action === 'API_JOB_STATUS') {
      const j = (self.__tuntasJobs || {})[request.jobId];
      sendResponse(j ? (j.done ? j.res : { status: 'RUNNING' }) : { status: 'UNKNOWN_JOB' });
      return false;
    }
    if (request.action === 'API_APPLY' || request.action === 'API_RESTORE' || request.action === 'API_FIND_KEYS' || request.action === 'API_LIST_VARS') {
      const api = self.TUNTAS_API;
      if (!api) { sendResponse({ status: 'ERROR', error: 'Mesin API belum dimuat — refresh halaman FASIH' }); return false; }
      const onBackup = (backup) => chrome.runtime.sendMessage({ action: 'API_BACKUP_SAVE', backup }).catch(() => {});
      const job = request.action === 'API_APPLY' ? api.applyRow(request.row, { dryRun: request.dryRun !== false, autoNote: request.autoNote ?? '#1', onBackup })
        : request.action === 'API_RESTORE' ? api.restore(request.backup, { dryRun: request.dryRun !== false })
        : request.action === 'API_LIST_VARS' ? api.listVars(request.assignmentId)
        : api.findKeys(request.assignmentId, request.query || '');
      const wrapped = job.then((result) => ({ status: 'DONE', result }))
        .catch((e) => ({ status: 'ERROR', error: (e && e.message) || String(e) }));
      if (request.jobId) {
        self.__tuntasJobs = self.__tuntasJobs || {};
        const rec = self.__tuntasJobs[request.jobId] = { done: false };
        wrapped.then((res) => { rec.done = true; rec.res = res; });
        sendResponse({ status: 'STARTED' });
        return false;
      }
      wrapped.then(sendResponse);
      return true;
    }

    if (request.action === 'PING') {
      sendResponse({ status: 'PONG', url: window.location.href, state: executionState });
      return false;
    }
  });

  // Ekspor fungsi ke window untuk kemudahan debugging manual dari DevTools
  window.__fasihRunner = {
    executeWorkflow,
    handleSsoLogin,
    findSsoEksternalButton,
    findSsoEmailInput,
    findSsoPasswordInput,
    findSsoSubmitButton,
    findSessionExpiredElement,
    isLoginPage,
    findEditButton,
    findApproveButton,
    findMasterKbliRow,
    findMasterKbliField,
    getCurrentKbli,
    findKbliListOption,
    selectKbliViaMaster,
    findTopRightSubmitSurveyButton,
    filterBusinessItemsByName,
    findApproveButtonDeep,
    diagnosePage,
    findQuestion13gKbliElement,
    getKbliOptions,
    buildEditUrlFromDetailPage,
    findBlockIButton,
    findBlockIIButton,
    isAnyFormBlockPresent,
    findKeteranganUsahaHeader,
    getBusinessItems,
    findQuestion27aElement,
    findQuestion27bElement,
    findQuestion23aElement,
    findQuestionUB23bElement,
    findQuestion30bElement,
    findQuestion31aElement,
    findQuestion31bElement,
    getQuestion25Year,
    isUBQuestionnaire,
    getTargetQuestionInfo,
    getTargetQuestionsList,
    findTargetQuestionElement,
    findCommentButtonForQuestion,
    findCommentModalTextarea,
    fillCommentForTargetQuestion,
    closeCommentModal,
    ensureCommentModalClosed,
    findMenuCatatanButton,
    isTampilkanAnomaliSwitch,
    isTampilkanAnomaliActive,
    isAdminResolvedSwitch,
    findGalatToggleSwitch,
    findTampilkanAnomaliRowAndSwitch,
    activateTampilkanAnomaliSwitch,
    handleCatatanAnomaliSection,
    findTopRightSubmitSurveyButton,
    findSecondaryKirimButton,
    findConfirmSubmitButton,
    detectFormGalatOrErrors,
    extractQuestionLabelFromElement,
    findTargetQuestionWithDynamicScroll,
    findQuestionElementByCriteria,
    getQuestionRowFromElement,
    normalizeFasihText,
    checkIsEditUrl,
    getEditUrl
  };
})();
