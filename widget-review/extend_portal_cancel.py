#!/usr/bin/env python3
"""
Erweitert das Eltern-Portal um eine Absage-Funktion:
  - "Krank?" Button öffnet ein Cancel-Modal mit Grund-Auswahl
  - 24h-Karenz: rechtzeitig = Add-Up zurück, zu spät = verfällt
  - Bestätigungs-Toast nach erfolgreicher Absage
  - Provider bekommt automatisch eine Krankmeldung im Postfach (simuliert)
"""
from pathlib import Path

P = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/portal-preview.html")
src = P.read_text(encoding="utf-8")

if "cancel-modal" in src:
    print("- portal already has cancel modal")
    raise SystemExit(0)

# ============================================================
# 1. CSS for cancel modal + status changes
# ============================================================
EXTRA_CSS = '''

/* ============ Cancel-Modal (Eltern-Absage) ============ */
.cancel-modal-backdrop { position: fixed; inset: 0; background: rgba(31,29,24,0.55); display: none; align-items: flex-end; justify-content: center; z-index: 200; backdrop-filter: blur(4px); animation: fade-in 200ms ease; }
.cancel-modal-backdrop.open { display: flex; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes slide-up { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.cancel-modal { background: var(--bg); width: 100%; max-width: 540px; border-radius: 22px 22px 0 0; padding: 28px 30px 24px; box-shadow: 0 -8px 40px rgba(31,29,24,0.18); animation: slide-up 280ms cubic-bezier(.2,.8,.2,1); }
@media (min-width: 720px) { .cancel-modal-backdrop { align-items: center; } .cancel-modal { border-radius: 22px; } }
.cancel-modal-grip { width: 44px; height: 4px; background: rgba(31,29,24,0.16); border-radius: 999px; margin: 0 auto 18px; }
.cancel-modal h3 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 20px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 6px; }
.cancel-modal h3 em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.cancel-modal-target { font-size: 13px; color: var(--ink-muted); margin-bottom: 22px; padding-bottom: 16px; border-bottom: 1px solid rgba(31,29,24,0.08); }
.cancel-modal-target strong { color: var(--ink); font-weight: 600; }
.cancel-grace { display: grid; grid-template-columns: 28px 1fr; gap: 12px; padding: 14px 16px; border-radius: 12px; margin-bottom: 22px; align-items: flex-start; }
.cancel-grace.ok { background: rgba(168,182,163,0.20); }
.cancel-grace.late { background: rgba(217,108,69,0.14); }
.cancel-grace-icon { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.cancel-grace.ok .cancel-grace-icon { background: var(--accent-deep); color: var(--bg); }
.cancel-grace.late .cancel-grace-icon { background: var(--primary); color: var(--bg); }
.cancel-grace-title { font-weight: 600; font-size: 13.5px; color: var(--ink); margin-bottom: 2px; }
.cancel-grace-body { font-size: 12.5px; color: var(--ink-muted); line-height: 1.5; }
.cancel-modal-section-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: var(--ink-muted); margin-bottom: 10px; }
.cancel-reasons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; }
.cancel-reason { padding: 13px 14px; border: 1px solid rgba(31,29,24,0.12); border-radius: 12px; background: var(--surface); font-family: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer; transition: all 140ms; text-align: left; display: flex; align-items: center; gap: 10px; }
.cancel-reason:hover { border-color: var(--primary); background: rgba(217,108,69,0.06); }
.cancel-reason.selected { border-color: var(--primary); background: rgba(217,108,69,0.10); box-shadow: 0 0 0 3px rgba(217,108,69,0.12); }
.cancel-reason-emoji { font-size: 18px; line-height: 1; flex-shrink: 0; }
.cancel-modal textarea { width: 100%; padding: 12px 14px; border: 1px solid rgba(31,29,24,0.12); border-radius: 12px; background: var(--surface); font-family: inherit; font-size: 13.5px; color: var(--ink); resize: vertical; min-height: 70px; }
.cancel-modal textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(217,108,69,0.12); }
.cancel-modal-actions { display: flex; gap: 10px; margin-top: 22px; }
.cancel-modal-actions .ghost-btn { flex: 0 0 auto; }
.cancel-modal-actions .primary-btn { flex: 1; }
.cancel-modal-actions .danger-btn { flex: 1; padding: 12px 18px; border-radius: 999px; background: var(--primary); color: var(--bg); border: 0; font-family: inherit; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 140ms; }
.cancel-modal-actions .danger-btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
.cancel-modal-actions .danger-btn:disabled { background: rgba(31,29,24,0.16); cursor: not-allowed; transform: none; }

/* Toast for cancel confirmation */
.cancel-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(120%); z-index: 250; background: var(--ink); color: var(--bg); padding: 14px 22px; border-radius: 14px; font-size: 14px; font-weight: 500; box-shadow: 0 12px 32px rgba(31,29,24,0.22); display: flex; align-items: center; gap: 10px; transition: transform 320ms cubic-bezier(.2,.8,.2,1); max-width: 90vw; }
.cancel-toast.show { transform: translateX(-50%) translateY(0); }
.cancel-toast .check { width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: var(--ink); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }

/* Cancelled status on a booking row */
.bk-row.cancelled { opacity: 0.6; }
.bk-row.cancelled .bk-title { text-decoration: line-through; }
.bk-status.cancelled { background: rgba(31,29,24,0.10); color: var(--ink-muted); }
.bk-status.cancelled-late { background: rgba(180,82,58,0.16); color: #B4523A; }
'''

