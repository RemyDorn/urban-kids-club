"""Replace __kdAddParticipant alert-stub with a real invite modal:
- Loads matching parents from /api/providers/:id/parents/matching
- Shows list with parent name, children + ages, match-reasons (badges),
  booking count, "already invited" pill
- Checkbox per row + "Alle waehlen"
- Optional Rabatt-Code field
- POST /invite-parents -> Toast with summary
"""

import re

fp = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(fp, 'r', encoding='utf-8').read()

# ============================================================
# 1) CSS for invite modal
# ============================================================
CSS = """
/* Kurs-Einladungen Modal */
.invite-card { padding: 18px; }
.invite-list { max-height: 420px; overflow-y: auto; margin: 12px 0; border: 1px solid var(--border); border-radius: var(--radius-md); }
.invite-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border); transition: background var(--motion-fast); }
.invite-row:last-child { border-bottom: none; }
.invite-row:hover { background: var(--surface-alt); }
.invite-row.disabled { opacity: 0.45; pointer-events: none; }
.invite-row input[type=checkbox] { width: 16px; height: 16px; margin-top: 4px; accent-color: var(--primary); }
.invite-row-main { flex: 1; min-width: 0; }
.invite-row-name { font-size: 14px; font-weight: 600; color: var(--ink); }
.invite-row-sub { font-size: 12px; color: var(--muted-2); margin-top: 2px; }
.invite-row-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.invite-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: var(--radius-pill); background: var(--surface-alt); color: var(--muted-2); letter-spacing: 0.02em; }
.invite-badge.match-age { background: var(--primary-tint); color: var(--primary-hover); }
.invite-badge.match-cat { background: var(--sage-tint); color: var(--sage-deep); }
.invite-badge.active { background: rgba(255,239,225,0.6); color: var(--ink); border: 1px solid var(--border); }
.invite-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.invite-empty { padding: 40px 24px; text-align: center; color: var(--muted-2); font-size: 13px; }
.invite-coupon-field { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
.invite-coupon-field label { font-size: 12px; color: var(--muted-2); flex-shrink: 0; }
.invite-coupon-field input { flex: 1; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--font-body); font-size: 13px; background: var(--bg); color: var(--ink); }
"""

m_style = re.search(r'</style>', src)
if not m_style:
    print('FAIL: </style> not found'); exit(1)
src = src[:m_style.start()] + CSS + "\n" + src[m_style.start():]
print('OK: invite modal CSS injected')

# ============================================================
# 2) Replace __kdAddParticipant stub
# ============================================================
old_stub = """  window.__kdAddParticipant = function() {
    alert('Teilnehmer hinzufügen — folgt im nächsten Sprint (verknüpft mit Kurs-Einladungen-Flow).');
  };"""

