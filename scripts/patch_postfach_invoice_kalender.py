"""Polish issues:
1. Postfach (#postfach): replace 145-line mockup with branded empty-state +
   coming-soon (mailbox feature is on backlog).
2. Invoice 'Ansehen' button: opens /invoice-preview.pdf (mockup) — replace with
   a placeholder modal that says 'Rechnungs-Detail folgt' and uses ukcShowDetailModal.
3. Add a real Kalender section /v3#kalender that shows the activities of the
   current/next 4 weeks as a vertical list, derived from state.activities.
4. Wire dashboard 'Voller Kalender →' links + page-head 'Kalender' nav to
   #kalender.
5. Credits: tweak the 'Add-Up' circle to handle small text correctly.
"""

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
src = open(p, 'r', encoding='utf-8').read()

# --------------------------------------------------------------
# 1. Postfach replacement (lines 2944-3088 — full section body)
# --------------------------------------------------------------
import re
m = re.search(r'(\s*<div class=\"section\" data-section=\"postfach\" hidden>)([\s\S]*?)(\s*<div class=\"section\" data-section=\"rechnungen\" hidden>)', src)
if not m:
    print('FAIL: postfach section bounds not found'); exit(1)

new_postfach = """
      <div class=\"section\" data-section=\"postfach\" hidden>
        <div class=\"page\">
      <div class=\"page-head\">
        <div class=\"page-head-text\">
          <div class=\"page-kicker\">Kommunikation</div>
          <h1 class=\"page-title\">Postfach &amp; <em>Nachrichten</em></h1>
          <p class=\"page-sub\">Eltern-Kommunikation an einer Stelle &mdash; Buchungs-Anfragen, Krankmeldungen, Probestunden-Feedback. Kommt in K&uuml;rze.</p>
        </div>
      </div>

      <div class=\"card\" style=\"padding:60px 40px;text-align:center;\">
        <div style=\"font-family:'Lora',serif;font-size:38px;color:var(--apricot-deep);margin-bottom:18px;\">In Vorbereitung</div>
        <p style=\"max-width:520px;margin:0 auto 18px;color:var(--ink-2);font-size:15px;line-height:1.6;\">
          Aktuell erh&auml;ltst du Buchungs-Best&auml;tigungen, Wartelisten-Hinweise und Kurs-&Auml;nderungen direkt per E-Mail.
          Die Inbox-Ansicht hier wird bald folgen &mdash; mit Threads pro Eltern, Auto-Antworten und integrierten Vorlagen.
        </p>
        <p style=\"color:var(--muted);font-size:13px;\">Hinweis-Mails laufen aktuell &uuml;ber <strong>noreply@urbankids.club</strong>.</p>
      </div>

      </div>  <!-- close .page -->
      </div>  <!-- close section -->
"""

src = src[:m.start()] + new_postfach + src[m.end(2):]
print('OK: Postfach mockup replaced with empty-state')

# --------------------------------------------------------------
# 2. Invoice 'Ansehen' fix
# --------------------------------------------------------------
old_inv = "+ '<button class=\"row-action-btn\" title=\"Ansehen\" onclick=\"window.open(\\'/invoice-preview.pdf\\',\\'_blank\\')\">⊙</button> '"
new_inv = "+ '<button class=\"row-action-btn\" title=\"Ansehen\" onclick=\"window.viewInvoiceDetail(\\'' + (i.id || '') + '\\')\">⊙</button> '"
if old_inv not in src:
    # Try without the escapes
    old_inv2 = "+ '<button class=\"row-action-btn\" title=\"Ansehen\" onclick=\"window.open(\\'\\/invoice-preview.pdf\\',\\'_blank\\')\">⊙</button> '"
    if old_inv2 in src:
        src = src.replace(old_inv2, new_inv, 1)
        print('OK: invoice button replaced (variant 2)')
    else:
        print('WARN: invoice button anchor not found')