# ============================================================
# 2. Modal HTML — appended at end of <main shell>
# ============================================================
MODAL_HTML = '''
<!-- CANCEL BOOKING MODAL -->
<div class="cancel-modal-backdrop" id="cancel-modal-backdrop" onclick="if(event.target===this)closeCancelModal()">
  <div class="cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title">
    <div class="cancel-modal-grip"></div>
    <h3 id="cancel-modal-title">Termin <em>absagen</em></h3>
    <div class="cancel-modal-target" id="cancel-modal-target">
      <!-- populated by JS -->
    </div>

    <div class="cancel-grace" id="cancel-grace-banner">
      <!-- populated by JS -->
    </div>

    <div class="cancel-modal-section-label">Was ist los?</div>
    <div class="cancel-reasons" id="cancel-reasons">
      <button class="cancel-reason" data-reason="krank"><span class="cancel-reason-emoji">🤒</span>Mein Kind ist krank</button>
      <button class="cancel-reason" data-reason="ich-krank"><span class="cancel-reason-emoji">😷</span>Ich bin krank</button>
      <button class="cancel-reason" data-reason="termin"><span class="cancel-reason-emoji">📅</span>Anderer Termin</button>
      <button class="cancel-reason" data-reason="reise"><span class="cancel-reason-emoji">✈️</span>Wir sind verreist</button>
      <button class="cancel-reason" data-reason="wetter"><span class="cancel-reason-emoji">🌧️</span>Wetter / Outdoor abgesagt</button>
      <button class="cancel-reason" data-reason="anders"><span class="cancel-reason-emoji">💭</span>Anderer Grund</button>
    </div>

    <div class="cancel-modal-section-label">Notiz (optional, geht direkt an Sophie)</div>
    <textarea id="cancel-note" placeholder="z.B. Wir versuchen Mittwoch wieder zu kommen..."></textarea>

    <div class="cancel-modal-actions">
      <button class="ghost-btn" onclick="closeCancelModal()">Doch nicht</button>
      <button class="danger-btn" id="cancel-submit-btn" onclick="submitCancellation()" disabled>Termin absagen</button>
    </div>
  </div>
</div>

<!-- CANCEL TOAST -->
<div class="cancel-toast" id="cancel-toast">
  <div class="check">✓</div>
  <div id="cancel-toast-text">Termin abgesagt</div>
</div>

<script>
(function() {
  // Hours-until threshold for keeping the Add-Up. < this = forfeit.
  const GRACE_HOURS = 24;

  // State for current cancellation flow
  let currentCancel = null;

  // Hook all "Krank?" buttons in the bookings list
  function wireBookingButtons() {
    document.querySelectorAll('.bk-row.upcoming').forEach((row, idx) => {
      const btn = row.querySelector('.ghost-btn');
      if (!btn || btn.dataset.cancelWired) return;
      const txt = (btn.textContent || '').toLowerCase();
      if (!txt.includes('krank') && !txt.includes('absagen')) return;
      btn.dataset.cancelWired = '1';
      btn.onclick = (e) => {
        e.preventDefault();
        const titleEl = row.querySelector('.bk-title');
        const subEl = row.querySelector('.bk-sub');
        const dayEl = row.querySelector('.bk-day');
        const numEl = row.querySelector('.bk-num');
        const title = titleEl ? titleEl.textContent : 'Termin';
        const sub = subEl ? subEl.textContent : '';
        const dayLabel = dayEl ? dayEl.textContent : '';
        const dayNum = numEl ? numEl.textContent : '';

        // Estimate hours-until from the visual date (mock: assume next 7 days)
        // For the demo, we vary based on row index to show both states
        const hoursUntil = idx === 0 ? 16 : (idx === 1 ? 96 : 240);

        currentCancel = { row, title, sub, hoursUntil, dayLabel, dayNum, reason: null, note: '' };
        openCancelModal();
      };
    });
  }

  function openCancelModal() {
    const c = currentCancel;
    if (!c) return;

    // Target line
    const target = document.getElementById('cancel-modal-target');
    target.innerHTML = '<strong>' + c.title.replace(/<\\/?em>/g, '') + '</strong>'
      + ' &middot; ' + c.dayLabel + '. ' + c.dayNum + '.'
      + '<br>' + c.sub;

    // Grace banner
    const banner = document.getElementById('cancel-grace-banner');
    if (c.hoursUntil >= GRACE_HOURS) {
      banner.className = 'cancel-grace ok';
      banner.innerHTML = '<div class="cancel-grace-icon">✓</div><div>'
        + '<div class="cancel-grace-title">Du sagst rechtzeitig ab</div>'
        + '<div class="cancel-grace-body">Termin ist in ca. ' + c.hoursUntil + ' Std. — du bekommst <strong>1 Add-Up-Credit</strong> automatisch zurück, einlösbar im aktuellen Block.</div>'
        + '</div>';
    } else {
      banner.className = 'cancel-grace late';
      banner.innerHTML = '<div class="cancel-grace-icon">!</div><div>'
        + '<div class="cancel-grace-title">Kurzfristige Absage</div>'
        + '<div class="cancel-grace-body">Termin ist in ca. ' + c.hoursUntil + ' Std. — leider zu kurzfristig für ein Add-Up. Wir freuen uns trotzdem über deine Info.</div>'
        + '</div>';
    }

    // Reset reason selection
    document.querySelectorAll('.cancel-reason').forEach(b => b.classList.remove('selected'));
    document.getElementById('cancel-note').value = '';
    document.getElementById('cancel-submit-btn').disabled = true;

    document.getElementById('cancel-modal-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCancelModal() {
    document.getElementById('cancel-modal-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    currentCancel = null;
  }
  window.closeCancelModal = closeCancelModal;

  // Reason selection
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.cancel-reason');
    if (!btn) return;
    document.querySelectorAll('.cancel-reason').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if (currentCancel) currentCancel.reason = btn.dataset.reason;
    document.getElementById('cancel-submit-btn').disabled = false;
  });

  async function submitCancellation() {
    const c = currentCancel;
    if (!c || !c.reason) return;
    c.note = document.getElementById('cancel-note').value.trim();
    const submitBtn = document.getElementById('cancel-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gesendet...';

    // Call backend (will degrade gracefully if not authenticated — demo flow)
    let backendOk = false;
    try {
      const res = await fetch('/api/parent/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: 'demo-' + Date.now(),
          reason: c.reason,
          note: c.note,
          hoursUntil: c.hoursUntil,
        }),
      });
      backendOk = res.ok;
    } catch (err) {
      // demo: continue even on network fail
    }

    // Update the row visually regardless (this is a preview page)
    if (c.row) {
      c.row.classList.remove('upcoming');
      c.row.classList.add('cancelled');
      const status = c.row.querySelector('.bk-status');
      if (status) {
        if (c.hoursUntil >= GRACE_HOURS) {
          status.className = 'bk-status cancelled';
          status.textContent = 'Abgesagt · Add-Up zurück';
        } else {
          status.className = 'bk-status cancelled-late';
          status.textContent = 'Abgesagt · zu kurzfristig';
        }
      }
      const btn = c.row.querySelector('.ghost-btn');
      if (btn) {
        btn.textContent = 'Rückgängig';
        btn.dataset.cancelWired = '';
        btn.onclick = () => undoCancellation(c.row);
      }
    }

    // Toast
    const toast = document.getElementById('cancel-toast');
    const toastText = document.getElementById('cancel-toast-text');
    toastText.textContent = c.hoursUntil >= GRACE_HOURS
      ? 'Termin abgesagt · 1 Credit zurück auf dein Konto'
      : 'Termin abgesagt · Sophie wurde informiert';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4200);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Termin absagen';
    closeCancelModal();
  }
  window.submitCancellation = submitCancellation;

  function undoCancellation(row) {
    row.classList.remove('cancelled');
    row.classList.add('upcoming');
    const status = row.querySelector('.bk-status');
    if (status) {
      status.className = 'bk-status active';
      status.textContent = 'Bestätigt';
    }
    const btn = row.querySelector('.ghost-btn');
    if (btn) {
      btn.textContent = 'Krank?';
      btn.dataset.cancelWired = '';
      wireBookingButtons();
    }
  }

  // Wire on load and re-wire when the bookings tab is opened
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBookingButtons);
  } else {
    wireBookingButtons();
  }
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setTimeout(wireBookingButtons, 80));
  });

  // Also expose a manual hook for cancelling the current upcoming "Block-Termin"
  // from the My Courses tab (the big card).
  window.openCancelFor = (title, sub, hoursUntil) => {
    currentCancel = {
      row: null, title, sub, hoursUntil,
      dayLabel: '', dayNum: '', reason: null, note: ''
    };
    openCancelModal();
  };

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('cancel-modal-backdrop').classList.contains('open')) {
      closeCancelModal();
    }
  });
})();
</script>
'''

# ============================================================
# 3. Apply patches
# ============================================================
# CSS at end of style block
style_close_idx = src.rfind("</style>")
src = src[:style_close_idx] + EXTRA_CSS + "\n" + src[style_close_idx:]

# Modal HTML before </body>
body_close_idx = src.rfind("</body>")
src = src[:body_close_idx] + MODAL_HTML + "\n" + src[body_close_idx:]

P.write_text(src, encoding="utf-8")
print(f"OK portal-preview gets cancel modal + 24h-grace logic ({len(src)} bytes)")
