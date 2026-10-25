// scripts/verify-all.js
// Automated verification & regression sanity check for TUNTAS Extension

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('🔍 [QA-GUARD] Memulai Pengujian & Verifikasi Proyek');
console.log('====================================================\n');

let hasError = false;

// 1. Verifikasi Format manifest.json
console.log('📌 1. Memeriksa integritas manifest.json...');
try {
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);
  if (!manifest.manifest_version || manifest.manifest_version !== 3) {
    throw new Error('Manifest version bukan 3');
  }
  if (!manifest.background || !manifest.background.service_worker) {
    throw new Error('Background service_worker tidak terdefinisi');
  }
  console.log(`   ✅ manifest.json valid (v${manifest.version}, MV${manifest.manifest_version})`);
} catch (e) {
  console.error('   ❌ Galat manifest.json:', e.message);
  hasError = true;
}

// 2. Verifikasi Sintaks JavaScript (AST Check via node -c)
console.log('\n📌 2. Memeriksa validitas sintaks berkas JavaScript...');
const jsFiles = [
  'background/background.js',
  'content/content.js',
  'content/fasih_api.js',
  'popup/popup.js',
  'lib/ntb_validator.js'
];

for (const relPath of jsFiles) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`   ❌ Berkas tidak ditemukan: ${relPath}`);
    hasError = true;
    continue;
  }
  try {
    execSync(`node -c "${fullPath}"`, { stdio: 'pipe' });
    console.log(`   ✅ Sintaks OK: ${relPath}`);
  } catch (err) {
    console.error(`   ❌ SyntaxError pada ${relPath}:`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
    hasError = true;
  }
}

// 3. Verifikasi Keberadaan Aksi Pesan Kritis (Message Action Integrity)
console.log('\n📌 3. Memeriksa integritas aksi pesan kritis (Message Actions)...');
const criticalActions = [
  'START_QUEUE',
  'EXECUTE_FASIH_WORKFLOW',
  'PAUSE_WORKFLOW',
  'RESUME_WORKFLOW',
  'STOP_WORKFLOW',
  'TRIGGER_SSO_LOGIN',
  'PING'
];

try {
  const bgContent = fs.readFileSync(path.join(ROOT_DIR, 'background/background.js'), 'utf8');
  const ctContent = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

  for (const act of criticalActions) {
    const inBg = bgContent.includes(`'${act}'`) || bgContent.includes(`"${act}"`);
    const inCt = ctContent.includes(`'${act}'`) || ctContent.includes(`"${act}"`);
    if (inBg || inCt) {
      console.log(`   ✅ Action '${act}' terdefinisi`);
    } else {
      console.warn(`   ⚠️ Peringatan: Action '${act}' tidak ditemukan di background/content!`);
    }
  }
} catch (e) {
  console.error('   ❌ Gagal memeriksa aksi pesan:', e.message);
  hasError = true;
}

// 4. Verifikasi Keberadaan Komponen Keep-Alive & SSO
console.log('\n📌 4. Memeriksa komponen inti Keep-Alive & Auto-SSO...');
try {
  const bg = fs.readFileSync(path.join(ROOT_DIR, 'background/background.js'), 'utf8');
  const ct = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

  // Keep-alive check
  if (bg.includes('tuntasKeepAlive') && bg.includes('chrome.alarms')) {
    console.log('   ✅ Alarm tuntasKeepAlive terdaftar');
  } else {
    console.error('   ❌ Alarm tuntasKeepAlive TIDAK ditemukan di background.js');
    hasError = true;
  }

  // Auto-SSO running guard check
  if (ct.includes("rState.status !== 'RUNNING'") && bg.includes("rState.status === 'RUNNING'")) {
    console.log('   ✅ Guard SSO status RUNNING aktif');
  } else {
    console.error('   ❌ Guard SSO status RUNNING TIDAK ditemukan atau tidak konsisten');
    hasError = true;
  }
} catch (e) {
  console.error('   ❌ Gagal memeriksa komponen Keep-Alive & SSO:', e.message);
  hasError = true;
}

console.log('\n====================================================');
if (hasError) {
  console.error('❌ [QA-GUARD HASIL] Ditemukan kesalahan pada pengujian proyek!');
  process.exit(1);
} else {
  console.log('✨ [QA-GUARD HASIL] Semua pengujian integritas & sintaks LULUS!');
  console.log('====================================================');
  process.exit(0);
}
