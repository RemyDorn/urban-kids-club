#!/usr/bin/env python3
"""
Erweitert das Eltern-Portal um zwei neue Tabs:
  - Postfach (Nachrichten zwischen Eltern und Provider)
  - Buchungen (Historie aller Termine, Add-Ups, Stornos)
"""
from pathlib import Path

P = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/portal-preview.html")
src = P.read_text(encoding="utf-8")

if 'data-tab="postfach"' in src:
    print("- portal already has postfach tab, skipping")
    raise SystemExit(0)

# ============================================================
# 1. Replace tab nav (3 → 5 tabs)
# ============================================================
old_nav = '''  <nav class="tabs">
    <button class="tab active" data-tab="my-courses" onclick="switchTab('my-courses')">Meine Kurse<span class="tab-count">2</span></button>
    <button class="tab" data-tab="empfehlungen" onclick="switchTab('empfehlungen')">Empfehlungen<span class="tab-count" id="tab-ref-count">0</span></button>
    <button class="tab" data-tab="credits" onclick="switchTab('credits')">Guthaben<span class="tab-count">3</span></button>
  </nav>'''

new_nav = '''  <nav class="tabs">
    <button class="tab active" data-tab="my-courses" onclick="switchTab('my-courses')">Meine Kurse<span class="tab-count">2</span></button>
    <button class="tab" data-tab="postfach" onclick="switchTab('postfach')">Postfach<span class="tab-count" id="tab-postfach-count">2</span></button>
    <button class="tab" data-tab="bookings" onclick="switchTab('bookings')">Buchungen<span class="tab-count">12</span></button>
    <button class="tab" data-tab="credits" onclick="switchTab('credits')">Guthaben<span class="tab-count">3</span></button>
    <button class="tab" data-tab="empfehlungen" onclick="switchTab('empfehlungen')">Empfehlungen<span class="tab-count" id="tab-ref-count">0</span></button>
  </nav>'''

if old_nav not in src:
    raise SystemExit("old tab nav not found exactly")
src = src.replace(old_nav, new_nav, 1)

# ============================================================
# 2. Insert NEW tab panels (Postfach + Bookings) BEFORE empfehlungen panel
# ============================================================
# Anchor: existing comment for empfehlungen tab
old_emp_anchor = '  <!-- TAB: EMPFEHLUNGEN / MOM-GRAPH -->'
if old_emp_anchor not in src:
    raise SystemExit("empfehlungen anchor not found")

