"""Sprint C: Credits, Team, Raeume, Ferien, Einstellungen — minimal dynamic + Empty-States."""
import re

p = '/opt/urban-kids-club-prod-v2/packages/provider-dashboard/src/frontend/dashboard-v3.html'
with open(p, 'r', encoding='utf-8') as f:
    src = f.read()

def replace_section(src, name, new_content):
    m = re.search(r'<div class="section" data-section="' + name + r'"[^>]*>', src)
    if not m: return src, False
    nm = list(re.finditer(r'<div class="section" data-section', src[m.end():]))
    end = m.end() + nm[0].start() if nm else len(src)
    return src[:m.start()] + new_content + src[end:], True

# ============ CREDITS ============
credits_html = '''<div class="section" data-section="credits" hidden>
        <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Credit-System &middot; Add-Up-P&auml;sse</div>
          <h1 class="page-title">Credits &amp; <em>Familien-P&auml;sse</em></h1>
          <p class="page-sub" id="phCreditsSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('Credit-Regeln folgen')">Regeln</button>
          <button class="btn btn-primary" onclick="alert('Credits gutschreiben folgt')">+ Credits gutschreiben</button>
        </div>
      </div>

      <div class="credit-banner">
        <div>
          <h3>Wie der <em>Credit</em> funktioniert</h3>
          <p>Eine Familie kauft z.&nbsp;B. einen 8er-Kursblock und bekommt automatisch 2 Add-Up-Credits geschenkt. Wird das Kind krank oder will sie spontan zu einem zweiten Kurs am Sa, kann sie 1 Credit einl&ouml;sen. Keine Verfallsdauer im aktiven Block. Nach Block-Ende verfallen ungenutzte Credits &mdash; au&szlig;er Familie verl&auml;ngert.</p>
        </div>
        <div class="credit-pic">
          <div class="credit-circle">C</div>
          <div class="credit-arrow">&rarr;</div>
          <div class="credit-circle outcome">1&times;<br>Add-Up</div>
        </div>
      </div>

      <h2 style="font-family:var(--font-heading);font-weight:700;font-size:20px;color:var(--ink);margin-bottom:12px;">Credit-<em class="italic-accent" style="color:var(--primary);">Verlauf</em></h2>
      <div class="card" style="padding:0;overflow:hidden;">
        <table class="kurse-table">
          <thead><tr><th style="padding-left:20px;">Familie</th><th>Aktion</th><th>Credits</th><th>Datum</th><th style="padding-right:20px;text-align:right;">Status</th></tr></thead>
          <tbody id="phCreditsTbody"><tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt&hellip;</td></tr></tbody>
        </table>
      </div>

      </div>
      '''
src, ok = replace_section(src, 'credits', credits_html)
print(f'credits: {"OK" if ok else "NOT FOUND"}')

# ============ TEAM ============
team_html = '''<div class="section" data-section="team" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Personen &middot; Rollen &middot; Zugriffe</div>
          <h1 class="page-title">Dein <em class="italic">Team</em></h1>
          <p class="page-sub" id="phTeamSub">L&auml;dt&hellip;</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="alert('Person einladen folgt')">+ Person einladen</button>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Aktive Mitarbeiter</div>
          <div class="kpi-value" id="phTeamActive">&ndash;</div>
          <div class="kpi-trend" id="phTeamRoles">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Einladungen offen</div>
          <div class="kpi-value" id="phTeamPending">&ndash;</div>
          <div class="kpi-trend" id="phTeamPendingDelta">&nbsp;</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Diese Woche</div>
          <div class="kpi-value" id="phTeamHours">&ndash;</div>
          <div class="kpi-trend">Trainer-Stunden</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Trainer-NPS</div>
          <div class="kpi-value" id="phTeamNPS">&ndash;</div>
          <div class="kpi-trend">Durchschnitt</div>
        </div>
      </div>

      <div class="team-grid" id="phTeamGrid">
        <div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Team&hellip;</div>
      </div>

      </div>
      '''
src, ok = replace_section(src, 'team', team_html)
print(f'team: {"OK" if ok else "NOT FOUND"}')

