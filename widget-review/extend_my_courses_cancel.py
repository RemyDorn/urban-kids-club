#!/usr/bin/env python3
"""
Erweitert den Default-Tab "Meine Kurse" um Cancel-Funktion:
  - Jede enr-card bekommt im Footer einen "Krank?"-Button neben "Details"
  - Zukünftige .sess-dot werden klickbar (hover Tooltip "Absagen")
  - Hero-Stat "Nächster Termin heute" bekommt einen kleinen Krank-Link

Änderungen sind additiv — bestehende Buttons bleiben.
"""
from pathlib import Path
import re

P = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/portal-preview.html")
src = P.read_text(encoding="utf-8")

if 'data-cancel-target="my-courses"' in src:
    print("- already extended")
    raise SystemExit(0)

# ============================================================
# 1. Patch CSS: Krank-button und clickbare sess-dots
# ============================================================
EXTRA_CSS = '''

/* ============ My-Courses: Cancel actions ============ */
.enr-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.enr-footer-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-cancel-small { padding: 7px 14px; border-radius: 999px; background: transparent; border: 1px solid rgba(217,108,69,0.32); color: var(--primary); font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all 140ms; display: inline-flex; align-items: center; gap: 6px; }
.btn-cancel-small::before { content: '⊘'; font-weight: 700; }
.btn-cancel-small:hover { background: rgba(217,108,69,0.10); border-color: var(--primary); transform: translateY(-1px); }
.btn-cancel-small:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* Sess-dot future = clickable cancel */
.sess-dot { position: relative; }
.sess-dot.future { cursor: pointer; transition: transform 160ms; }
.sess-dot.future:hover { transform: translateY(-2px); }
.sess-dot.future::after {
  content: '⊘ Absagen';
  position: absolute;
  bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--bg);
  padding: 4px 8px; border-radius: 6px;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em;
  white-space: nowrap;
  opacity: 0; pointer-events: none;
  transition: opacity 140ms;
  z-index: 10;
}
.sess-dot.future:hover::after { opacity: 1; }
.sess-dot.cancelled { opacity: 0.45; position: relative; }
.sess-dot.cancelled::before {
  content: ''; position: absolute; top: 50%; left: 4px; right: 4px;
  border-top: 2px solid var(--primary); transform: translateY(-50%);
}

/* Hero stat "Nächster Termin" mit Quick-Cancel-Link */
.stat-quick-cancel { display: block; font-size: 11px; color: var(--primary); margin-top: 6px; cursor: pointer; font-weight: 600; letter-spacing: 0.02em; text-decoration: none; }
.stat-quick-cancel:hover { text-decoration: underline; }
'''

style_close_idx = src.rfind("</style>")
src = src[:style_close_idx] + EXTRA_CSS + "\n" + src[style_close_idx:]

# ============================================================
# 2. Patch HTML: enr-footer Buttons → Krank? + Details
#    + Markierung der zukünftigen sess-dots als .future
# ============================================================
# Replace BOTH enr-footer blocks with extended version
old_footer_pekip = '''      <div class="enr-footer">
        <span>Nächster Termin heute · <strong>09:30 Uhr</strong></span>
        <button class="btn btn-ghost btn-sm">Details</button>
      </div>'''

new_footer_pekip = '''      <div class="enr-footer">
        <span>Nächster Termin heute · <strong>09:30 Uhr</strong></span>
        <div class="enr-footer-actions">
          <button class="btn-cancel-small" data-cancel-target="my-courses"
                  data-title="PEKiP Basis"
                  data-sub="Mo, heute · 09:30 Uhr · Mia"
                  data-hours="4">Krank?</button>
          <button class="btn btn-ghost btn-sm">Details</button>
        </div>
      </div>'''

if old_footer_pekip in src:
    src = src.replace(old_footer_pekip, new_footer_pekip, 1)
else:
    print("WARN: pekip footer anchor not exact, using regex fallback")
    src = re.sub(
        r'<div class="enr-footer">\s*<span>Nächster Termin heute[^<]*<strong>09:30 Uhr</strong></span>\s*<button class="btn btn-ghost btn-sm">Details</button>\s*</div>',
        new_footer_pekip,
        src,
        count=1,
    )

old_footer_turnen = '''      <div class="enr-footer">
        <span>Nächster Termin · <strong>Di, 7. Mai um 10:00</strong></span>
        <button class="btn btn-ghost btn-sm">Details</button>
      </div>'''

new_footer_turnen = '''      <div class="enr-footer">
        <span>Nächster Termin · <strong>Di, 7. Mai um 10:00</strong></span>
        <div class="enr-footer-actions">
          <button class="btn-cancel-small" data-cancel-target="my-courses"
                  data-title="Eltern-Kind-Turnen"
                  data-sub="Di, 7. Mai · 10:00 Uhr · Leo"
                  data-hours="60">Krank?</button>
          <button class="btn btn-ghost btn-sm">Details</button>
        </div>
      </div>'''

if old_footer_turnen in src:
    src = src.replace(old_footer_turnen, new_footer_turnen, 1)

# ============================================================
# 3. Mark all sess-dots without .done/.absent/.today as .future
# ============================================================
src = re.sub(
    r'<div class="sess-dot"><div class="sess-dot-day">',
    '<div class="sess-dot future" data-cancel-target="sess-dot"><div class="sess-dot-day">',
    src
)

# ============================================================
# 4. Patch hero stat "Nächster Termin" — add quick-cancel link
# ============================================================
old_hero = '''    <div class="stat">
      <div class="stat-label">Nächster Termin</div>
      <div class="stat-num">09:30 <em>heute</em></div>
    </div>'''
