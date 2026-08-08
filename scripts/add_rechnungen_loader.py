"""Sprint B.3: Rechnungen-Section dynamic."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

m = re.search(r'<div class="section" data-section="rechnungen"[^>]*>', src)
nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
end = m.end() + nm[0].start()

new_content = '''<div class="section" data-section="rechnungen" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker" id="phInvKicker">&nbsp;</div>
          <h1 class="page-title">Alle <em>Rechnungen</em></h1>
          <p class="page-sub" id="phInvSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('DATEV-Export folgt')">DATEV-Export</button>
          <button class="btn btn-primary" onclick="alert('Rechnung erstellen folgt')">+ Rechnung erstellen</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Umsatz &middot; <span id="phInvRangeLabel">Monat</span></div>
          <div class="stat-value" id="phInvRevenue">&ndash;<em>&euro;</em></div>
          <div class="stat-delta" id="phInvRevenueDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">Offen</div>
          <div class="stat-value" id="phInvOpen">&ndash;<em>&euro;</em></div>
          <div class="stat-delta" id="phInvOpenDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">&Uuml;berf&auml;llig</div>
          <div class="stat-value" id="phInvOverdue">&ndash;<em>&euro;</em></div>
          <div class="stat-delta" id="phInvOverdueDelta">&nbsp;</div>
        </div>
        <div class="stat">
          <div class="stat-label">&Oslash; Zahlungsdauer</div>
          <div class="stat-value" id="phInvAvgPay">&ndash; <em>Tage</em></div>
          <div class="stat-delta" id="phInvAvgPayDelta">&nbsp;</div>
        </div>
      </div>

      <div class="filter-bar">
        <div class="filter-tabs" id="phInvTabs">
          <button class="filter-tab active" data-status="all">Alle <span class="count" data-count="all">0</span></button>
          <button class="filter-tab" data-status="paid">Bezahlt <span class="count" data-count="paid">0</span></button>
          <button class="filter-tab" data-status="open">Offen <span class="count" data-count="open">0</span></button>
          <button class="filter-tab" data-status="overdue">&Uuml;berf&auml;llig <span class="count" data-count="overdue">0</span></button>
          <button class="filter-tab" data-status="draft">Entw&uuml;rfe <span class="count" data-count="draft">0</span></button>
        </div>
        <div class="filter-sep"></div>
        <select class="filter-select" id="phInvRange" aria-label="Zeitraum">
          <option value="month">Zeitraum: Dieser Monat</option>
          <option value="30d">Letzte 30 Tage</option>
          <option value="quarter">Quartal</option>
          <option value="year">Dieses Jahr</option>
          <option value="all">Alle</option>
        </select>
        <select class="filter-select" id="phInvSort" aria-label="Sortierung">
          <option value="newest">Sortieren: Neueste zuerst</option>
          <option value="amount">Betrag (h&ouml;chster)</option>
          <option value="due">F&auml;lligkeit</option>
          <option value="overdue">&Uuml;berf&auml;llig (l&auml;ngste)</option>
        </select>
      </div>

      <div class="card kurse-table-wrap" style="padding:0;overflow:hidden;">
        <table class="kurse-table">
          <thead>
            <tr>
              <th style="padding-left:20px;">Rechnungsnr.</th>
              <th>Kunde / Kurs</th>
              <th>F&auml;lligkeit</th>
              <th>Betrag</th>
              <th>Status</th>
              <th style="padding-right:20px;text-align:right;">Aktionen</th>
            </tr>
          </thead>
          <tbody id="phInvTbody">
            <tr><td colspan="6" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Rechnungen&hellip;</td></tr>
          </tbody>
        </table>
      </div>

      </div>  <!-- close .page -->
      '''

src = src[:m.start()] + new_content + src[end:]

loader = r"""
// ============================================================
// Sprint B.3: Rechnungen-Section Loader
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};
window.sectionLoaders.rechnungen = async function() {
  const state = window.dashboardState;
  if (!state) { console.warn('[v3] rechnungen: state not ready'); return; }
  const { provider, api } = state;

  function escapeHtml(str) { return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtPrice(cents) { return ((cents||0)/100).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €'; }
  function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'}); }
  function statusOf(inv) {
    const s = (inv.status || '').toLowerCase();
    if (s === 'draft' || s === 'entwurf') return 'draft';
    if (s === 'paid' || s === 'bezahlt' || inv.paidAt) return 'paid';
    if (s === 'cancelled' || s === 'canceled' || s === 'storniert') return 'cancelled';
    if (inv.dueAt && new Date(inv.dueAt) < new Date()) return 'overdue';
    return 'open';
  }
  function statusLabel(s) { return ({paid:'Bezahlt', open:'Offen', overdue:'Überfällig', draft:'Entwurf', cancelled:'Storniert'})[s] || s; }
  function statusPill(s) { return ({paid:'pill-ok', open:'pill-pending', overdue:'pill-err', draft:'', cancelled:''})[s] || ''; }

  let invoices = [];
  try {
    const r = await api('/providers/' + provider.id + '/invoices');
    invoices = r.data || r.invoices || r || [];
  } catch (e) { console.warn('[v3] /invoices failed', e); }

  // ---- KPIs ----
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const monthInvs = invoices.filter(i => { const d = new Date(i.createdAt || i.issuedAt || 0); return d >= monthStart; });
  const monthRevenue = monthInvs.filter(i => statusOf(i) === 'paid').reduce((s,i) => s + (i.amountCents || i.totalCents || 0), 0);
  const openSum = invoices.filter(i => statusOf(i) === 'open').reduce((s,i) => s + (i.amountCents || i.totalCents || 0), 0);
  const overdueInvs = invoices.filter(i => statusOf(i) === 'overdue');
  const overdueSum = overdueInvs.reduce((s,i) => s + (i.amountCents || i.totalCents || 0), 0);

  // Average payment days
  const paidWithDays = invoices.filter(i => statusOf(i) === 'paid' && i.paidAt && (i.issuedAt || i.createdAt));
  const avgDays = paidWithDays.length > 0
    ? (paidWithDays.reduce((s,i) => s + (new Date(i.paidAt) - new Date(i.issuedAt || i.createdAt))/86400000, 0) / paidWithDays.length).toFixed(1)
    : '–';

  const counts = { all: invoices.length, paid: 0, open: 0, overdue: 0, draft: 0, cancelled: 0 };
  invoices.forEach(i => { counts[statusOf(i)]++; });

  document.getElementById('phInvKicker').textContent = 'Rechnungsausgang · ' + months[now.getMonth()] + ' ' + now.getFullYear();
  document.getElementById('phInvSub').textContent = invoices.length === 0
    ? 'Noch keine Rechnungen erstellt.'
    : invoices.length + ' Rechnungen insgesamt · ' + counts.paid + ' bezahlt · ' + counts.open + ' offen · ' + counts.overdue + ' überfällig.';

  document.getElementById('phInvRevenue').innerHTML = (monthRevenue/100).toLocaleString('de-DE',{maximumFractionDigits:0}) + '<em>€</em>';
  document.getElementById('phInvRevenueDelta').textContent = invoices.length === 0 ? 'Noch leer' : ' ';
  document.getElementById('phInvOpen').innerHTML = (openSum/100).toLocaleString('de-DE',{maximumFractionDigits:0}) + '<em>€</em>';
  document.getElementById('phInvOpenDelta').textContent = counts.open + ' Rechnung' + (counts.open === 1 ? '' : 'en');
  document.getElementById('phInvOverdue').innerHTML = (overdueSum/100).toLocaleString('de-DE',{maximumFractionDigits:0}) + '<em>€</em>';
  document.getElementById('phInvOverdueDelta').textContent = counts.overdue === 0 ? ' ' : counts.overdue + ' Mahnung' + (counts.overdue === 1 ? '' : 'en') + ' fällig';
  document.getElementById('phInvAvgPay').innerHTML = avgDays + ' <em>Tage</em>';
  document.getElementById('phInvAvgPayDelta').textContent = paidWithDays.length === 0 ? ' ' : ' ';

  Object.keys(counts).forEach(k => {
    const el = document.querySelector('#phInvTabs .count[data-count="' + k + '"]');
    if (el) el.textContent = counts[k];
  });

  let activeStatus = 'all', activeRange = 'month', activeSort = 'newest';

  function inRange(i) {
    const d = new Date(i.createdAt || i.issuedAt || 0);
    if (activeRange === 'all') return true;
    if (activeRange === 'month') return d >= monthStart;
    if (activeRange === '30d') return d >= new Date(Date.now() - 30*86400000);
    if (activeRange === 'quarter') return d >= new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
    if (activeRange === 'year') return d >= new Date(now.getFullYear(), 0, 1);
    return true;
  }

  function render() {
    let list = invoices.slice();
    if (activeStatus !== 'all') list = list.filter(i => statusOf(i) === activeStatus);
    list = list.filter(inRange);
    list.sort((a,b) => {
      if (activeSort === 'amount') return (b.amountCents||b.totalCents||0) - (a.amountCents||a.totalCents||0);
      if (activeSort === 'due') return new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
      if (activeSort === 'overdue') {
        const oa = (statusOf(a) === 'overdue') ? (Date.now() - new Date(a.dueAt)) : -1;
        const ob = (statusOf(b) === 'overdue') ? (Date.now() - new Date(b.dueAt)) : -1;
        return ob - oa;
      }
      return new Date(b.createdAt || b.issuedAt || 0) - new Date(a.createdAt || a.issuedAt || 0);
    });

    const tbody = document.getElementById('phInvTbody');
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Rechnungen in dieser Ansicht.</td></tr>';
      return;
    }
    tbody.innerHTML = list.slice(0, 50).map(i => {
      const c = i.customer || {};
      const cname = c.name || c.email || i.customerName || 'Unbekannt';
      const activity = i.activityName || i.activityTitle || (i.lineItems && i.lineItems[0] && i.lineItems[0].title) || '';
      const s = statusOf(i);
      return '<tr>'
        + '<td style="padding-left:20px;"><strong>' + escapeHtml(i.invoiceNumber || i.number || '—') + '</strong></td>'
        + '<td>' + escapeHtml(cname) + (activity ? '<br><span style="font-size:11px;color:var(--muted)">' + escapeHtml(activity) + '</span>' : '') + '</td>'
        + '<td>' + fmtDate(i.dueAt) + '</td>'
        + '<td>' + fmtPrice(i.amountCents || i.totalCents) + '</td>'
        + '<td><span class="pill ' + statusPill(s) + '">' + statusLabel(s) + '</span></td>'
        + '<td style="padding-right:20px;text-align:right;">'
        + '<button class="row-action-btn" title="Ansehen" onclick="window.open(\'/invoice-preview.pdf\',\'_blank\')">⊙</button> '
        + '<button class="row-action-btn" title="Erinnern" onclick="alert(\'Erinnerung folgt\')">✉</button> '
        + '<button class="row-action-btn" title="Weitere" onclick="alert(\'Aktionen folgen\')">⋯</button>'
        + '</td>'
        + '</tr>';
    }).join('');
  }

  document.querySelectorAll('#phInvTabs .filter-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#phInvTabs .filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    };
  });
  document.getElementById('phInvRange').onchange = (e) => { activeRange = e.target.value; render(); };
  document.getElementById('phInvSort').onchange = (e) => { activeSort = e.target.value; render(); };

  render();
};
"""

marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker not in src:
    print('FAIL: marker not found'); exit(1)
src = src.replace(marker, loader + '\n' + marker, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'OK: rechnungen migrated. File: {len(src)} bytes')