NEW_PANELS = '''  <!-- TAB: POSTFACH -->
  <section class="tab-panel" id="panel-postfach" style="display:none">
    <div class="parent-postfach">
      <aside class="pp-list">
        <div class="pp-list-head">
          <span>Nachrichten</span>
          <button class="pp-new" title="Neue Nachricht">+</button>
        </div>
        <div class="pp-thread unread active" data-thread="1">
          <div class="pp-thread-from">
            <span class="pp-thread-name">Sophie · Socialy</span>
            <span class="pp-thread-time">vor 4 Min</span>
          </div>
          <div class="pp-thread-subject">Re: Mia kann morgen nicht</div>
          <div class="pp-thread-preview">Hey Hannah! Gute Besserung an die kleine Maus 🤗 Klar, ich trag Mia bei Dienstag aus...</div>
        </div>
        <div class="pp-thread unread" data-thread="2">
          <div class="pp-thread-from">
            <span class="pp-thread-name">System · Socialy</span>
            <span class="pp-thread-time">heute 06:30</span>
          </div>
          <div class="pp-thread-subject">Reminder · Babykurs Sa 09:30</div>
          <div class="pp-thread-preview">Dein nächster Termin ist am Samstag um 09:30 in Saal A. Hier nochmal die Adresse + Hinweise...</div>
        </div>
        <div class="pp-thread" data-thread="3">
          <div class="pp-thread-from">
            <span class="pp-thread-name">Sophie · Socialy</span>
            <span class="pp-thread-time">gestern</span>
          </div>
          <div class="pp-thread-subject">Newsletter · Mai-Kurse</div>
          <div class="pp-thread-preview">Wir haben neue Sommerkurse im Programm! Krabbel-Yoga im Garten, Tanz für 4–6 J...</div>
        </div>
        <div class="pp-thread" data-thread="4">
          <div class="pp-thread-from">
            <span class="pp-thread-name">Sophie · Socialy</span>
            <span class="pp-thread-time">vor 4 Tagen</span>
          </div>
          <div class="pp-thread-subject">Block-Buchung Babykurs</div>
          <div class="pp-thread-preview">Hi Hannah, dein 8er-Block ist bestätigt. Termine ab 02.04, immer dienstags um 09:30...</div>
        </div>
      </aside>

      <div class="pp-detail">
        <header class="pp-detail-head">
          <div>
            <div class="pp-detail-name">Sophie <em>· Socialy</em></div>
            <div class="pp-detail-sub">Trainerin · Berlin Prenzlauer Berg · seit Feb 2026</div>
          </div>
          <div class="pp-detail-actions">
            <button class="ghost-btn">Kontakt</button>
          </div>
        </header>

        <div class="pp-msgs">
          <div class="pp-msg-day">Heute</div>
          <div class="pp-msg out">
            <div>Hi Sophie, kurze Info — Mia hat seit gestern Abend Fieber. Sie kommt morgen leider nicht zum Babykurs. Tut mir leid für die kurze Vorwarnung!</div>
            <div class="pp-msg-meta">Du · 09:02</div>
          </div>
          <div class="pp-msg out">
            <div>Können wir den Termin irgendwie nachholen oder gibt es ein Add-Up? 💛</div>
            <div class="pp-msg-meta">Du · 09:03</div>
          </div>
          <div class="pp-msg in">
            <div>Hey Hannah! Gute Besserung an die kleine Maus 🤗 Klar, ich trag Mia bei Dienstag aus. Du hast noch 1 Add-Up frei im aktuellen Block — soll ich dich für Sa 09:30 (Drop-in) eintragen?</div>
            <div class="pp-msg-meta">Sophie · 09:10</div>
          </div>
          <div class="pp-quick-reply">
            <button class="quick-pill">Ja, Sa 09:30 bitte ✓</button>
            <button class="quick-pill">Lieber Mo nächste Woche</button>
            <button class="quick-pill">Erst mal abwarten</button>
          </div>
        </div>

        <footer class="pp-reply">
          <textarea placeholder="Antwort schreiben..." rows="3"></textarea>
          <div class="pp-reply-row">
            <span class="pp-reply-meta">Geht direkt an Sophie · Antwort meist &lt; 4 Std</span>
            <button class="primary-btn">Senden</button>
          </div>
        </footer>
      </div>
    </div>
  </section>

  <!-- TAB: BUCHUNGEN -->
  <section class="tab-panel" id="panel-bookings" style="display:none">
    <div class="bookings-toolbar">
      <div class="bookings-filter">
        <button class="bk-pill active">Alle 12</button>
        <button class="bk-pill">Anstehend 3</button>
        <button class="bk-pill">Besucht 7</button>
        <button class="bk-pill">Krank/Storno 2</button>
        <button class="bk-pill">Add-Ups 4</button>
      </div>
      <button class="ghost-btn">Export · iCal</button>
    </div>

    <div class="bookings-stats">
      <div class="bk-stat">
        <div class="bk-stat-label">Anwesenheit</div>
        <div class="bk-stat-value">88<em>%</em></div>
        <div class="bk-stat-meta">7/8 Termine besucht</div>
      </div>
      <div class="bk-stat">
        <div class="bk-stat-label">Add-Ups eingelöst</div>
        <div class="bk-stat-value">2 <em>von 4</em></div>
        <div class="bk-stat-meta">2 Credits noch frei</div>
      </div>
      <div class="bk-stat">
        <div class="bk-stat-label">Lieblingskurs</div>
        <div class="bk-stat-value">Krabbel-<em>Yoga</em></div>
        <div class="bk-stat-meta">100% besucht</div>
      </div>
      <div class="bk-stat">
        <div class="bk-stat-label">Mit Socialy seit</div>
        <div class="bk-stat-value">Feb <em>2026</em></div>
        <div class="bk-stat-meta">12 Wochen Familie</div>
      </div>
    </div>

    <div class="bookings-list">

      <div class="bk-row upcoming">
        <div class="bk-date"><div class="bk-day">SA</div><div class="bk-num">26</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Mia (Add-Up)</div>
        </div>
        <span class="bk-status pending">Add-Up bestätigt</span>
        <button class="ghost-btn">Details</button>
      </div>

      <div class="bk-row upcoming">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">29</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 7/8</div>
        </div>
        <span class="bk-status active">Bestätigt</span>
        <button class="ghost-btn">Krank?</button>
      </div>

      <div class="bk-row upcoming">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">06</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 8/8 · Letzter</div>
        </div>
        <span class="bk-status active">Bestätigt</span>
        <button class="ghost-btn">Krank?</button>
      </div>

      <div class="bk-row past">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">22</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 6/8</div>
        </div>
        <span class="bk-status visited">Besucht</span>
        <button class="ghost-btn">Bewerten</button>
      </div>

      <div class="bk-row past">
        <div class="bk-date"><div class="bk-day">SA</div><div class="bk-num">19</div></div>
        <div class="bk-info">
          <div class="bk-title">Krabbel-<em>Yoga</em> · 11:00</div>
          <div class="bk-sub">Saal B · Lena · Add-Up · 1 Credit eingelöst</div>
        </div>
        <span class="bk-status visited">Besucht</span>
        <button class="ghost-btn">Bewertet ★★★★★</button>
      </div>

      <div class="bk-row past">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">15</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 5/8</div>
        </div>
        <span class="bk-status visited">Besucht</span>
        <button class="ghost-btn">Bewerten</button>
      </div>

      <div class="bk-row past">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">08</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 4/8</div>
        </div>
        <span class="bk-status sick">Krank · Add-Up gutgeschrieben</span>
        <button class="ghost-btn">Add-Up nutzen</button>
      </div>

      <div class="bk-row past">
        <div class="bk-date"><div class="bk-day">DI</div><div class="bk-num">01</div></div>
        <div class="bk-info">
          <div class="bk-title">Babykurs <em>Krabbeln</em> · 09:30</div>
          <div class="bk-sub">Saal A · Sophie · Block-Termin 3/8</div>
        </div>
        <span class="bk-status visited">Besucht</span>
        <button class="ghost-btn">Bewertet ★★★★★</button>
      </div>

    </div>
  </section>

'''

