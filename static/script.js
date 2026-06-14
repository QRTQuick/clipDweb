/* ── SlipBoard script.js — Vercel KV edition ────────────── */

let slipsCache   = [];
let lastSlipText = null;   // detect genuinely new slips from other tabs
let pollTimer    = null;

// ── DOM refs ─────────────────────────────────────────────
const $slips     = document.getElementById('slips');
const $charCount = document.getElementById('charCount');
const $slipsCnt  = document.getElementById('slipsCount');
const $liveBadge = document.getElementById('liveBadge');
const $liveLabel = $liveBadge.querySelector('.live-label');
const $toast     = document.getElementById('toast');
const $sendBtn   = document.getElementById('sendBtn');
const $textarea  = document.getElementById('text');
const $syncBeam  = document.getElementById('syncBeam');

// ── Char counter ──────────────────────────────────────────
$textarea.addEventListener('input', () => {
  const n = $textarea.value.length;
  $charCount.textContent = n === 0 ? '0 chars' : `${n.toLocaleString()} chars`;
  $charCount.classList.toggle('has-text', n > 0);
});

// Ctrl/Cmd+Enter shortcut
$textarea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveSlip();
});

// ── Toast ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2400) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), duration);
}

// ── Sync beam ─────────────────────────────────────────────
function fireBeam() {
  $syncBeam.classList.remove('active');
  void $syncBeam.offsetWidth;
  $syncBeam.classList.add('active');
  setTimeout(() => $syncBeam.classList.remove('active'), 900);
}

// ── Live badge ────────────────────────────────────────────
function setLive(state) {
  // state: 'live' | 'syncing' | 'offline'
  $liveBadge.className = 'live-badge ' + state;
  $liveLabel.textContent =
    state === 'live'    ? 'live' :
    state === 'syncing' ? 'syncing…' : 'offline';
}

// ── Time formatter ────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Escape HTML ───────────────────────────────────────────
function esc(str) {
  return str
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render ────────────────────────────────────────────────
function renderSlips(slips, highlightCount = 0) {
  $slipsCnt.textContent = `${slips.length} slip${slips.length !== 1 ? 's' : ''}`;

  if (!slips.length) {
    $slips.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#00e5ff" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.4"/>
            <path d="M16 24h16M24 16v16" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          </svg>
        </div>
        <p>No slips yet.<br>Transfer something above.</p>
      </div>`;
    return;
  }

  $slips.innerHTML = slips.map((s, i) => {
    const isNew = i < highlightCount;
    return `
    <div class="slip-card${isNew ? ' new-slip' : ''}" data-idx="${i}">
      <div class="slip-incoming-bar"></div>
      <div class="slip-text">${esc(s.text)}</div>
      <div class="slip-actions">
        <span class="slip-ts">${fmtTime(s.ts)}</span>
        <div class="slip-btns">
          <button class="slip-btn slip-btn--copy" onclick="copySlip(${i},this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>Copy
          </button>
          <button class="slip-btn slip-btn--delete" onclick="deleteSlip(${i})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6"></path>
            </svg>Delete
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  if (highlightCount > 0) {
    setTimeout(() => {
      document.querySelectorAll('.new-slip').forEach(el => el.classList.remove('new-slip'));
    }, 2500);
  }
}

// ── Load slips from server ────────────────────────────────
async function loadSlips(options = {}) {
  const { silent = false, highlightNew = false } = options;
  try {
    const res = await fetch('/api/slips');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const slips = await res.json();

    // Detect genuinely new slips added from another tab/device
    let newCount = 0;
    if (highlightNew && slips.length > slipsCache.length) {
      newCount = slips.length - slipsCache.length;
    }

    // Check if top slip changed (another tab posted while count was same)
    const topChanged =
      slips.length > 0 &&
      slipsCache.length > 0 &&
      slips[0].ts !== slipsCache[0]?.ts;

    if (topChanged && highlightNew) newCount = Math.max(newCount, 1);

    slipsCache = slips;
    renderSlips(slips, newCount);

    if (newCount > 0 && !silent) {
      fireBeam();
      showToast(`✦ ${newCount} new slip${newCount > 1 ? 's' : ''} received`);
    }

    setLive('live');
  } catch (err) {
    if (!silent) setLive('offline');
    console.warn('loadSlips error:', err);
  }
}

// ── Save slip ─────────────────────────────────────────────
async function saveSlip() {
  const text = $textarea.value.trim();
  if (!text) { $textarea.focus(); return; }

  $sendBtn.disabled = true;
  $sendBtn.classList.add('sending');
  setLive('syncing');

  try {
    const res = await fetch('/api/slips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    $textarea.value = '';
    $charCount.textContent = '0 chars';
    $charCount.classList.remove('has-text');

    await loadSlips({ highlightNew: false });
    fireBeam();
    showToast('✦ Slip transferred');
  } catch (err) {
    showToast('⚠ Transfer failed — check connection');
    setLive('offline');
  } finally {
    $sendBtn.disabled = false;
    $sendBtn.classList.remove('sending');
  }
}

// ── Copy slip ─────────────────────────────────────────────
async function copySlip(idx, btn) {
  const textEl = btn.closest('.slip-card').querySelector('.slip-text');
  try {
    await navigator.clipboard.writeText(textEl.innerText);
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy`;
    }, 2000);
  } catch {
    showToast('⚠ Could not copy');
  }
}

// ── Delete slip ───────────────────────────────────────────
async function deleteSlip(idx) {
  const card = document.querySelector(`.slip-card[data-idx="${idx}"]`);
  if (card) {
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.96)';
    await new Promise(r => setTimeout(r, 200));
  }
  try {
    setLive('syncing');
    await fetch('/api/slips/' + idx, { method: 'DELETE' });
    await loadSlips({ silent: true });
  } catch {
    showToast('⚠ Delete failed');
    if (card) { card.style.opacity = ''; card.style.transform = ''; }
    setLive('offline');
  }
}

// ── Polling for cross-tab / cross-device sync ─────────────
// Vercel serverless kills long SSE connections, so we poll
// every 2.5s instead. Fast enough to feel live.
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    loadSlips({ silent: true, highlightNew: true });
  }, 2500);
}

// Pause polling when tab is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollTimer);
  } else {
    loadSlips({ silent: true, highlightNew: true });
    startPolling();
  }
});

// ── Init ──────────────────────────────────────────────────
setLive('syncing');
loadSlips().then(startPolling);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js').catch(() => {});
}

// Expose for inline onclick handlers
window.saveSlip   = saveSlip;
window.copySlip   = copySlip;
window.deleteSlip = deleteSlip;
