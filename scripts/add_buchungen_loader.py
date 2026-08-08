"""Sprint A.3: Replace buchungen-section with dynamic skeleton + add loader."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="buchungen"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()
old_content = src[m.start():end]

new_content = '''<div class="section" data-section="buchungen" hidden>
        <div class="page">

      <!-- PAGE HEAD -->
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker" id="phBuchKicker">&nbsp;</div>
          <h1 class="page-title">Alle <em>Buchungen</em></h1>
          <p class="page-sub" id="phBuchSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('Export folgt in Sprint B')">Exportieren</button>
          <button class="btn btn-primary" onclick="alert('Neue Buchung folgt in Sprint B')">+ Neue Buchung</button>
        </div>
      </div>

      <!-- STATS -->
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Diesen Monat</div>
          <div class="stat-value" id="phBuchMonat">&ndash; <em>Buchungen</em></div>
          <div class="stat-delta" id="phBuchMonatDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Umsatz &middot; <span id="phBuchUmsatzLabel">Monat</span></div>
          <div class="stat-value" id="phBuchUmsatz">&ndash;<em>&euro;</em></div>
          <div class="stat-delta" id="phBuchUmsatzDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Offene Zahlungen</div>
          <div class="stat-value" id="phBuchOffen">&ndash; <em>offen</em></div>
          <div class="stat-delta" id="phBuchOffenDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Stornierungen</div>
          <div class="stat-value" id="phBuchStorno">&ndash; <em>Stk.</em></div>
          <div class="stat-delta" id="phBuchStornoDelta">&nbsp;</div>
        </div>
      </div>

      <!-- FILTER -->
      <div class="filter-bar">
        <div class="filter-tabs" id="phBuchTabs">
          <button class="filter-tab active" data-status="all">Alle <span class="count" data-count="all">0</span></button>
          <button class="filter-tab" data-status="paid">Bezahlt <span class="count" data-count="paid">0</span></button>
          <button class="filter-tab" data-status="open">Offen <span class="count" data-count="open">0</span></button>
          <button class="filter-tab" data-status="cancelled">Storniert <span class="count" data-count="cancelled">0</span></button>
        </div>
        <div class="filter-sep"></div>
        <select class="filter-select" id="phBuchKurs" aria-label="Kurs">
          <option value="all">Alle Kurse</option>
        </select>
        <select class="filter-select" id="phBuchRange" aria-label="Zeitraum">
          <option value="month">Zeitraum: Dieser Monat</option>
          <option value="7d">Letzte 7 Tage</option>
          <option value="30d">Letzte 30 Tage</option>
          <option value="prevmonth">Letzter Monat</option>
          <option value="quarter">Quartal</option>
          <option value="all">Alle</option>
        </select>
      </div>

      <!-- TABLE -->
      <div class="card kurse-table-wrap" style="padding:0;overflow:hidden;">
        <table class="kurse-table">
          <thead>
            <tr>
              <th style="padding-left:20px;">Kunde</th>
              <th>Kurs</th>
              <th>Gebucht am</th>
              <th>Zahlungsmethode</th>
              <th>Betrag</th>
              <th>Status</th>
              <th style="padding-right:20px;text-align:right;">Aktionen</th>
            </tr>
          </thead>
          <tbody id="phBuchTbody">
            <tr><td colspan="7" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Buchungen&hellip;</td></tr>
          </tbody>
        </table>
      </div>

      <!-- PAGER -->
      <div class="pager" id="phBuchPager" style="display:none"></div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

# Now add the loader before Phase 2a SPA-Router
loader = r"""
// ============================================================
// Sprint A.3: Buchungen-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.buchungen = function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] buchungen: state not ready'); return; }
  const { bookings, activities } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtPrice(cents) { return ((cents||0)/100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €'; }
  function fmtDate(d) { if (!d) return '—'; const x = new Date(d); return x.toLocaleDateString('de-DE',{day:'2-digit',month:'short'}) + ' · ' + x.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }
  function statusOf(b) {
    const s = (b.status || b.paymentStatus || '').toLowerCase();
    if (s === 'cancelled' || s === 'canceled' || s === 'storniert' || b.cancelledAt) return 'cancelled';
    if (s === 'paid' || s === 'bezahlt' || s === 'completed' || b.paidAt) return 'paid';
    return 'open';
  }
  function statusLabel(s) { return ({paid:'Bezahlt', open:'Offen', cancelled:'Storniert'})[s] || s; }
  function statusPill(s) { return ({paid:'pill-ok', open:'pill-pending', cancelled:'pill-err'})[s] || ''; }
  function methodLabel(b) {
    const m = (b.paymentMethod || b.method || '').toLowerCase();
    if (m.includes('stripe') || m.includes('card') || m.includes('kart')) return 'Kreditkarte';
    if (m.includes('paypal')) return 'PayPal';
    if (m.includes('sepa')) return 'SEPA';
    if (m.includes('rechnung') || m.includes('invoice')) return 'Rechnung';
    if (m.includes('bar') || m.includes('cash')) return 'Bar';
    return b.paymentMethod || b.method || '—';
  }

  // ---------- KPIs (this month) ----------
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const monthBookings = bookings.filter(b => { const d = new Date(b.createdAt || b.bookedAt || 0); return d >= monthStart; });
  const prevMonthBookings = bookings.filter(b => { const d = new Date(b.createdAt || b.bookedAt || 0); return d >= prevMonthStart && d <= prevMonthEnd; });
  const monthPaidRevenue = monthBookings.filter(b => statusOf(b) === 'paid').reduce((s,b) => s + (b.amountCents || b.priceCents || 0), 0);
  const prevMonthPaidRevenue = prevMonthBookings.filter(b => statusOf(b) === 'paid').reduce((s,b) => s + (b.amountCents || b.priceCents || 0), 0);
  const monthDelta = prevMonthBookings.length > 0 ? Math.round((monthBookings.length - prevMonthBookings.length)/prevMonthBookings.length*100) : null;
  const revDelta = prevMonthPaidRevenue > 0 ? Math.round((monthPaidRevenue - prevMonthPaidRevenue)/prevMonthPaidRevenue*100) : null;

  const counts = { all: bookings.length, paid: 0, open: 0, cancelled: 0 };
  bookings.forEach(b => { counts[statusOf(b)]++; });
  const openBookings = bookings.filter(b => statusOf(b) === 'open');
  const totalOpen = openBookings.reduce((s,b) => s + (b.amountCents || b.priceCents || 0), 0);
  const recentCancel = bookings.filter(b => statusOf(b) === 'cancelled').sort((a,b) => new Date(b.cancelledAt || b.updatedAt || 0) - new Date(a.cancelledAt || a.updatedAt || 0))[0];

  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  document.getElementById('phBuchKicker').textContent = months[now.getMonth()] + ' ' + now.getFullYear() + ' · ' + bookings.length + ' Buchung' + (bookings.length === 1 ? '' : 'en') + ' insgesamt';
  const sub = document.getElementById('phBuchSub');
  if (bookings.length === 0) {
    sub.textContent = 'Noch keine Buchungen.';
  } else {
    sub.textContent = fmtPrice(monthPaidRevenue) + ' Umsatz · ' + counts.open + ' offen · ' + counts.cancelled + ' storniert · ' + counts.paid + ' bezahlt.';
  }
  document.getElementById('phBuchMonat').innerHTML = monthBookings.length + ' <em>Buchungen</em>';
  const monatDelta = document.getElementById('phBuchMonatDelta');
  if (monthDelta !== null) { monatDelta.className = 'stat-delta ' + (monthDelta >= 0 ? 'up' : 'down'); monatDelta.innerHTML = '<strong>' + (monthDelta >= 0 ? '+' : '') + monthDelta + ' %</strong> vs. ' + months[(now.getMonth()-1+12)%12]; }
  else { monatDelta.textContent = bookings.length === 0 ? 'Noch keine Buchungen' : 'Erstmonat'; }
  document.getElementById('phBuchUmsatz').innerHTML = (monthPaidRevenue/100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + '<em>€</em>';
  const uDelta = document.getElementById('phBuchUmsatzDelta');
  if (revDelta !== null) { uDelta.className = 'stat-delta ' + (revDelta >= 0 ? 'up' : 'down'); uDelta.innerHTML = '<strong>' + (revDelta >= 0 ? '+' : '') + revDelta + ' %</strong> vs. ' + months[(now.getMonth()-1+12)%12]; }
  else { uDelta.textContent = ' '; }
  document.getElementById('phBuchOffen').innerHTML = counts.open + ' <em>offen</em>';
  document.getElementById('phBuchOffenDelta').textContent = totalOpen > 0 ? fmtPrice(totalOpen) + ' ausstehend' : ' ';
  document.getElementById('phBuchStorno').innerHTML = counts.cancelled + ' <em>Stk.</em>';
  if (recentCancel) {
    const days = Math.floor((Date.now() - new Date(recentCancel.cancelledAt || recentCancel.updatedAt || 0)) / 86400000);
    document.getElementById('phBuchStornoDelta').textContent = days === 0 ? 'letzte: heute' : 'letzte: vor ' + days + ' Tag' + (days === 1 ? '' : 'en');
  } else {
    document.getElementById('phBuchStornoDelta').textContent = ' ';
  }

  // tab counts
  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phBuchTabs .count[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  // populate course filter
  const courseSel = document.getElementById('phBuchKurs');
  const courseTitles = new Set();
  bookings.forEach(b => { const t = b.activityName || b.activityTitle; if (t) courseTitles.add(t); });
  activities.forEach(a => { const t = a.title || a.name; if (t) courseTitles.add(t); });
  Array.from(courseTitles).sort().forEach(t => {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t; courseSel.appendChild(opt);
  });

  // ---------- Render ----------
  let activeStatus = 'all', activeCourse = 'all', activeRange = 'month';

  function inRange(b) {
    const d = new Date(b.createdAt || b.bookedAt || 0);
    if (activeRange === 'all') return true;
    if (activeRange === 'month') return d >= monthStart;
    if (activeRange === 'prevmonth') return d >= prevMonthStart && d <= prevMonthEnd;
    if (activeRange === '7d') return d >= new Date(Date.now() - 7*86400000);
    if (activeRange === '30d') return d >= new Date(Date.now() - 30*86400000);
    if (activeRange === 'quarter') return d >= new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
    return true;
  }

  function render() {
    let list = bookings.slice();
    if (activeStatus !== 'all') list = list.filter(b => statusOf(b) === activeStatus);
    if (activeCourse !== 'all') list = list.filter(b => (b.activityName || b.activityTitle) === activeCourse);
    list = list.filter(inRange);
    list.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const tbody = document.getElementById('phBuchTbody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Buchungen in dieser Ansicht.</td></tr>';
      return;
    }
    tbody.innerHTML = list.slice(0, 50).map(b => {
      const c = b.customer || {};
      const cname = c.name || c.email || b.customerName || 'Unbekannt';
      const childName = b.childName || (b.child && b.child.name) || '';
      const childInfo = childName ? '<div class="cust-sub">Kind: ' + escapeHtml(childName) + '</div>' : '';
      const initial = cname.charAt(0).toUpperCase();
      const s = statusOf(b);
      return '<tr style="cursor:default">'
        + '<td style="padding-left:20px;"><div class="cust"><div class="cust-av">' + escapeHtml(initial) + '</div><div class="cust-info"><div class="cust-name">' + escapeHtml(cname) + '</div>' + childInfo + '</div></div></td>'
        + '<td>' + escapeHtml(b.activityName || b.activityTitle || '—') + '</td>'
        + '<td>' + fmtDate(b.createdAt) + '</td>'
        + '<td>' + escapeHtml(methodLabel(b)) + '</td>'
        + '<td>' + fmtPrice(b.amountCents || b.priceCents) + '</td>'
        + '<td><span class="pill ' + statusPill(s) + '">' + statusLabel(s) + '</span></td>'
        + '<td style="padding-right:20px;text-align:right;">'
        + '<button class="row-action-btn" title="Ansehen" onclick="alert(\'Buchung-Detail folgt\')">⊙</button> '
        + '<button class="row-action-btn" title="Bearbeiten" onclick="alert(\'Bearbeiten folgt\')">✎</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\'Aktionen folgen\')">⋯</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    const pager = document.getElementById('phBuchPager');
    if (list.length > 50) {
      pager.style.display = 'flex';
      pager.innerHTML = '<div>1–50 von ' + list.length + ' Buchungen</div>';
    } else {
      pager.style.display = 'none';
    }
  }

  document.querySelectorAll('#phBuchTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phBuchTabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    };
  });
  document.getElementById('phBuchKurs').onchange = (e) => { activeCourse = e.target.value; render(); };
  document.getElementById('phBuchRange').onchange = (e) => { activeRange = e.target.value; render(); };

  render();
};
"""

# Inject before Phase 2a SPA-Router
marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: marker not found'); exit(1)

src = src.replace(marker, loader + '\n' + marker, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: buchungen skeleton + loader added. File: {len(src)} bytes')