src = src.replace(old_emp_anchor, NEW_PANELS + old_emp_anchor, 1)

# ============================================================
# 3. Inject CSS for new panels
# ============================================================
EXTRA_CSS = '''

/* ============ Postfach (Eltern-Sicht) ============ */
.parent-postfach { display: grid; grid-template-columns: 320px 1fr; gap: 0; min-height: 540px; height: calc(100vh - 320px); background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 18px; overflow: hidden; box-shadow: 0 4px 16px rgba(31,29,24,0.04); }
.pp-list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid rgba(31,29,24,0.08); background: var(--bg); }
.pp-list-head { padding: 16px 20px; border-bottom: 1px solid rgba(31,29,24,0.08); font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.pp-new { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: var(--bg); border: 0; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.pp-list-search { display: none; }
.pp-thread { padding: 14px 18px; border-bottom: 1px solid rgba(31,29,24,0.06); cursor: pointer; transition: background 140ms; position: relative; }
.pp-thread:hover { background: var(--surface-alt); }
.pp-thread.active { background: rgba(217,108,69,0.12); }
.pp-thread.unread::before { content: ''; position: absolute; left: 6px; top: 50%; width: 6px; height: 6px; border-radius: 50%; background: var(--primary); transform: translateY(-50%); }
.pp-thread-from { display: flex; justify-content: space-between; margin-bottom: 4px; }
.pp-thread-name { font-weight: 600; font-size: 13px; color: var(--ink); }
.pp-thread-time { font-size: 11px; color: var(--ink-muted); }
.pp-thread-subject { font-size: 13px; color: var(--ink); margin-bottom: 2px; font-weight: 500; }
.pp-thread-preview { font-size: 12px; color: var(--ink-muted); line-height: 1.45; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pp-detail { display: flex; flex-direction: column; min-height: 0; }
.pp-detail-head { padding: 18px 24px; border-bottom: 1px solid rgba(31,29,24,0.08); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.pp-detail-name { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 18px; color: var(--ink); letter-spacing: -0.005em; }
.pp-detail-name em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.pp-detail-sub { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
.pp-msgs { flex: 1; overflow-y: auto; padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.pp-msg-day { font-size: 11px; color: var(--ink-muted); letter-spacing: 0.08em; text-transform: uppercase; text-align: center; padding: 8px 0; font-weight: 600; }
.pp-msg { max-width: 78%; padding: 12px 16px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; }
.pp-msg.in { background: var(--surface-alt); color: var(--ink); align-self: flex-start; border-bottom-left-radius: 4px; }
.pp-msg.out { background: var(--ink); color: var(--bg); align-self: flex-end; border-bottom-right-radius: 4px; }
.pp-msg-meta { font-size: 11px; opacity: 0.6; margin-top: 6px; }
.pp-quick-reply { display: flex; gap: 6px; flex-wrap: wrap; align-self: flex-start; margin-top: 6px; }
.quick-pill { padding: 7px 14px; border-radius: 999px; background: var(--bg); border: 1px solid rgba(31,29,24,0.12); font-size: 12px; color: var(--ink); cursor: pointer; transition: all 140ms; font-family: inherit; }
.quick-pill:hover { background: var(--primary); color: var(--bg); border-color: var(--primary); }
.pp-reply { padding: 16px 24px; border-top: 1px solid rgba(31,29,24,0.08); flex-shrink: 0; }
.pp-reply textarea { width: 100%; padding: 12px 14px; border: 1px solid rgba(31,29,24,0.12); border-radius: 10px; background: var(--bg); font-family: inherit; font-size: 13.5px; color: var(--ink); resize: vertical; }
.pp-reply textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(217,108,69,0.12); }
.pp-reply-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.pp-reply-meta { font-size: 11.5px; color: var(--ink-muted); }
@media (max-width: 720px) {
  .parent-postfach { grid-template-columns: 1fr; height: auto; }
  .pp-list { border-right: 0; border-bottom: 1px solid rgba(31,29,24,0.08); max-height: 280px; }
  .pp-msgs { max-height: 360px; }
}

/* ============ Buchungen (Eltern-Sicht) ============ */
.bookings-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 14px; flex-wrap: wrap; }
.bookings-filter { display: flex; gap: 6px; flex-wrap: wrap; }
.bk-pill { padding: 7px 14px; border-radius: 999px; background: var(--bg); border: 1px solid rgba(31,29,24,0.12); font-size: 12.5px; font-weight: 500; color: var(--ink-muted); cursor: pointer; transition: all 140ms; font-family: inherit; }
.bk-pill.active { background: var(--ink); color: var(--bg); border-color: var(--ink); font-weight: 600; }
.bk-pill:hover:not(.active) { background: var(--surface-alt); color: var(--ink); }
.bookings-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 22px; }
.bk-stat { background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 14px; padding: 16px 18px; }
.bk-stat-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); font-weight: 600; margin-bottom: 8px; }
.bk-stat-value { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 26px; color: var(--ink); letter-spacing: -0.005em; line-height: 1; }
.bk-stat-value em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; font-size: 13px; color: var(--primary); margin-left: 3px; }
.bk-stat-meta { font-size: 11.5px; color: var(--ink-muted); margin-top: 6px; }
.bookings-list { display: flex; flex-direction: column; gap: 8px; }
.bk-row { display: grid; grid-template-columns: 60px 1fr auto auto; gap: 16px; align-items: center; padding: 14px 18px; background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 14px; transition: all 140ms; }
.bk-row.upcoming { background: var(--bg); border-color: rgba(217,108,69,0.20); }
.bk-row.past { opacity: 0.92; }
.bk-row:hover { transform: translateX(2px); border-color: var(--primary); }
.bk-date { display: flex; flex-direction: column; align-items: center; padding: 8px 0; background: var(--surface-alt); border-radius: 10px; }
.bk-row.upcoming .bk-date { background: var(--primary); color: var(--bg); }
.bk-day { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
.bk-num { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 22px; line-height: 1; margin-top: 2px; }
.bk-title { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 600; font-size: 15px; color: var(--ink); letter-spacing: -0.005em; }
.bk-title em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.bk-sub { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
.bk-status { font-size: 11px; padding: 4px 10px; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; white-space: nowrap; }
.bk-status.pending { background: rgba(217,108,69,0.18); color: var(--primary); }
.bk-status.active { background: rgba(168,182,163,0.30); color: var(--accent-deep); }
.bk-status.visited { background: rgba(31,29,24,0.10); color: var(--ink); }
.bk-status.sick { background: rgba(180,82,58,0.16); color: #B4523A; }
@media (max-width: 720px) {
  .bk-row { grid-template-columns: 56px 1fr; row-gap: 8px; }
  .bk-row .bk-status, .bk-row .ghost-btn { grid-column: 2; justify-self: start; }
}
'''

# Append CSS before final </style>
style_close_idx = src.rfind("</style>")
if style_close_idx < 0:
    raise SystemExit("</style> not found")
src = src[:style_close_idx] + EXTRA_CSS + "\n" + src[style_close_idx:]

P.write_text(src, encoding="utf-8")
print(f"OK portal-preview extended with Postfach + Buchungen tabs ({len(src)} bytes)")