# ============ RAEUME ============
raeume_html = '''<div class="section" data-section="raeume" hidden>
        <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker" id="phRoomsKicker">&nbsp;</div>
          <h1 class="page-title">R&auml;ume &amp; <em>Verf&uuml;gbarkeit</em></h1>
          <p class="page-sub" id="phRoomsSub">L&auml;dt&hellip;</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="alert('Belegungsplan folgt')">Belegungsplan</button>
          <button class="btn btn-primary" onclick="alert('Raum anlegen folgt')">+ Neuer Raum</button>
        </div>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat"><div class="stat-label">R&auml;ume aktiv</div><div class="stat-value" id="phRoomsActive">&ndash;</div><div class="stat-delta" id="phRoomsActiveDelta">&nbsp;</div></div>
        <div class="stat"><div class="stat-label">Auslastung &middot; &Oslash;</div><div class="stat-value" id="phRoomsUtil">&ndash; <em>%</em></div><div class="stat-delta">&nbsp;</div></div>
        <div class="stat"><div class="stat-label">Kollisionen verhindert &middot; 30d</div><div class="stat-value" id="phRoomsConflicts">&ndash;</div><div class="stat-delta">Auto-Blocks beim Anlegen</div></div>
        <div class="stat"><div class="stat-label">Buchungen heute</div><div class="stat-value" id="phRoomsTodayBookings">&ndash;</div><div class="stat-delta">&nbsp;</div></div>
      </div>

      <div class="block-grid" id="phRoomsGrid">
        <div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt R&auml;ume&hellip;</div>
      </div>

      </div>
      '''
src, ok = replace_section(src, 'raeume', raeume_html)
print(f'raeume: {"OK" if ok else "NOT FOUND"}')

# ============ FERIEN ============
ferien_html = '''<div class="section" data-section="ferien" hidden>
        <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Feiertage &middot; Pausen &middot; Saisons</div>
          <h1 class="page-title">Ferien &amp; <em class="italic">Saisons</em></h1>
          <p class="page-sub" id="phFerienSub">L&auml;dt&hellip;</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="alert('Pause anlegen folgt')">+ Neue Pause</button>
        </div>
      </div>

      <div class="hero-card" id="phFerienHero">
        <div class="hero-left">
          <div class="section-kicker">Aktueller Status</div>
          <h2 class="hero-title">L&auml;dt&hellip;</h2>
          <p class="hero-sub" id="phFerienHeroSub">&nbsp;</p>
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi"><div class="kpi-label">Feiertage <span id="phFerienYear">2026</span></div><div class="kpi-value" id="phFerienHolidays">&ndash;</div><div class="kpi-trend" id="phFerienBundesland">automatisch</div></div>
        <div class="kpi"><div class="kpi-label">Eigene Pausen</div><div class="kpi-value" id="phFerienOwnBreaks">&ndash;</div><div class="kpi-trend">&nbsp;</div></div>
        <div class="kpi"><div class="kpi-label">N&auml;chste Schlie&szlig;ung in</div><div class="kpi-value" id="phFerienNextDays">&ndash;</div><div class="kpi-trend" id="phFerienNextLabel">&nbsp;</div></div>
        <div class="kpi"><div class="kpi-label">Betroffene Buchungen</div><div class="kpi-value" id="phFerienAffected">&ndash;</div><div class="kpi-trend">in n&auml;chster Schlie&szlig;ung</div></div>
      </div>

      <div class="card" style="padding:0;overflow:hidden;margin-top:22px;">
        <table class="kurse-table">
          <thead><tr><th style="padding-left:20px;">Datum</th><th>Anlass</th><th>Typ</th><th>Status</th><th style="padding-right:20px;text-align:right;">Aktion</th></tr></thead>
          <tbody id="phFerienTbody"><tr><td colspan="5" style="padding:30px;color:var(--muted);text-align:center;font-size:13px">L&auml;dt Ferientage&hellip;</td></tr></tbody>
        </table>
      </div>

      </div>
      '''
src, ok = replace_section(src, 'ferien', ferien_html)
print(f'ferien: {"OK" if ok else "NOT FOUND"}')