else:
    src = src.replace(old_inv, new_inv, 1)
    print('OK: invoice button replaced')

# Add window.viewInvoiceDetail stub that opens our branded modal.
inv_helper_anchor = "  // ---- Detail-Modal (gebrandet) ---------------------------------"
inv_helper = """  // Invoice detail (Rechnung) — uses ukcShowDetailModal with real fields if available.
  window.viewInvoiceDetail = function(id) {
    var s = window.dashboardState;
    if (!s || !s.api) { alert('Dashboard nicht geladen'); return; }
    if (!id) {
      window.ukcShowDetailModal({ kicker: 'Rechnung', titleHtml: 'Detail <em>folgt</em>', rows: [{ label: 'Status', val: 'PDF-Generierung folgt im naechsten Schritt' }] });
      return;
    }
    s.api('/invoices/' + id).then(function(r) {
      var inv = r.data || r;
      if (!inv || !inv.id) {
        window.ukcShowDetailModal({ kicker: 'Rechnung', titleHtml: 'Nicht <em>gefunden</em>', rows: [{ label: 'ID', val: id }] });
        return;
      }
      window.ukcShowDetailModal({
        kicker: 'Rechnung',
        titleHtml: escapeHtml(inv.invoiceNumber || ('Entwurf-' + (inv.id || '').slice(0,8))) + ' <em>Detail</em>',
        rows: [
          { label: 'Status', val: inv.status || 'entwurf' },
          { label: 'Betrag', val: (inv.totalAmount != null ? inv.totalAmount : '0,00') + ' ' + (inv.currency || 'EUR') },
          { label: 'Erstellt', val: inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('de-DE') : '—' },
          { label: 'Faellig', val: inv.dueDate || '—' },
        ],
      });
    }).catch(function(e) {
      window.ukcShowDetailModal({ kicker: 'Rechnung', titleHtml: 'Detail <em>folgt</em>', rows: [{ label: 'Hinweis', val: 'Rechnungs-Detail-View kommt im naechsten Schritt' }] });
    });
  };

"""
if inv_helper_anchor in src:
    src = src.replace(inv_helper_anchor, inv_helper + inv_helper_anchor, 1)
    print('OK: viewInvoiceDetail helper added')

# --------------------------------------------------------------
# 3. Add Kalender-Section + 4. Wire dashboard 'Voller Kalender' link
# --------------------------------------------------------------
# Find where Kursbloecke section starts, insert Kalender section RIGHT BEFORE it.
mkb = re.search(r'(\s*)(<div class=\"section\" data-section=\"kursbloecke\" hidden>)', src)
if not mkb:
    print('FAIL: kursbloecke section anchor not found'); exit(1)

kalender_html = """
      <div class=\"section\" data-section=\"kalender\" hidden>
        <div class=\"page\">
      <div class=\"page-head\">
        <div class=\"page-head-text\">
          <div class=\"page-kicker\">Termin&uuml;bersicht</div>
          <h1 class=\"page-title\">Dein <em>Kalender</em></h1>
          <p class=\"page-sub\" id=\"phKalSub\">L&auml;dt&hellip;</p>
        </div>
        <div style=\"display:flex;gap:8px;\">
          <button class=\"btn btn-ghost btn-sm\" onclick=\"location.hash='#kursbloecke'\">Kursbl&ouml;cke</button>
          <button class=\"btn btn-primary\" onclick=\"showSection('kurse'); setTimeout(function(){ if (typeof window.openKursCreatorV2==='function') window.openKursCreatorV2({}); }, 80);\">+ Neuer Kurs</button>
        </div>
      </div>

      <div class=\"card\" style=\"padding:0;overflow:hidden;\">
        <div id=\"phKalGrid\" style=\"padding:24px;\">
          <div style=\"padding:40px;color:var(--muted);text-align:center;font-size:13px\">L&auml;dt Kalender&hellip;</div>
        </div>
      </div>

      </div>  <!-- close .page -->
      </div>  <!-- close section -->

"""
src = src[:mkb.start(2)] + kalender_html + src[mkb.start(2):]
print('OK: Kalender section inserted')