new_hero = '''    <div class="stat">
      <div class="stat-label">Nächster Termin</div>
      <div class="stat-num">09:30 <em>heute</em></div>
      <a class="stat-quick-cancel" data-cancel-target="hero-quick"
         data-title="PEKiP Basis"
         data-sub="Mo, heute · 09:30 Uhr · Mia"
         data-hours="4">⊘ Mia ist krank</a>
    </div>'''
if old_hero in src:
    src = src.replace(old_hero, new_hero, 1)

# ============================================================
# 5. Update the cancel-modal JS to also handle .btn-cancel-small + .sess-dot.future
# ============================================================
# Find the existing wireBookingButtons function and extend it
old_wire_marker = "// Wire all \"Krank?\" buttons in the bookings list"
new_extended_marker = '''// Wire ALL cancel triggers: bookings rows + my-courses cards + sess-dots + hero
  function wireMyCoursesCancel() {
    document.querySelectorAll('[data-cancel-target]').forEach(btn => {
      if (btn.dataset.cancelWired) return;
      btn.dataset.cancelWired = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const title = btn.dataset.title || 'Termin';
        const sub   = btn.dataset.sub   || '';
        const hours = parseInt(btn.dataset.hours || '4', 10);
        // For sess-dot, derive the date from the dot itself
        let dayLabel = '', dayNum = '';
        if (btn.classList.contains('sess-dot')) {
          dayLabel = btn.querySelector('.sess-dot-day')?.textContent || '';
          dayNum   = btn.querySelector('.sess-dot-date')?.textContent || '';
          // Estimate hours-until from the date number (rough heuristic for demo)
          const today = new Date().getDate();
          const target = parseInt(dayNum, 10);
          const dayDiff = target >= today ? target - today : (30 - today + target);
          window.openCancelFor(title || 'Termin', sub, Math.max(2, dayDiff * 24), {
            sessDot: btn, dayLabel, dayNum
          });
        } else {
          window.openCancelFor(title, sub, hours);
        }
      });
    });
  }

  // Wire all "Krank?" buttons in the bookings list'''
src = src.replace(old_wire_marker, new_extended_marker, 1)

# Hook also on initial load + tab switch
old_init = "if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', wireBookingButtons);\n  } else {\n    wireBookingButtons();\n  }"
new_init = """if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { wireBookingButtons(); wireMyCoursesCancel(); });
  } else {
    wireBookingButtons();
    wireMyCoursesCancel();
  }"""
src = src.replace(old_init, new_init, 1)

# Also re-wire on tab switch
old_tab_hook = "document.querySelectorAll('.tab').forEach(t => {\n    t.addEventListener('click', () => setTimeout(wireBookingButtons, 80));\n  });"
new_tab_hook = """document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setTimeout(() => { wireBookingButtons(); wireMyCoursesCancel(); }, 80));
  });"""
src = src.replace(old_tab_hook, new_tab_hook, 1)

# Extend openCancelFor to accept extra context (sess-dot reference for visual feedback)
old_expose = """  // Also expose a manual hook for cancelling the current upcoming \"Block-Termin\"
  // from the My Courses tab (the big card).
  window.openCancelFor = (title, sub, hoursUntil) => {
    currentCancel = {
      row: null, title, sub, hoursUntil,
      dayLabel: '', dayNum: '', reason: null, note: ''
    };
    openCancelModal();
  };"""

new_expose = """  // Manual hook for cancelling termine from anywhere (My-Courses, sess-dot, hero)
  window.openCancelFor = (title, sub, hoursUntil, extra) => {
    currentCancel = {
      row: extra && extra.sessDot ? extra.sessDot : null,
      title, sub, hoursUntil,
      dayLabel: extra?.dayLabel || '', dayNum: extra?.dayNum || '',
      reason: null, note: '',
      mode: extra?.sessDot ? 'sessdot' : 'card'
    };
    openCancelModal();
  };"""
src = src.replace(old_expose, new_expose, 1)

# Update submitCancellation row-styling to handle sess-dot mode
old_submit = """    // Update the row visually regardless (this is a preview page)
    if (c.row) {
      c.row.classList.remove('upcoming');
      c.row.classList.add('cancelled');
      const status = c.row.querySelector('.bk-status');
      if (status) {"""

new_submit = """    // Update the source visual based on mode
    if (c.mode === 'sessdot' && c.row) {
      c.row.classList.add('cancelled');
      c.row.classList.remove('future');
      const lbl = c.row.querySelector('.sess-dot-label');
      if (lbl) lbl.textContent = c.hoursUntil >= GRACE_HOURS ? 'storniert' : 'fehlt';
    } else if (c.row) {
      c.row.classList.remove('upcoming');
      c.row.classList.add('cancelled');
      const status = c.row.querySelector('.bk-status');
      if (status) {"""

src = src.replace(old_submit, new_submit, 1)

# Need to also close the new conditional properly — the old `if (status)` block continues.
# The original had:
#   if (status) {
#     if (c.hoursUntil >= GRACE_HOURS) {
#       status.className = 'bk-status cancelled';
#       ...
#     } else {
#       ...
#     }
#   }
#   const btn = c.row.querySelector('.ghost-btn');
#   if (btn) { ... }
# }
# After our patch the `if (status)` is wrapped in `else if (c.row)` — closing brace count is preserved.

P.write_text(src, encoding="utf-8")
print(f"OK my-courses cancel + sess-dots clickable + hero quick-cancel ({len(src)} bytes)")