# ============ EINSTELLUNGEN ============
einst_html = '''<div class="section" data-section="einstellungen" hidden>
        <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Provider-Konto &middot; Profil &middot; Zahlungsdaten</div>
          <h1 class="page-title">Deine <em class="italic">Einstellungen</em></h1>
          <p class="page-sub" id="phSetSub">L&auml;dt&hellip;</p>
        </div>
        <div>
          <button class="btn btn-primary" onclick="alert('Speichern folgt')">Speichern</button>
        </div>
      </div>

      <div class="card" style="padding:24px;">
        <h3 style="font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:18px;">Allgemein</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <label class="kk-field"><span class="kk-label">Studio-Name</span><input class="kk-input" id="phSetName" type="text" placeholder="L&auml;dt&hellip;" disabled></label>
          <label class="kk-field"><span class="kk-label">E-Mail</span><input class="kk-input" id="phSetEmail" type="email" placeholder="L&auml;dt&hellip;" disabled></label>
          <label class="kk-field"><span class="kk-label">Telefon</span><input class="kk-input" id="phSetPhone" type="tel" placeholder="L&auml;dt&hellip;" disabled></label>
          <label class="kk-field"><span class="kk-label">Stadt</span><input class="kk-input" id="phSetCity" type="text" placeholder="L&auml;dt&hellip;" disabled></label>
        </div>
      </div>

      <div class="card" style="padding:24px;margin-top:18px;">
        <h3 style="font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:12px;">Zahlungsmethoden</h3>
        <div id="phSetPayments" style="display:flex;gap:10px;flex-wrap:wrap;">
          <span style="color:var(--muted);font-size:13px">L&auml;dt&hellip;</span>
        </div>
      </div>

      <div class="card" style="padding:24px;margin-top:18px;">
        <h3 style="font-family:var(--font-heading);font-weight:700;font-size:18px;margin-bottom:12px;">Erweiterte Einstellungen</h3>
        <p style="font-size:13px;color:var(--muted);">Rollen-System, Steuer-Einstellungen, Benachrichtigungs-Templates, Backup &amp; Export &mdash; folgen in Sprint D.</p>
      </div>

      </div>
      '''
src, ok = replace_section(src, 'einstellungen', einst_html)
print(f'einstellungen: {"OK" if ok else "NOT FOUND"}')