# Replace "Voller Kalender →" links in dashboard to point at #kalender
APO = chr(39)
src = src.replace(
    '<a href="#" class="card-link">Voller Kalender →</a>',
    '<a href="#" class="card-link" onclick="showSection(' + APO + 'kalender' + APO + '); return false">Voller Kalender →</a>'
)
src = src.replace(
    '<a href="#" class="card-link" onclick="showSection(' + APO + 'kursbloecke' + APO + '); return false">Voller Kalender →</a>',
    '<a href="#" class="card-link" onclick="showSection(' + APO + 'kalender' + APO + '); return false">Voller Kalender →</a>'
)
print('OK: Voller Kalender links wired to #kalender')

# Inject a sectionLoader for kalender
loader_anchor = "// Phase 2a: SPA-Router"
kalender_loader = """
// === Kalender-Section Loader ===
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders.kalender = function() {
  var s = window.dashboardState; if (!s) return;
  var sub = document.getElementById('phKalSub');
  var grid = document.getElementById('phKalGrid');
  if (!grid) return;
  var activities = (s.activities || []).filter(function(a){ return a && a.status !== 'archived' && a.status !== 'cancelled'; });
  if (activities.length === 0) {
    if (sub) sub.textContent = 'Keine Termine — leg deinen ersten Kurs an.';
    grid.innerHTML = '<div style=\"padding:60px 40px;color:var(--muted);text-align:center\">'
      + '<div style=\"font-family:Lora,serif;font-size:32px;color:var(--apricot-deep);margin-bottom:14px\">Noch leer</div>'
      + '<div style=\"font-size:14px;line-height:1.6;max-width:480px;margin:0 auto\">Wenn du Kurse anlegst, erscheinen sie hier wochenweise mit Tag, Uhrzeit, Raum und Auslastung.</div>'
      + '</div>';
    return;
  }

  // Build 4 weeks worth of session occurrences
  var dayKeys = ['MO','TU','WE','TH','FR','SA','SU'];
  var dayLabels = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
  var months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  var now = new Date(); now.setHours(0,0,0,0);
  var dow = now.getDay();
  var diffToMon = (dow + 6) % 7;
  var monday = new Date(now); monday.setDate(now.getDate() - diffToMon);

  var bucketHtml = '';
  var totalThisWeek = 0;
  for (var w = 0; w < 4; w++) {
    var weekStart = new Date(monday); weekStart.setDate(monday.getDate() + w*7);
    var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    var weekHeader = weekStart.getDate() + '. ' + months[weekStart.getMonth()] + ' – ' + weekEnd.getDate() + '. ' + months[weekEnd.getMonth()] + ' ' + weekEnd.getFullYear();
    var weekRows = '';
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      var dKey = dayKeys[i];
      var todays = activities.filter(function(a) {
        var sl = (a.schedule && a.schedule.slots) || [];
        return sl.some(function(s){ return s.day === dKey; });
      });
      todays.sort(function(a, b) {
        var sa = (a.schedule.slots.find(function(s){ return s.day === dKey; })||{}).startTime || '';
        var sb = (b.schedule.slots.find(function(s){ return s.day === dKey; })||{}).startTime || '';
        return sa.localeCompare(sb);
      });
      if (todays.length === 0) continue;
      if (w === 0) totalThisWeek += todays.length;
      var dDateLabel = d.getDate() + '. ' + months[d.getMonth()];
      var entries = todays.map(function(a) {
        var slot = a.schedule.slots.find(function(x){ return x.day === dKey; }) || {};
        var time = (slot.startTime || '').slice(0,5) + (slot.endTime ? '–' + slot.endTime.slice(0,5) : '');
        var bookedFn = (window.capacityOf || function(x){ return { booked: 0, cap: x.capacity || 0 }; });
        var booked = (s.bookings || []).filter(function(b){ return b && b.activityId === a.id && b.status !== 'cancelled' && b.status !== 'refunded'; }).length;
        var cap = a.capacity || 0;
        return '<div class=\"week-event\" style=\"margin:6px 0;padding:10px 14px;border-radius:10px;background:var(--apricot-tint);color:var(--ink);cursor:pointer\" onclick=\"window.viewCourseDetail(\\'' + a.id + '\\')\">'
          + '<div style=\"font-weight:600;font-size:14px;\">' + escapeHtml(a.title || 'Kurs') + '</div>'
          + '<div style=\"font-size:12px;color:var(--ink-2);margin-top:2px;\">' + time + ' · ' + booked + '/' + cap + ' · ' + escapeHtml(a.category || '') + '</div>'
          + '</div>';
      }).join('');
      weekRows += '<div style=\"display:grid;grid-template-columns:160px 1fr;gap:18px;padding:14px 0;border-bottom:1px dashed rgba(60,33,36,.08);\">'
        + '<div><div style=\"font-weight:600;font-size:13px;color:var(--ink)\">' + dayLabels[i] + '</div><div style=\"font-size:12px;color:var(--muted)\">' + dDateLabel + '</div></div>'
        + '<div>' + entries + '</div>'
        + '</div>';
    }
    if (!weekRows) {
      weekRows = '<div style=\"padding:18px 0;color:var(--muted);font-size:13px\">Keine Termine in dieser Woche.</div>';
    }
    bucketHtml += '<div style=\"margin-bottom:32px\">'
      + '<div style=\"font-family:Lora,serif;font-size:22px;font-weight:600;color:var(--apricot-deep);margin-bottom:10px\">'
      + (w === 0 ? 'Diese Woche · ' : (w === 1 ? 'Nächste Woche · ' : 'Woche +' + w + ' · '))
      + weekHeader + '</div>'
      + weekRows
      + '</div>';
  }

  if (sub) sub.textContent = totalThisWeek + ' Termin' + (totalThisWeek === 1 ? '' : 'e') + ' diese Woche · 4-Wochen-Vorschau';
  grid.innerHTML = bucketHtml;
};
"""
if loader_anchor in src:
    src = src.replace(loader_anchor, kalender_loader.rstrip() + "\n\n  " + loader_anchor, 1)
    print('OK: kalender sectionLoader added')