new_impl = r'''  window.__kdAddParticipant = async function() {
    var s = window.dashboardState; if (!s) return;
    var a = (s.activities || []).find(function(x){ return x.id === window.__kdActiveId; });
    if (!a) return;

    // Open modal with loading state first
    var ageMin = (a.ageRange && a.ageRange.min != null) ? a.ageRange.min : 0;
    var ageMax = (a.ageRange && a.ageRange.max != null) ? a.ageRange.max : 99;
    var category = encodeURIComponent(a.category || '');
    var providerId = s.provider.id;

    function showInviteModal(parents) {
      var rows = parents.map(function(p) {
        var initials = (p.name || '').split(' ').map(function(w){ return w.charAt(0).toUpperCase(); }).slice(0,2).join('');
        var children = (p.childNames || []).map(function(n, i) {
          var age = (p.childAges && p.childAges[i] != null) ? ' (' + p.childAges[i] + ' J.)' : '';
          return n + age;
        }).join(', ') || '—';
        var badges = '';
        (p.matchReasons || []).forEach(function(reason) {
          var cls = 'invite-badge';
          if (/Alter/.test(reason)) cls += ' match-age';
          else if (/Kurs/.test(reason)) cls += ' match-cat';
          else if (/Aktiv/.test(reason)) cls += ' active';
          badges += '<span class="' + cls + '">' + (window.escapeHtml ? window.escapeHtml(reason) : reason) + '</span>';
        });
        var alreadyAttr = p.alreadyInvited ? ' disabled' : '';
        var alreadyBadge = p.alreadyInvited ? '<span class="invite-badge" style="background:var(--signal-tint);color:var(--signal)">Bereits eingeladen</span>' : '';
        return '<label class="invite-row' + (p.alreadyInvited ? ' disabled' : '') + '">'
          + '<input type="checkbox" class="invite-cb" data-pid="' + p.parentId + '"' + alreadyAttr + '>'
          + '<div class="invite-row-main">'
          +   '<div class="invite-row-name">' + (window.escapeHtml ? window.escapeHtml(p.name || '—') : p.name) + '</div>'
          +   '<div class="invite-row-sub">' + (window.escapeHtml ? window.escapeHtml(children) : children) + ' · ' + (p.bookingCount || 0) + ' bisherige Buchung' + ((p.bookingCount === 1) ? '' : 'en') + '</div>'
          +   '<div class="invite-row-badges">' + badges + alreadyBadge + '</div>'
          + '</div></label>';
      }).join('');

      var listHtml = parents.length === 0
        ? '<div class="invite-empty">Keine passenden Eltern in deiner Kunden-Datenbank gefunden.<br><span style="font-size:11px">Tipp: Sobald die ersten Eltern bei dir gebucht haben, schlagen wir hier passende vor.</span></div>'
        : rows;

      var bodyExtraHtml =
          '<div class="invite-card">'
        +   '<div class="invite-toolbar">'
        +     '<div style="font-size:13px;color:var(--ink-2)">' + parents.filter(function(p){ return !p.alreadyInvited; }).length + ' passende Familie' + (parents.length === 1 ? '' : 'n') + '</div>'
        +     '<a class="card-link" id="phInvSelectAll" style="font-size:12px;cursor:pointer">Alle wählen</a>'
        +   '</div>'
        +   '<div class="invite-list" id="phInvList">' + listHtml + '</div>'
        +   '<div class="invite-coupon-field">'
        +     '<label for="phInvCoupon">Rabatt-Code (optional):</label>'
        +     '<input type="text" id="phInvCoupon" placeholder="z.B. WILLKOMMEN10" maxlength="32">'
        +   '</div>'
        + '</div>';

      var courseName = a.title || 'Kurs';
      window.ukcShowDetailModal({
        kicker: 'Kurs-Einladung',
        titleHtml: 'Eltern einladen zu <em>' + (window.escapeHtml ? window.escapeHtml(courseName) : courseName) + '</em>',
        rows: [],
        bodyExtraHtml: bodyExtraHtml,
        footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Abbrechen</button>'
          + ' <button class="btn btn-primary btn-sm" id="phInvSend">Einladungen senden</button>',
      });

      // Wire after render
      setTimeout(function() {
        var selectAll = document.getElementById('phInvSelectAll');
        if (selectAll) selectAll.addEventListener('click', function() {
          var cbs = document.querySelectorAll('.invite-cb:not([disabled])');
          var allOn = Array.from(cbs).every(function(c){ return c.checked; });
          cbs.forEach(function(c){ c.checked = !allOn; });
          selectAll.textContent = allOn ? 'Alle wählen' : 'Alle abwählen';
        });
        var sendBtn = document.getElementById('phInvSend');
        if (sendBtn) sendBtn.addEventListener('click', async function() {
          var cbs = document.querySelectorAll('.invite-cb:checked:not([disabled])');
          var pids = Array.from(cbs).map(function(c){ return c.dataset.pid; });
          if (pids.length === 0) {
            alert('Wähle mindestens eine Familie aus.');
            return;
          }
          var coupon = (document.getElementById('phInvCoupon') || {}).value || '';
          sendBtn.disabled = true; sendBtn.textContent = 'Sende ' + pids.length + '…';
          try {
            var resp = await fetch('/api/providers/' + providerId + '/invite-parents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (s.token || '') },
              body: JSON.stringify({ parentIds: pids, activityId: a.id, couponCode: coupon || undefined }),
            });
            if (!resp.ok) {
              var err = await resp.json().catch(function(){ return {}; });
              throw new Error(err.error || ('HTTP ' + resp.status));
            }
            var data = await resp.json();
            var sum = data.summary || {};
            var msg = sum.sent + ' Einladung' + (sum.sent === 1 ? '' : 'en') + ' gesendet';
            if (sum.skipped > 0) msg += ' · ' + sum.skipped + ' übersprungen';
            if (sum.failed > 0) msg += ' · ' + sum.failed + ' fehlgeschlagen';
            if (window.ukcToast) window.ukcToast(msg);
            // close
            var ov = document.querySelector('.ukc-detail-overlay');
            if (ov) ov.remove();
          } catch (e) {
            sendBtn.disabled = false; sendBtn.textContent = 'Einladungen senden';
            alert('Fehler: ' + (e.message || e));
          }
        });
      }, 50);
    }

    // Show "loading" modal first
    window.ukcShowDetailModal({
      kicker: 'Kurs-Einladung',
      titleHtml: 'Suche passende <em>Eltern…</em>',
      rows: [],
      bodyExtraHtml: '<div class="invite-empty">Lade Vorschläge…</div>',
      footerHtml: '<button class="btn btn-ghost btn-sm" onclick="this.closest(\'.ukc-detail-overlay\').remove()">Schließen</button>',
    });

    try {
      var qs = '?activityId=' + encodeURIComponent(a.id) + '&ageMin=' + ageMin + '&ageMax=' + ageMax + (category ? '&category=' + category : '');
      var resp = await fetch('/api/providers/' + providerId + '/parents/matching' + qs, {
        headers: { 'Authorization': 'Bearer ' + (s.token || '') },
      });
      if (!resp.ok) throw new Error('Konnte Vorschläge nicht laden');
      var data = await resp.json();
      var ov = document.querySelector('.ukc-detail-overlay');
      if (ov) ov.remove();
      showInviteModal(data.data || []);
    } catch (e) {
      var ov2 = document.querySelector('.ukc-detail-overlay');
      if (ov2) ov2.remove();
      alert('Fehler: ' + (e.message || e));
    }
  };'''

if old_stub not in src:
    print('FAIL: __kdAddParticipant stub not found'); exit(1)
src = src.replace(old_stub, new_impl, 1)
print('OK: __kdAddParticipant uses matching-parents API + invite modal')

open(fp, 'w', encoding='utf-8').write(src)
print('All patches applied.')
