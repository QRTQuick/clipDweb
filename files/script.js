/* ── SlipBoard script.js ─────────────────────────────── */

let slipsCache = [];
let sseSource = null;

// ── DOM refs ────────────────────────────────────────────
const $slips      = document.getElementById('slips');
const $emptyState = document.getElementById('emptyState');
const $charCount  = document.getElementById('charCount');
const $slipsCount = document.getElementById('slipsCount');
const $liveBadge  = document.getElementById('liveBadge');
const $liveLabel  = $liveBadge.querySelector('.live-label');
const $toast      = document.getElementById('toast');
const $sendBtn    = document.getElementById('sendBtn');
const $textarea   = document.getElementById('text');
const $syncBeam   = document.getElementById('syncBeam');

// ── Char counter ────────────────────────────────────────
$textarea.addEventListener('input', () => {
  const n = $textarea.value.length;
  $charCount.textContent = n === 0 ? '0 chars' : `${n.toLocaleString()} chars`;
  $charCount.classList.toggle('has-text', n > 0);
});

// ── Keyboard shortcut: Ctrl/Cmd+Enter to send ──────────
$textarea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveSlip();
});

// ── Toast helper ────────────────────────────────────────
let toastTimer;
function showToast(msg, duration = 2200) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), duration);
}

// ── Sync beam animation ─────────────────────────────────
function fireBeam() {
  $syncBeam.classList.remove('active');
  void $syncBeam.offsetWidth; // reflow
  $syncBeam.classList.add('active');
  setTimeout(() => $syncBeam.classList.remove('active'), 900);
}

// ── Set live badge state ────────────────────────────────
function setLive(isLive) {
  $liveBadge.classList.toggle('connected', isLive);
  $liveLabel.textContent = isLive ? 'live' : 'reconnecting…';
}

// ── Format timestamp ────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Render slips ─────────────────────────────────────────
function renderSlips(slips, newIds = new Set()) {
  $slipsCount.textContent = `${slips.length} slip${slips.length !== 1 ? 's' : ''}`;

  if (!slips.length) {
    $slips.innerHTML = '';
    if (!document.getElementById('emptyState')) {
      const el = document.createElement('div');
      el.className = 'empty-state';
      el.id = 'emptyState';
      el.innerHTML = `
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#00e5ff" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.4"/>
            <path d="M16 24h16M24 16v16" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          </svg>
        </div>
        <p>No slips yet.<br>Transfer something above.</p>`;
      $slips.appendChild(el);
    }
    return;
  }

  // Build HTML
  $slips.innerHTML = slips.map((s, i) => {
    const isNew = newIds.has(i);
    return `
    <div class="slip-card${isNew ? ' new-slip' : ''}" data-idx="${i}">
      <div class="slip-incoming-bar"></div>
      <div class="slip-text">${escHtml(s.text)}</div>
      <div class="slip-actions">
        <span class="slip-ts">${s.ts ? fmtTime(s.ts) : ''}</span>
        <div class="slip-btns">
          <button class="slip-btn slip-btn--copy" onclick="copySlip(${i}, this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy
          </button>
          <button class="slip-btn slip-btn--delete" onclick="deleteSlip(${i})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6M14 11v6"></path>
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Remove new-slip highlight after animation
  if (newIds.size) {
    setTimeout(() => {
      document.querySelectorAll('.new-slip').forEach(el => el.classList.remove('new-slip'));
    }, 2500);
  }
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Load slips ───────────────────────────────────────────
async function loadSlips(highlightNew = false) {
  try {
    const res = await fetch('/api/slips');
    const slips = await res.json();
    const prevLen = slipsCache.length;
    const addedCount = slips.length - prevLen;
    const newIds = new Set();
    if (highlightNew && addedCount > 0) {
      for (let i = 0; i < addedCount; i++) newIds.add(i);
    }
    slipsCache = slips;
    renderSlips(slips, newIds);
  } catch (e) {
    console.warn('loadSlips error', e);
  }
}

// ── Save slip ────────────────────────────────────────────
async function saveSlip() {
  const text = $textarea.value.trim();
  if (!text) { $textarea.focus(); return; }

  $sendBtn.classList.add('sending');
  $sendBtn.disabled = true;

  try {
    await fetch('/api/slips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    $textarea.value = '';
    $charCount.textContent = '0 chars';
    $charCount.classList.remove('has-text');
    showToast('✦ Slip transferred');
    await loadSlips(true);
    fireBeam();
  } catch(e) {
    showToast('⚠ Transfer failed');
  } finally {
    $sendBtn.disabled = false;
    $sendBtn.classList.remove('sending');
  }
}

// ── Copy slip ────────────────────────────────────────────
async function copySlip(idx, btn) {
  const textEl = btn.closest('.slip-card').querySelector('.slip-text');
  try {
    await navigator.clipboard.writeText(textEl.innerText);
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
    }, 2000);
  } catch(e) {
    showToast('Could not copy — check permissions');
  }
}

// ── Delete slip ──────────────────────────────────────────
async function deleteSlip(idx) {
  const card = document.querySelector(`.slip-card[data-idx="${idx}"]`);
  if (card) {
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.96)';
    await new Promise(r => setTimeout(r, 200));
  }
  try {
    await fetch('/api/slips/' + idx, { method: 'DELETE' });
    await loadSlips(false);
  } catch(e) {
    showToast('⚠ Delete failed');
    if (card) { card.style.opacity = ''; card.style.transform = ''; }
  }
}

// ── Server-Sent Events for real-time sync ────────────────
function connectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }

  sseSource = new EventSource('/api/events');

  sseSource.onopen = () => setLive(true);

  sseSource.onmessage = (e) => {
    if (e.data === 'update') {
      loadSlips(true).then(fireBeam);
    }
  };

  sseSource.onerror = () => {
    setLive(false);
    sseSource.close();
    sseSource = null;
    // Retry in 3s
    setTimeout(connectSSE, 3000);
  };
}

// ── Fallback polling (when SSE is unavailable, e.g. Vercel) ─
let lastTs = 0;
async function pollForUpdates() {
  if (sseSource && sseSource.readyState !== EventSource.CLOSED) return;
  try {
    const res = await fetch('/api/slips/timestamp');
    const { ts } = await res.json();
    if (lastTs && ts > lastTs) {
      loadSlips(true).then(fireBeam);
    }
    lastTs = ts;
  } catch(e) {}
}

// ── Init ─────────────────────────────────────────────────
loadSlips();
connectSSE();
setInterval(pollForUpdates, 2000); // polling safety net

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js').catch(() => {});
}

// Expose globals for inline handlers
window.saveSlip  = saveSlip;
window.copySlip  = copySlip;
window.deleteSlip = deleteSlip;