# ============ Loaders einfügen ============
loaders = r"""
// ============================================================
// Sprint C: Credits, Team, Raeume, Ferien, Einstellungen
// ============================================================
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaded = window.sectionLoaded || {};

function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ----- C.1 Credits -----
window.sectionLoaders.credits = async function() {
  const state = window.dashboardState; if (!state) return;
  const { provider, api } = state;
  let credits = [];
  try {
    const r = await api('/parents');
    const parents = r.data || r.parents || r || [];
    for (const p of parents) {
      try {
        const cr = await api('/parents/' + p.id + '/credits');
        const list = cr.data || cr.credits || cr || [];
        list.forEach(c => credits.push({ ...c, parentName: p.name, parentEmail: p.email }));
      } catch (e) {}
    }
  } catch (e) { console.warn('[v3] credits load failed', e); }

  document.getElementById('phCreditsSub').textContent = credits.length === 0
    ? 'Noch keine Credit-Bewegungen. Credits werden automatisch beim Block-Kauf gutgeschrieben.'
    : credits.length + ' Credit-Bewegungen insgesamt.';

  const tbody = document.getElementById('phCreditsTbody');
  if (credits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Noch keine Credit-Bewegungen.</td></tr>';
    return;
  }
  credits.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  tbody.innerHTML = credits.slice(0, 50).map(c => {
    const status = (c.status || 'active').toLowerCase();
    const pill = status === 'used' ? 'pill-pending' : (status === 'expired' ? '' : 'pill-ok');
    return '<tr><td style="padding-left:20px;">' + _esc(c.parentName || '—') + '</td><td>' + _esc(c.action || c.reason || 'Gutschrift') + '</td><td>' + (c.amount || 1) + '</td><td>' + new Date(c.createdAt || 0).toLocaleDateString('de-DE') + '</td><td style="padding-right:20px;text-align:right;"><span class="pill ' + pill + '">' + status + '</span></td></tr>';
  }).join('');
};

// ----- C.2 Team -----
window.sectionLoaders.team = async function() {
  const state = window.dashboardState; if (!state) return;
  const { provider, api } = state;
  let team = [];
  try {
    const r = await api('/providers/' + provider.id + '/team');
    team = r.data || r.team || r.members || r || [];
  } catch (e) { console.warn('[v3] /team failed', e); }

  const active = team.filter(m => (m.status || 'active') === 'active' && !m.invitedAt || m.acceptedAt);
  const pending = team.filter(m => m.invitedAt && !m.acceptedAt);
  const admins = team.filter(m => (m.role || '').toLowerCase().includes('admin') || (m.role || '').toLowerCase() === 'owner');
  const trainers = team.filter(m => (m.role || '').toLowerCase().includes('trainer') || (m.role || '').toLowerCase().includes('instructor'));

  document.getElementById('phTeamSub').textContent = team.length === 0
    ? 'Noch kein Team angelegt — fang mit dir selbst als Inhaber:in an.'
    : active.length + ' aktiv · ' + pending.length + ' offene Einladungen · Rollen-System mit feinkörnigen Berechtigungen.';
  document.getElementById('phTeamActive').textContent = active.length;
  document.getElementById('phTeamRoles').textContent = admins.length + ' Admin · ' + trainers.length + ' Trainer';
  document.getElementById('phTeamPending').textContent = pending.length;
  document.getElementById('phTeamPendingDelta').textContent = pending.length === 0 ? ' ' : 'wartend';
  document.getElementById('phTeamHours').textContent = '–';
  document.getElementById('phTeamNPS').textContent = '–';

  const grid = document.getElementById('phTeamGrid');
  if (team.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">Noch keine Team-Mitglieder. <a href="#team" onclick="event.preventDefault();alert(\'Person einladen folgt\');" style="color:var(--primary)">+ Person einladen</a></div>';
    return;
  }
  grid.innerHTML = team.map(m => {
    const initial = (m.name || m.email || '?').charAt(0).toUpperCase();
    const role = m.role || 'Trainer';
    const isOwner = role.toLowerCase().includes('owner') || role.toLowerCase().includes('inhaber');
    return '<article class="team-card' + (isOwner ? ' team-card-owner' : '') + '">'
      + '<div class="team-head"><div class="team-avatar">' + _esc(initial) + '</div>'
      + '<div><div class="team-name">' + _esc(m.name || m.email || '—') + '</div><div class="team-role">' + _esc(role) + '</div></div></div>'
      + '<div style="font-size:13px;color:var(--muted-2);margin-top:8px;">' + _esc(m.email || '') + '</div>'
      + '</article>';
  }).join('');
};

// ----- C.3 Raeume -----
window.sectionLoaders.raeume = async function() {
  const state = window.dashboardState; if (!state) return;
  const { provider, api, activities } = state;
  let rooms = [];
  try {
    const r = await api('/rooms');
    rooms = r.data || r.rooms || r || [];
  } catch (e) { console.warn('[v3] /rooms failed', e); }

  const activeRooms = rooms.filter(r => !r.archivedAt && r.status !== 'archived');
  document.getElementById('phRoomsKicker').textContent = (provider.name || provider.displayName || '');
  document.getElementById('phRoomsSub').textContent = rooms.length === 0
    ? 'Noch keine Räume definiert. Sobald du Räume anlegst, prüfe ich automatisch Kollisionen beim Kurs-Anlegen.'
    : 'Definiere deine Räume — Kollisionen beim Kurs-Anlegen werden automatisch geblockt.';
  document.getElementById('phRoomsActive').innerHTML = activeRooms.length + (rooms.length !== activeRooms.length ? ' <em>von ' + rooms.length + '</em>' : '');
  document.getElementById('phRoomsActiveDelta').textContent = rooms.length === 0 ? 'Noch keine Räume' : ' ';
  document.getElementById('phRoomsUtil').innerHTML = '– <em>%</em>';
  document.getElementById('phRoomsConflicts').textContent = '0';
  document.getElementById('phRoomsTodayBookings').textContent = '0';

  const grid = document.getElementById('phRoomsGrid');
  if (rooms.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;color:var(--muted);text-align:center;font-size:13px">Noch keine Räume. <a href="#raeume" onclick="event.preventDefault();alert(\'Raum anlegen folgt\');" style="color:var(--primary)">+ Neuer Raum</a></div>';
    return;
  }
  grid.innerHTML = rooms.map(r => {
    const isActive = !r.archivedAt && r.status !== 'archived';
    return '<article class="block-card">'
      + '<div class="block-card-head"><div class="block-badge">' + (r.capacity || 0) + ' Plätze</div><div class="status-pill ' + (isActive ? 'status-active' : 'status-archived') + '">' + (isActive ? 'Aktiv' : 'Archiv') + '</div></div>'
      + '<h3 class="block-title">' + _esc(r.name || 'Raum') + '</h3>'
      + '<div class="block-meta">'
      + '<div class="block-meta-row"><span class="block-meta-label">Typ</span><span class="block-meta-val">' + _esc(r.type || 'Standard') + '</span></div>'
      + (r.address ? '<div class="block-meta-row"><span class="block-meta-label">Adresse</span><span class="block-meta-val">' + _esc(r.address) + '</span></div>' : '')
      + '</div>'
      + '<div class="block-foot"><span class="progress-label">&nbsp;</span><button class="btn btn-ghost btn-sm" onclick="alert(\'Raum bearbeiten folgt\')">Bearbeiten</button></div>'
      + '</article>';
  }).join('');
};

// ----- C.4 Ferien -----
window.sectionLoaders.ferien = async function() {
  const state = window.dashboardState; if (!state) return;
  const { api } = state;
  const year = new Date().getFullYear();
  document.getElementById('phFerienYear').textContent = year;
  let holidays = [];
  try {
    const r = await api('/holidays/bundeslaender?bundesland=BE&year=' + year);
    holidays = r.data || r.holidays || r || [];
  } catch (e) { console.warn('[v3] /holidays failed', e); }

  document.getElementById('phFerienBundesland').textContent = 'Berlin · automatisch';
  const future = holidays.filter(h => new Date(h.date) >= new Date()).sort((a,b) => new Date(a.date) - new Date(b.date));
  const next = future[0];
  const heroTitle = document.querySelector('#phFerienHero .hero-title');
  const heroSub = document.getElementById('phFerienHeroSub');
  if (next) {
    const days = Math.ceil((new Date(next.date) - new Date())/86400000);
    heroTitle.innerHTML = 'Nächste Schließung: <em class="italic">' + _esc(next.name) + '</em>';
    heroSub.textContent = new Date(next.date).toLocaleDateString('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}) + ' · in ' + days + ' Tag' + (days === 1 ? '' : 'en');
    document.getElementById('phFerienNextDays').textContent = days;
    document.getElementById('phFerienNextLabel').textContent = 'Tag' + (days === 1 ? '' : 'en');
  } else {
    heroTitle.textContent = 'Keine bevorstehenden Schließungen';
    heroSub.textContent = 'Alle Feiertage des Jahres liegen bereits hinter uns.';
    document.getElementById('phFerienNextDays').textContent = '–';
  }

  document.getElementById('phFerienHolidays').textContent = holidays.length;
  document.getElementById('phFerienOwnBreaks').textContent = '0';
  document.getElementById('phFerienAffected').textContent = '0';
  document.getElementById('phFerienSub').textContent = holidays.length === 0
    ? 'Keine Feiertage geladen — Bundesland-Setting prüfen.'
    : holidays.length + ' Feiertage in ' + year + ' · automatisch im Kalender geblockt.';

  const tbody = document.getElementById('phFerienTbody');
  if (holidays.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:40px;color:var(--muted);text-align:center;font-size:13px">Keine Feiertage.</td></tr>';
    return;
  }
  tbody.innerHTML = holidays.slice(0, 30).map(h => {
    const past = new Date(h.date) < new Date();
    return '<tr><td style="padding-left:20px;">' + new Date(h.date).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'short'}) + '</td>'
      + '<td>' + _esc(h.name) + '</td>'
      + '<td>Feiertag</td>'
      + '<td><span class="pill ' + (past ? '' : 'pill-ok') + '">' + (past ? 'Vergangen' : 'Geplant') + '</span></td>'
      + '<td style="padding-right:20px;text-align:right;"><button class="row-action-btn" onclick="alert(\'Details folgen\')">⊙</button></td></tr>';
  }).join('');
};

// ----- C.5 Einstellungen -----
window.sectionLoaders.einstellungen = async function() {
  const state = window.dashboardState; if (!state) return;
  const { provider, api } = state;
  let me = provider;
  try {
    const r = await api('/me');
    me = (r.data || r) || provider;
  } catch (e) { /* fallback to state.provider */ }

  document.getElementById('phSetSub').textContent = 'Profil von ' + (me.name || me.displayName || 'Provider');
  document.getElementById('phSetName').value = me.name || me.displayName || '';
  document.getElementById('phSetEmail').value = me.email || '';
  document.getElementById('phSetPhone').value = me.phone || '';
  document.getElementById('phSetCity').value = me.city || me.address?.city || '';

  // Payment methods
  const pay = document.getElementById('phSetPayments');
  const methods = [];
  if (me.paymentOnline || me.stripeConnected) methods.push({ name: 'Stripe', active: !!me.stripeConnected });
  if (me.paypalEnabled) methods.push({ name: 'PayPal', active: !!me.paypalEnabled });
  if (me.sepaEnabled) methods.push({ name: 'SEPA', active: !!me.sepaEnabled });
  if (me.invoiceEnabled !== false) methods.push({ name: 'Rechnung', active: true });
  if (me.cashEnabled) methods.push({ name: 'Bar', active: true });
  if (methods.length === 0) {
    pay.innerHTML = '<span style="color:var(--muted);font-size:13px">Noch keine Zahlungsmethoden konfiguriert.</span>';
  } else {
    pay.innerHTML = methods.map(m => '<span class="pill ' + (m.active ? 'pill-ok' : '') + '" style="padding:6px 12px;">' + _esc(m.name) + '</span>').join('');
  }
};
"""

marker = '// ============================================================\n// Phase 2a: SPA-Router'
if marker in src and 'Sprint C: Credits, Team, Raeume' not in src:
    src = src.replace(marker, loaders + '\n' + marker, 1)
    print('Sprint C loaders injected')

with open(p, 'w', encoding='utf-8') as f:
    f.write(src)
print(f'File: {len(src)} bytes')