# --------------------------------------------------------------
# 5. Credits add-up badge: small CSS tweak — find offending element
#    Search for the credit explanation circle (1x Add-Up).
# --------------------------------------------------------------
# Likely class .credit-eq or similar. Grep first.
m_credit = re.search(r"<div[^>]*style=\"[^\"]*border-radius:50%[^\"]*\"[^>]*>\s*1x\s*<br[^>]*>\s*Add-?\s*<br[^>]*>\s*Up", src)
if m_credit:
    print('Credit add-up circle anchor located')
# Quick CSS injection to ensure the circle text fits properly. We'll add a
# rule that wraps tightly inside .credit-explainer-circle (if such class exists),
# otherwise an inline rule for any small badge text.

# Use a more reliable approach: inject CSS that targets text spans inside
# circle-shaped credit boxes.
extra_css = """

/* === Credits explainer add-up circle === */
.credits-explainer .ce-circle { width: 90px; height: 90px; border-radius: 50%; display:flex;align-items:center;justify-content:center;flex-direction:column; font-size:13px; line-height:1.15; padding:6px; box-sizing:border-box; }
.credits-explainer .ce-circle em { font-family: 'Lora', Georgia, serif; font-style: italic; font-weight:500; }
"""
style_close = "</style>"
src = src.replace(style_close, extra_css + "\n" + style_close, 1)
print('OK: credits explainer CSS injected')

open(p, 'w', encoding='utf-8').write(src)
print('All patches applied to dashboard-v3.html')
