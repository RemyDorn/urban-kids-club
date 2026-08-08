#!/usr/bin/env python3
"""
Generate V2 preview pages: postfach, ki-assistent, integrationen, raeume, credits, anwesenheit.
Shared head/style from marketing-preview, custom body per page.
"""
from pathlib import Path

ROOT = Path(__file__).parent
SHELL = (ROOT / "_v2_shell_head.html").read_text(encoding="utf-8")

NAV_GROUPS = [
    ("Überblick", [
        ("Dashboard", "/provider-preview"),
        ("Kurse", "/kurse-preview", "8"),
        ("Buchungen", "/buchungen-preview", "142"),
        ("Kursblöcke", "/kursbloecke-preview"),
    ]),
    ("Menschen", [
        ("Kunden", "/kunden-preview", "96"),
        ("Probestunden", "/probestunden-preview", "4"),
        ("Team", "/team-preview"),
        ("Postfach", "/postfach-preview", "3"),
    ]),
    ("Finanzen", [
        ("Rechnungen", "/rechnungen-preview"),
        ("Berichte", "/berichte-preview"),
        ("Credits", "/credits-preview"),
    ]),
    ("Tools", [
        ("Anwesenheit", "/anwesenheit-preview"),
        ("Räume", "/raeume-preview"),
        ("Ferien & Saisons", "/ferien-preview"),
        ("Einbettung", "/embed-preview"),
        ("Marketing", "/marketing-preview"),
        ("KI-Assistent", "/ki-assistent-preview", "PRO"),
        ("Integrationen", "/integrationen-preview"),
        ("Einstellungen", "/einstellungen-preview"),
    ]),
]


def render_sidebar(active_href: str) -> str:
    out = ['  <aside class="sidebar" id="sidebar">',
           '    <div class="sidebar-brand">',
           '      <div class="brand-mark"><img src="/assets/brand/ukc-logo-icon.png" alt="Urban Kids Club"></div>',
           '      <div class="brand-name">URBAN KIDS <em>Club</em></div>',
           '    </div>',
           '    <nav class="sidebar-nav" data-sidebar-mode="full">']
    for label, items in NAV_GROUPS:
        out.append(f'      <div class="nav-group">')
        out.append(f'        <div class="nav-group-label">{label}</div>')
        for item in items:
            name = item[0]
            href = item[1]
            badge = item[2] if len(item) > 2 else None
            cls = "nav-item active" if href == active_href else "nav-item"
            badge_html = f' <span class="badge">{badge}</span>' if badge else ""
            out.append(f'        <button class="{cls}" onclick="window.location.href=\'{href}\'">{name}{badge_html}</button>')
        out.append('      </div>')
    out.append('    </nav>')
    out.append('    <div class="sidebar-footer">')
    out.append('      <div class="plan-badge">')
    out.append('        <div class="plan-badge-label">FREE PLAN</div>')
    out.append('        <div class="plan-badge-sub">Upgrade verfügbar →</div>')
    out.append('      </div>')
    out.append('      <button class="logout-btn">Abmelden</button>')
    out.append('    </div>')
    out.append('  </aside>')
    out.append('  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>')
    return "\n".join(out)


TOPBAR = '''    <header class="topbar">
      <button class="menu-toggle" onclick="toggleSidebar()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <div class="search"><input type="search" placeholder="Suchen..."></div>
      <div class="topbar-right">
        <button class="icon-btn" title="Benachrichtigungen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="dot"></span>
        </button>
        <div class="user-chip">
          <div class="user-avatar">S</div>
          <span class="user-chip-name">Sophie</span>
        </div>
      </div>
    </header>'''


SCRIPT_FOOTER = '''<script>
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
</script>
<script src="/assets/dashboard-ui.js"></script>
</body>
</html>
'''


def render_page(slug: str, title: str, active_href: str, body_html: str, extra_style: str = "") -> str:
    # SHELL ends with `</style>` (no `</head>`). We append page-specific styles, close style+head cleanly.
    head = SHELL.rstrip()
    if head.endswith("</style>"):
        head = head[:-len("</style>")]  # reopen style block to append more rules
    head = head.replace("<title>Marketing · Mom-Graph · Urban Kids Club</title>",
                        f"<title>{title} · Urban Kids Club</title>")
    head = head + "\n/* ====== PAGE-SPECIFIC ====== */\n" + extra_style + "\n</style>\n</head>"
    body = f'''<body>
<div class="app">
{render_sidebar(active_href)}
  <div class="main">
{TOPBAR}
    <div class="page">
{body_html}
    </div>
  </div>
</div>
{SCRIPT_FOOTER}'''
    return head + "\n" + body


# ============================================================
# PAGE 1: POSTFACH
# ============================================================
POSTFACH_STYLE = '''
.postfach-grid { display: grid; grid-template-columns: 200px 300px 1fr; gap: 0; height: calc(100vh - 220px); min-height: 580px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow); }
.pf-col { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.pf-col + .pf-col { border-left: 1px solid var(--border); }
.pf-col-head { padding: 14px 16px; border-bottom: 1px solid var(--border); font-family: var(--font-heading); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; font-size: 12px; color: var(--ink); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.pf-filters { padding: 8px; overflow-y: auto; }
.pf-filter { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 13.5px; color: var(--ink-2); transition: background 140ms; }
.pf-filter:hover { background: var(--surface-alt); }
.pf-filter.active { background: var(--ink); color: var(--bg); font-weight: 600; }
.pf-filter .count { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: rgba(60,33,36,0.08); color: var(--ink); }
.pf-filter.active .count { background: rgba(255,239,225,0.2); color: var(--bg); }
.pf-list { overflow-y: auto; flex: 1; }
.pf-thread { padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 140ms; position: relative; }
.pf-thread:hover { background: var(--surface-alt); }
.pf-thread.active { background: var(--primary-tint); }
.pf-thread.unread::before { content: ''; position: absolute; left: 6px; top: 50%; width: 6px; height: 6px; border-radius: 50%; background: var(--primary); transform: translateY(-50%); }
.pf-thread-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.pf-thread-name { font-weight: 600; font-size: 13.5px; color: var(--ink); }
.pf-thread-time { font-size: 11px; color: var(--muted-2); }
.pf-thread-subject { font-size: 13px; color: var(--ink-2); margin-bottom: 2px; }
.pf-thread-preview { font-size: 12px; color: var(--muted-2); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pf-detail { display: flex; flex-direction: column; min-height: 0; }
.pf-detail-head { padding: 16px 22px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.pf-detail-name { font-family: var(--font-heading); font-weight: 700; font-size: 18px; color: var(--ink); letter-spacing: -0.005em; }
.pf-detail-name em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.pf-detail-sub { font-size: 12px; color: var(--muted-2); margin-top: 2px; }
.pf-messages { flex: 1; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 16px; }
.pf-msg { max-width: 78%; padding: 12px 16px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; }
.pf-msg-meta { font-size: 11px; color: var(--muted-2); margin-top: 6px; }
.pf-msg.in { background: var(--surface-alt); color: var(--ink); align-self: flex-start; border-bottom-left-radius: 4px; }
.pf-msg.out { background: var(--ink); color: var(--bg); align-self: flex-end; border-bottom-right-radius: 4px; }
.pf-msg.out .pf-msg-meta { color: rgba(255,239,225,0.6); }
.pf-reply { padding: 16px 22px; border-top: 1px solid var(--border); flex-shrink: 0; }
.pf-reply-tools { display: flex; gap: 6px; margin-bottom: 8px; }
.pf-reply-tool { padding: 6px 10px; border-radius: 6px; font-size: 11px; color: var(--muted-2); cursor: pointer; border: 1px solid var(--border); background: var(--surface); transition: all 140ms; }
.pf-reply-tool:hover { background: var(--surface-alt); color: var(--ink); }
.pf-reply textarea { width: 100%; min-height: 70px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-family: inherit; font-size: 13.5px; color: var(--ink); resize: vertical; }
.pf-reply textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(204,137,94,0.12); }
.pf-reply-row { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.pf-tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.pf-tag.eltern { background: var(--sage-tint); color: var(--sage-deep); }
.pf-tag.system { background: var(--primary-tint); color: var(--primary); }
.pf-tag.urgent { background: var(--signal-tint); color: var(--signal); }
@media (max-width: 1280px) { .postfach-grid { grid-template-columns: 180px 1fr; } .pf-col:nth-child(2) { border-left: 1px solid var(--border); } .pf-col.pf-detail { display: none; } }
@media (max-width: 900px) { .postfach-grid { grid-template-columns: 1fr; height: auto; } .pf-col + .pf-col { border-left: 0; border-top: 1px solid var(--border); } .pf-col.pf-detail { display: flex; } }
'''

POSTFACH_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Kommunikation · 24h Antwortzeit-Ø</div>
          <h1 class="page-title">Postfach &amp; <em>Nachrichten</em></h1>
          <p class="page-sub">Alle Eltern-Kommunikation an einer Stelle — Buchungs-Anfragen, Krankmeldungen, Probestunden-Feedback. Antworten gehen automatisch per E-Mail an die Eltern raus.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">Auto-Antworten</button>
          <button class="btn btn-primary">+ Neue Nachricht</button>
        </div>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat">
          <div class="stat-label">Ungelesen</div>
          <div class="stat-value">3 <em>neu</em></div>
          <div class="stat-delta">2 Eltern · 1 System</div>
        </div>
        <div class="stat">
          <div class="stat-label">Antwortzeit · Ø</div>
          <div class="stat-value">2,4 <em>h</em></div>
          <div class="stat-delta up">unter 24h-Ziel</div>
        </div>
        <div class="stat">
          <div class="stat-label">Auto-Antworten · 30d</div>
          <div class="stat-value">28</div>
          <div class="stat-delta">Krankmeldungen, Buchungs-Bestätigungen</div>
        </div>
        <div class="stat">
          <div class="stat-label">Eltern-Zufriedenheit</div>
          <div class="stat-value">4,8 <em>/ 5</em></div>
          <div class="stat-delta up">aus 14 Bewertungen</div>
        </div>
      </div>

      <div class="postfach-grid">
        <!-- COL 1: Filter -->
        <div class="pf-col">
          <div class="pf-col-head">Filter</div>
          <div class="pf-filters">
            <div class="pf-filter active">Alle <span class="count">14</span></div>
            <div class="pf-filter">Ungelesen <span class="count">3</span></div>
            <div class="pf-filter">Eltern → Provider <span class="count">8</span></div>
            <div class="pf-filter">Provider → Eltern <span class="count">4</span></div>
            <div class="pf-filter">System <span class="count">2</span></div>
            <div class="pf-filter">Markiert <span class="count">1</span></div>
            <div class="pf-filter">Archiv <span class="count">42</span></div>
          </div>
          <div style="padding: 12px 16px; border-top: 1px solid var(--border); background: var(--surface-alt);">
            <div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted-2); margin-bottom: 8px; font-weight: 600;">Schnellaktionen</div>
            <a href="#" style="display:block; font-size: 12.5px; padding: 6px 0; color: var(--ink-2); text-decoration: none;">→ Vorlage erstellen</a>
            <a href="#" style="display:block; font-size: 12.5px; padding: 6px 0; color: var(--ink-2); text-decoration: none;">→ Auto-Antwort einrichten</a>
            <a href="#" style="display:block; font-size: 12.5px; padding: 6px 0; color: var(--ink-2); text-decoration: none;">→ Eltern-Verteiler</a>
          </div>
        </div>

        <!-- COL 2: Threads -->
        <div class="pf-col">
          <div class="pf-col-head">Letzte Threads <span style="font-weight:400; text-transform:none; letter-spacing:0; font-size:11px; color:var(--muted-2);">14</span></div>
          <div class="pf-list">
            <div class="pf-thread unread active">
              <div class="pf-thread-head"><div class="pf-thread-name">Hannah B.</div><div class="pf-thread-time">vor 12 Min</div></div>
              <div class="pf-thread-subject"><span class="pf-tag urgent">Krank</span> Mia kann morgen nicht zum Babykurs</div>
              <div class="pf-thread-preview">Hi Sophie, kurze Info — Mia hat Fieber. Kommt morgen leider nicht. Können wir den Termin nachholen oder gibt es ein Add-Up...</div>
            </div>
            <div class="pf-thread unread">
              <div class="pf-thread-head"><div class="pf-thread-name">Lisa &amp; Tim</div><div class="pf-thread-time">vor 1 Std</div></div>
              <div class="pf-thread-subject"><span class="pf-tag eltern">Frage</span> Ist der Sa-Slot um 11 Uhr noch frei?</div>
              <div class="pf-thread-preview">Wir würden gerne unsere Tochter Emma (3 Mo) zum Krabbelkurs anmelden. Welcher Tag passt aktuell noch?</div>
            </div>
            <div class="pf-thread unread">
              <div class="pf-thread-head"><div class="pf-thread-name">System</div><div class="pf-thread-time">vor 2 Std</div></div>
              <div class="pf-thread-subject"><span class="pf-tag system">System</span> Wartelisten-Match: 1 Platz frei</div>
              <div class="pf-thread-preview">In Babykurs Mo 09:30 ist ein Platz freigeworden. Familie Weber steht auf der Warteliste — Auto-Mail wurde versandt.</div>
            </div>
            <div class="pf-thread">
              <div class="pf-thread-head"><div class="pf-thread-name">Anna K.</div><div class="pf-thread-time">vor 4 Std</div></div>
              <div class="pf-thread-subject"><span class="pf-tag eltern">Probestunde</span> Danke für die Probe!</div>
              <div class="pf-thread-preview">Wow, das war so schön gestern. Leon hat super mitgemacht. Wir möchten gerne den 8er-Block buchen, geht das auch...</div>
            </div>
            <div class="pf-thread">
              <div class="pf-thread-head"><div class="pf-thread-name">Sophie (du)</div><div class="pf-thread-time">gestern</div></div>
              <div class="pf-thread-subject">→ Newsletter Q2: Sommerkurse</div>
              <div class="pf-thread-preview">An 96 Eltern versandt. Open-Rate 64% (sehr gut). 12 Antworten — alle bei „Buchung".</div>
            </div>
            <div class="pf-thread">
              <div class="pf-thread-head"><div class="pf-thread-name">Familie Schulz</div><div class="pf-thread-time">vor 2 Tagen</div></div>
              <div class="pf-thread-subject"><span class="pf-tag eltern">Stornierung</span> Kursblock pausieren</div>
              <div class="pf-thread-preview">Wir gehen zwei Wochen in den Urlaub. Kann Lina den Kursblock pausieren oder fallen die Stunden weg?</div>
            </div>
            <div class="pf-thread">
              <div class="pf-thread-head"><div class="pf-thread-name">Marie F.</div><div class="pf-thread-time">vor 3 Tagen</div></div>
              <div class="pf-thread-subject"><span class="pf-tag eltern">Empfehlung</span> Ich habe Sara erzählt...</div>
              <div class="pf-thread-preview">Hey Sophie, eine Freundin von mir (Sara) hat heute angerufen — sie möchte ihre Twins anmelden. Wie läuft das mit dem Mom-Graph...</div>
            </div>
          </div>
        </div>

        <!-- COL 3: Detail -->
        <div class="pf-col pf-detail">
          <div class="pf-detail-head">
            <div>
              <div class="pf-detail-name">Hannah B. <em>· Mia (8 Mo)</em></div>
              <div class="pf-detail-sub">Babykurs Di 09:30 · 6/8 Termine genutzt · seit Feb 2026</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-sm">→ Profil</button>
              <button class="btn btn-ghost btn-sm">⏷</button>
            </div>
          </div>
          <div class="pf-messages">
            <div class="pf-msg in">
              <div>Hi Sophie, kurze Info — Mia hat seit gestern Abend Fieber. Sie kommt morgen leider nicht zum Babykurs. Tut mir leid für die kurze Vorwarnung!</div>
              <div class="pf-msg-meta">Hannah · vor 12 Min · per E-Mail</div>
            </div>
            <div class="pf-msg in">
              <div>Können wir den Termin irgendwie nachholen oder gibt es ein Add-Up? 💛</div>
              <div class="pf-msg-meta">Hannah · vor 11 Min</div>
            </div>
            <div class="pf-msg out">
              <div>Hey Hannah! Gute Besserung an die kleine Maus 🤗 Klar, ich trag Mia bei Dienstag aus. Du hast noch 1 Add-Up frei im aktuellen Block — soll ich dich für Sa 09:30 (Drop-in) eintragen?</div>
              <div class="pf-msg-meta">Sophie · vor 4 Min · gelesen</div>
            </div>
          </div>
          <div class="pf-reply">
            <div class="pf-reply-tools">
              <button class="pf-reply-tool">📎 Anhang</button>
              <button class="pf-reply-tool">✨ KI-Vorschlag</button>
              <button class="pf-reply-tool">📋 Vorlage</button>
              <button class="pf-reply-tool">🔁 Add-Up buchen</button>
            </div>
            <textarea placeholder="Antwort schreiben..."></textarea>
            <div class="pf-reply-row">
              <div style="font-size: 11.5px; color: var(--muted-2);">Geht per E-Mail an <strong>hannah.b@gmail.com</strong> + Eltern-Portal</div>
              <button class="btn btn-primary btn-sm">Antwort senden</button>
            </div>
          </div>
        </div>
      </div>
'''


# ============================================================
# PAGE 2: KI-ASSISTENT
# ============================================================
KI_STYLE = '''
.ki-banner { background: linear-gradient(135deg, var(--ink) 0%, #4d2d31 100%); color: var(--bg); border-radius: var(--radius-lg); padding: 30px 32px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; box-shadow: var(--shadow-lg); position: relative; overflow: hidden; }
.ki-banner::after { content: ''; position: absolute; top: -40px; right: -40px; width: 220px; height: 220px; background: radial-gradient(circle, rgba(204,137,94,0.18) 0%, transparent 70%); }
.ki-banner-kicker { font-family: var(--font-heading); font-weight: 700; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--primary-soft); margin-bottom: 8px; }
.ki-banner h2 { font-family: var(--font-heading); font-weight: 700; font-size: 28px; line-height: 1.15; color: var(--bg); margin-bottom: 8px; letter-spacing: -0.005em; }
.ki-banner h2 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary-soft); }
.ki-banner p { font-size: 14px; color: rgba(255,239,225,0.78); line-height: 1.5; max-width: 540px; }
.ki-banner-cta { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; position: relative; z-index: 1; }
.ki-pro-badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: rgba(204,137,94,0.18); color: var(--primary-soft); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.ki-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 24px; }
.ki-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 22px; position: relative; transition: all 200ms; }
.ki-card:hover { border-color: var(--primary); box-shadow: 0 4px 16px rgba(204,137,94,0.10); }
.ki-card.locked { opacity: 0.62; }
.ki-card.locked::before { content: 'PRO'; position: absolute; top: 14px; right: 14px; padding: 3px 9px; background: var(--ink); color: var(--bg); border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }
.ki-card-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--primary-tint); color: var(--primary); display: flex; align-items: center; justify-content: center; margin-bottom: 14px; font-size: 22px; }
.ki-card h3 { font-family: var(--font-heading); font-weight: 700; font-size: 17px; color: var(--ink); margin-bottom: 4px; letter-spacing: -0.005em; }
.ki-card h3 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.ki-card-sub { font-size: 12.5px; color: var(--muted-2); margin-bottom: 14px; line-height: 1.5; }
.ki-card-list { list-style: none; padding: 0; margin: 0 0 16px; }
.ki-card-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--ink-2); display: flex; align-items: flex-start; gap: 8px; }
.ki-card-list li:last-child { border-bottom: 0; }
.ki-card-list li::before { content: '→'; color: var(--primary); font-weight: 600; flex-shrink: 0; margin-top: 1px; }
.ki-chat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px; margin-bottom: 24px; }
.ki-chat-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.ki-chat-avatar { width: 42px; height: 42px; border-radius: 50%; background: var(--primary); color: var(--bg); display: flex; align-items: center; justify-content: center; font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 22px; }
.ki-chat-meta { font-family: var(--font-heading); font-weight: 700; font-size: 16px; color: var(--ink); }
.ki-chat-meta em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.ki-chat-status { font-size: 11.5px; color: var(--success); margin-top: 2px; }
.ki-chat-status::before { content: '●'; margin-right: 4px; }
.ki-chat-suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.ki-chat-suggestion { padding: 8px 14px; border-radius: 999px; background: var(--surface-alt); border: 1px solid var(--border); font-size: 12.5px; color: var(--ink-2); cursor: pointer; transition: all 140ms; }
.ki-chat-suggestion:hover { background: var(--primary-tint); color: var(--primary); border-color: var(--primary); }
.ki-chat-input-row { display: flex; gap: 8px; }
.ki-chat-input { flex: 1; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--bg); font-family: inherit; font-size: 13.5px; }
.ki-chat-input:focus { outline: none; border-color: var(--primary); }
.ki-insight-list { display: flex; flex-direction: column; gap: 10px; }
.ki-insight { padding: 14px 18px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); display: grid; grid-template-columns: 36px 1fr auto; gap: 14px; align-items: center; }
.ki-insight-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.ki-insight.warn .ki-insight-icon { background: var(--signal-tint); color: var(--signal); }
.ki-insight.info .ki-insight-icon { background: var(--primary-tint); color: var(--primary); }
.ki-insight.win .ki-insight-icon { background: var(--sage-tint); color: var(--sage-deep); }
.ki-insight-text { font-size: 13.5px; color: var(--ink); }
.ki-insight-text strong { font-weight: 600; }
.ki-insight-meta { font-size: 11.5px; color: var(--muted-2); margin-top: 2px; }
'''

KI_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Pro-Feature · seit Q2/2026 in Beta</div>
          <h1 class="page-title">KI-<em>Assistent</em></h1>
          <p class="page-sub">Deine zweite Hand im Studio. Liest deine Daten, schlägt Aktionen vor, schreibt E-Mails, baut Berichte — du sagst nur „passt" oder „lieber so".</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">Pause</button>
          <button class="btn btn-primary">+ Neue Anfrage</button>
        </div>
      </div>

      <div class="ki-banner">
        <div>
          <div class="ki-banner-kicker">Heute · 25.04.2026 · 09:14</div>
          <h2>3 Insights für <em>dich</em></h2>
          <p>Ich habe heute Nacht deine Daten geprüft. Es gibt 1 Warnung, 1 Empfehlung und 1 Erfolg. Schau dir das durch — ich erkläre alles.</p>
        </div>
        <div class="ki-banner-cta">
          <span class="ki-pro-badge">PRO · 19€ / Monat</span>
          <button class="btn btn-primary">Insights ansehen →</button>
        </div>
      </div>

      <div class="ki-chat">
        <div class="ki-chat-head">
          <div class="ki-chat-avatar">K</div>
          <div>
            <div class="ki-chat-meta">Kira <em>· dein KI-Assistent</em></div>
            <div class="ki-chat-status">Aktiv · Letzter Check vor 8 Min</div>
          </div>
        </div>
        <div class="ki-insight-list">
          <div class="ki-insight warn">
            <div class="ki-insight-icon">⚠</div>
            <div>
              <div class="ki-insight-text"><strong>Auslastung Mi 16:30 · Tanzkurs (4–6 J)</strong> — nur noch 3 Anmeldungen für April. Vorschlag: Marketing-Push an 12 Eltern aus Wartelisten-Pool.</div>
              <div class="ki-insight-meta">Confidence 0,87 · basiert auf 4-Wochen-Trend</div>
            </div>
            <button class="btn btn-ghost btn-sm">→ Details</button>
          </div>
          <div class="ki-insight info">
            <div class="ki-insight-icon">💡</div>
            <div>
              <div class="ki-insight-text"><strong>11 Eltern</strong> haben in den letzten 30 Tagen 3+ Mal die Kursseite angesehen, aber nicht gebucht. Magic-Link mit 5%-Code für nächsten Block?</div>
              <div class="ki-insight-meta">Erwarteter Conversion-Lift: +18% · ROI 4,2×</div>
            </div>
            <button class="btn btn-primary btn-sm">Kampagne starten</button>
          </div>
          <div class="ki-insight win">
            <div class="ki-insight-icon">✓</div>
            <div>
              <div class="ki-insight-text"><strong>Mom-Graph läuft top:</strong> 38% der Neukunden via Empfehlung diesen Monat (+12% vs. März). Highlight an Top-3-Empfehler:innen senden?</div>
              <div class="ki-insight-meta">Hannah B. · Lisa K. · Marie F.</div>
            </div>
            <button class="btn btn-ghost btn-sm">Vorlage zeigen</button>
          </div>
        </div>
        <div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--border);">
          <div style="font-size: 12px; color: var(--muted-2); margin-bottom: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">Schnellstart</div>
          <div class="ki-chat-suggestions">
            <span class="ki-chat-suggestion">Schreib eine Krankmeldungs-Antwort</span>
            <span class="ki-chat-suggestion">Erkläre mir Buchungs-Trend April</span>
            <span class="ki-chat-suggestion">Rechnungs-Auswertung Q1</span>
            <span class="ki-chat-suggestion">3 Instagram-Captions für Sommerkurs</span>
            <span class="ki-chat-suggestion">Reminder an Wartelisten-Eltern</span>
          </div>
          <div class="ki-chat-input-row">
            <input class="ki-chat-input" placeholder="Frag Kira... z.B. „Wie viele Add-Ups habe ich diese Woche noch verfügbar?"">
            <button class="btn btn-primary">→</button>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 14px; display: flex; align-items: baseline; justify-content: space-between;">
        <h2 style="font-family: var(--font-heading); font-weight: 700; font-size: 22px; color: var(--ink); letter-spacing: -0.005em;">Was ich für dich <em class="italic-accent" style="color:var(--primary);">übernehme</em></h2>
        <a href="#" class="card-link">Alle Module →</a>
      </div>

      <div class="ki-grid">
        <div class="ki-card">
          <div class="ki-card-icon">📊</div>
          <h3>Berichte &amp; <em>Auswertungen</em></h3>
          <p class="ki-card-sub">Monatlich, quartalsweise oder ad-hoc — ich schreibe deine Reports.</p>
          <ul class="ki-card-list">
            <li>Auslastung pro Kurs &amp; Slot</li>
            <li>Cohort-Retention der Eltern</li>
            <li>Storno-Quote &amp; Gründe</li>
            <li>Mom-Graph Conversion-Funnel</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Bericht erzeugen</button>
        </div>

        <div class="ki-card">
          <div class="ki-card-icon">✉</div>
          <h3>E-Mail-<em>Drafts</em></h3>
          <p class="ki-card-sub">Ich schreibe in deinem Ton. Du liest, klickst „Senden".</p>
          <ul class="ki-card-list">
            <li>Krankmeldungs-Bestätigungen</li>
            <li>Wartelisten-Updates</li>
            <li>Mahnungen (höflich) für offene Rechnungen</li>
            <li>Einladungen zum Sommercamp</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Drafts ansehen</button>
        </div>

        <div class="ki-card">
          <div class="ki-card-icon">📣</div>
          <h3>Marketing-<em>Ideen</em></h3>
          <p class="ki-card-sub">Drei Captions, drei Bildvorschläge, ein Sendezeitpunkt.</p>
          <ul class="ki-card-list">
            <li>Instagram-Posts (Caption + Hashtags)</li>
            <li>Newsletter-Ideen pro Kurskategorie</li>
            <li>Probestunden-Promo-Texte</li>
            <li>Mom-Graph Empfehlungs-Push</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Kampagne planen</button>
        </div>

        <div class="ki-card locked">
          <div class="ki-card-icon">📚</div>
          <h3>Buchhaltungs-<em>Helper</em></h3>
          <p class="ki-card-sub">Belege scannen, Kategorien zuweisen, Export für Steuerberater.</p>
          <ul class="ki-card-list">
            <li>OCR-Belegerkennung</li>
            <li>SKR04-Kontenzuordnung</li>
            <li>UStVA-Vorbereitung</li>
            <li>Export für DATEV / LexOffice</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Pro-Upgrade</button>
        </div>

        <div class="ki-card locked">
          <div class="ki-card-icon">👥</div>
          <h3>Personal-<em>Assistent</em></h3>
          <p class="ki-card-sub">Schichten, Stunden, Lohnabrechnung — vorbereitet.</p>
          <ul class="ki-card-list">
            <li>Schichtplan-Vorschläge</li>
            <li>Stundenkonto-Tracking</li>
            <li>Krankheits-Vertretung</li>
            <li>Lohn-Listen-Export</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Pro-Upgrade</button>
        </div>

        <div class="ki-card">
          <div class="ki-card-icon">🎯</div>
          <h3>Auto-<em>Aktionen</em></h3>
          <p class="ki-card-sub">Du sagst „falls X dann Y", ich mache es täglich.</p>
          <ul class="ki-card-list">
            <li>Wartelisten-Match: Auto-Mail bei freiem Platz</li>
            <li>Stornoseitennach 3 Tagen Inaktivität</li>
            <li>Probestunden-Follow-Up nach 24h</li>
            <li>Kursblock-Auslastungs-Push unter 60%</li>
          </ul>
          <button class="btn btn-ghost btn-sm">→ Regel anlegen</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div class="card-title">Kira <em>· Settings</em></div>
          <a href="/einstellungen-preview#ki" class="card-link">Erweitert →</a>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
          <div>
            <div style="font-size:11px;color:var(--muted-2);letter-spacing:0.12em;text-transform:uppercase;font-weight:600;margin-bottom:4px;">Sprachstil</div>
            <div style="font-weight:600;color:var(--ink);">Du-Form, warm</div>
            <div style="font-size:11.5px;color:var(--muted-2);margin-top:2px;">Trainiert auf 47 deiner E-Mails</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted-2);letter-spacing:0.12em;text-transform:uppercase;font-weight:600;margin-bottom:4px;">Auto-Senden</div>
            <div style="font-weight:600;color:var(--ink);">Aus · nur Drafts</div>
            <div style="font-size:11.5px;color:var(--muted-2);margin-top:2px;">Du bestätigst jede E-Mail</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted-2);letter-spacing:0.12em;text-transform:uppercase;font-weight:600;margin-bottom:4px;">Datenschutz</div>
            <div style="font-weight:600;color:var(--ink);">EU-Server (Frankfurt)</div>
            <div style="font-size:11.5px;color:var(--muted-2);margin-top:2px;">Daten verlassen EU nicht · DSGVO</div>
          </div>
          <div>
            <div style="font-size:11px;color:var(--muted-2);letter-spacing:0.12em;text-transform:uppercase;font-weight:600;margin-bottom:4px;">Modell</div>
            <div style="font-weight:600;color:var(--ink);">Claude Opus 4.7</div>
            <div style="font-size:11.5px;color:var(--muted-2);margin-top:2px;">Anthropic · 1M Context</div>
          </div>
        </div>
      </div>
'''


# ============================================================
# PAGE 3: INTEGRATIONEN
# ============================================================
INT_STYLE = '''
.int-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 22px; padding-bottom: 0; }
.int-tab { padding: 10px 16px; border-bottom: 2px solid transparent; font-size: 13px; font-weight: 500; color: var(--muted-2); cursor: pointer; transition: all 140ms; }
.int-tab.active { color: var(--ink); border-bottom-color: var(--primary); font-weight: 600; }
.int-tab:hover { color: var(--ink); }
.int-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.int-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 18px 20px; transition: all 200ms; cursor: pointer; }
.int-card:hover { border-color: var(--primary); box-shadow: 0 4px 14px rgba(60,33,36,0.06); }
.int-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.int-logo { width: 42px; height: 42px; border-radius: 10px; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; font-family: var(--font-heading); font-weight: 700; font-size: 16px; color: var(--ink); flex-shrink: 0; }
.int-logo.lex { background: #C8102E; color: white; }
.int-logo.sev { background: #FF6900; color: white; }
.int-logo.bb { background: #00A88E; color: white; }
.int-logo.stripe { background: #635BFF; color: white; }
.int-logo.paypal { background: #003087; color: white; }
.int-logo.klaviyo { background: #1D1D1F; color: white; }
.int-logo.mailchimp { background: #FFE01B; color: #1D1D1F; }
.int-logo.ga { background: #F9AB00; color: white; }
.int-logo.meta { background: #0866FF; color: white; }
.int-logo.gads { background: #4285F4; color: white; }
.int-logo.zapier { background: #FF4A00; color: white; }
.int-logo.slack { background: #4A154B; color: white; }
.int-logo.gcal { background: #4285F4; color: white; }
.int-logo.outlook { background: #0078D4; color: white; }
.int-logo.whatsapp { background: #25D366; color: white; }
.int-logo.dropbox { background: #0061FF; color: white; }
.int-card-title { font-family: var(--font-heading); font-weight: 700; font-size: 15px; color: var(--ink); }
.int-card-cat { font-size: 11px; color: var(--muted-2); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }
.int-card-desc { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; margin-bottom: 14px; min-height: 56px; }
.int-status { display: flex; align-items: center; justify-content: space-between; }
.int-status-pill { padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
.int-status-pill.connected { background: var(--sage-tint); color: var(--sage-deep); }
.int-status-pill.connected::before { content: '●'; margin-right: 4px; }
.int-status-pill.available { background: var(--surface-alt); color: var(--muted-2); }
.int-status-pill.warn { background: var(--signal-tint); color: var(--signal); }
.int-status-meta { font-size: 11px; color: var(--muted-2); }
.webhooks-table { width: 100%; border-collapse: collapse; }
.webhooks-table th { text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-2); border-bottom: 1px solid var(--border); }
.webhooks-table td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
.webhooks-table tr:last-child td { border-bottom: 0; }
.webhooks-table .ok { color: var(--success); }
.webhooks-table .err { color: var(--signal); }
.webhooks-table code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; color: var(--ink); background: var(--surface-alt); padding: 2px 6px; border-radius: 4px; }
'''

INT_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">App-Marketplace · 16 Apps verfügbar</div>
          <h1 class="page-title"><em>Integrationen</em> &amp; APIs</h1>
          <p class="page-sub">Verbinde Urban Kids Club mit deinem bestehenden Stack. Buchhaltung exportiert automatisch, Newsletter-Listen syncen sich, Zahlungen kommen direkt rein.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">API-Docs</button>
          <button class="btn btn-primary">+ Webhook</button>
        </div>
      </div>

      <div class="int-tabs">
        <div class="int-tab active">Alle <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">16</span></div>
        <div class="int-tab">Buchhaltung <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">3</span></div>
        <div class="int-tab">Zahlung <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">2</span></div>
        <div class="int-tab">Marketing <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">4</span></div>
        <div class="int-tab">Tracking <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">3</span></div>
        <div class="int-tab">Kommunikation <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">3</span></div>
        <div class="int-tab">Kalender <span style="color:var(--muted-2);font-weight:400;margin-left:4px;">2</span></div>
      </div>

      <div class="int-grid">
        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo lex">L</div>
            <div>
              <div class="int-card-title">LexOffice</div>
              <div class="int-card-cat">Buchhaltung</div>
            </div>
          </div>
          <div class="int-card-desc">Rechnungen automatisch nach LexOffice exportieren — UStVA, BWA und SKR04 vorbereitet.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">Sync vor 12 Min</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo sev">S</div>
            <div>
              <div class="int-card-title">sevDesk</div>
              <div class="int-card-cat">Buchhaltung</div>
            </div>
          </div>
          <div class="int-card-desc">Alternativ zu LexOffice. Auto-Export von Belegen, Kunden und Rechnungen mit Dual-Sync.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">7 Tage gratis</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo bb">B</div>
            <div>
              <div class="int-card-title">BuchhaltungsButler</div>
              <div class="int-card-cat">Buchhaltung</div>
            </div>
          </div>
          <div class="int-card-desc">DATEV-konformer Export für Steuerberater. Automatische Kontenzuordnung und Belegabgleich.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">Steuerberater-Empfehlung</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo stripe">$</div>
            <div>
              <div class="int-card-title">Stripe</div>
              <div class="int-card-cat">Zahlungsabwicklung</div>
            </div>
          </div>
          <div class="int-card-desc">Kreditkarte, SEPA, Klarna, Apple/Google Pay. Auszahlungen wöchentlich auf dein Konto.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">acct_1Nv9...8Hx</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo paypal">P</div>
            <div>
              <div class="int-card-title">PayPal</div>
              <div class="int-card-cat">Zahlungsabwicklung</div>
            </div>
          </div>
          <div class="int-card-desc">PayPal als zweite Zahlart neben Stripe — höhere Konversion bei Eltern.</div>
          <div class="int-status">
            <span class="int-status-pill warn">Token läuft ab</span>
            <span class="int-status-meta">in 4 Tagen</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo klaviyo">K</div>
            <div>
              <div class="int-card-title">Klaviyo</div>
              <div class="int-card-cat">E-Mail-Marketing</div>
            </div>
          </div>
          <div class="int-card-desc">Eltern-Listen syncen, Newsletter versenden, Auto-Flows triggern (Probestunden-Follow-Up).</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">96 Eltern syncronisiert</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo mailchimp">M</div>
            <div>
              <div class="int-card-title">Mailchimp</div>
              <div class="int-card-cat">E-Mail-Marketing</div>
            </div>
          </div>
          <div class="int-card-desc">Klassiker für Newsletter — günstigere Alternative für kleine Listen unter 500.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">Free bis 500 Kontakte</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo ga">G</div>
            <div>
              <div class="int-card-title">Google Analytics 4</div>
              <div class="int-card-cat">Tracking · Server-Side</div>
            </div>
          </div>
          <div class="int-card-desc">Server-Side via Measurement Protocol — umgeht Safari-ITP &amp; Adblocker.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">G-MEASUREMENT-...</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo meta">f</div>
            <div>
              <div class="int-card-title">Meta CAPI</div>
              <div class="int-card-cat">Tracking · Server-Side</div>
            </div>
          </div>
          <div class="int-card-desc">Conversions API für Instagram &amp; Facebook Ads — Conversion-Lift +18% gemessen.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">Pixel ID 8423...</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo gads">A</div>
            <div>
              <div class="int-card-title">Google Ads</div>
              <div class="int-card-cat">Werbung</div>
            </div>
          </div>
          <div class="int-card-desc">Conversion-Tracking für Such- und Display-Anzeigen direkt aus Buchungs-Events.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">Setup ~3 Min</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo zapier">Z</div>
            <div>
              <div class="int-card-title">Zapier</div>
              <div class="int-card-cat">Automatisierung · 5000+ Apps</div>
            </div>
          </div>
          <div class="int-card-desc">Verbinde UKC mit Notion, Airtable, Slack — über 5000 vordefinierte Aktionen.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">3 Zaps aktiv</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo slack">#</div>
            <div>
              <div class="int-card-title">Slack</div>
              <div class="int-card-cat">Team-Benachrichtigung</div>
            </div>
          </div>
          <div class="int-card-desc">Push für neue Buchungen, Stornos, Wartelisten-Matches in dein Team-Channel.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">Free verfügbar</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo gcal">📅</div>
            <div>
              <div class="int-card-title">Google Kalender</div>
              <div class="int-card-cat">Kalender-Sync</div>
            </div>
          </div>
          <div class="int-card-desc">Push deine Kursblöcke automatisch in Google Calendar — Trainer:innen sehen ihre Schichten.</div>
          <div class="int-status">
            <span class="int-status-pill connected">Verbunden</span>
            <span class="int-status-meta">Sophie@socialy.club</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo outlook">O</div>
            <div>
              <div class="int-card-title">Outlook / Office 365</div>
              <div class="int-card-cat">Kalender-Sync</div>
            </div>
          </div>
          <div class="int-card-desc">Microsoft-Kalender-Sync für Teams, die im O365-Ökosystem arbeiten.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo whatsapp">W</div>
            <div>
              <div class="int-card-title">WhatsApp Business</div>
              <div class="int-card-cat">Kommunikation</div>
            </div>
          </div>
          <div class="int-card-desc">Buchungs-Bestätigungen + Krankmeldungs-Antworten via WhatsApp — beste Eltern-Erreichbarkeit.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
            <span class="int-status-meta">Pro-Feature</span>
          </div>
        </div>

        <div class="int-card">
          <div class="int-card-head">
            <div class="int-logo dropbox">D</div>
            <div>
              <div class="int-card-title">Dropbox</div>
              <div class="int-card-cat">Datei-Speicher</div>
            </div>
          </div>
          <div class="int-card-desc">Backup von Belegen und Kursfotos automatisch in deine Dropbox.</div>
          <div class="int-status">
            <span class="int-status-pill available">Verfügbar</span>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div class="card-head">
          <div class="card-title">Webhook-<em>Log</em></div>
          <a href="#" class="card-link">Alle Events →</a>
        </div>
        <table class="webhooks-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Endpoint</th>
              <th>Status</th>
              <th>Latenz</th>
              <th>Zeit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>booking.created</strong></td>
              <td><code>https://hook.zapier.com/.../bk</code></td>
              <td class="ok">200 OK</td>
              <td>142 ms</td>
              <td>vor 4 Min</td>
            </tr>
            <tr>
              <td><strong>invoice.paid</strong></td>
              <td><code>https://api.lexoffice.io/v1/...</code></td>
              <td class="ok">200 OK</td>
              <td>320 ms</td>
              <td>vor 18 Min</td>
            </tr>
            <tr>
              <td><strong>parent.signup</strong></td>
              <td><code>https://a.klaviyo.com/api/...</code></td>
              <td class="ok">200 OK</td>
              <td>89 ms</td>
              <td>vor 2 Std</td>
            </tr>
            <tr>
              <td><strong>booking.cancelled</strong></td>
              <td><code>https://hooks.slack.com/...</code></td>
              <td class="err">503 Service Unavailable</td>
              <td>5012 ms</td>
              <td>vor 4 Std</td>
            </tr>
            <tr>
              <td><strong>conversion.purchase</strong></td>
              <td><code>graph.facebook.com/v18/...</code></td>
              <td class="ok">200 OK</td>
              <td>234 ms</td>
              <td>vor 6 Std</td>
            </tr>
          </tbody>
        </table>
      </div>
'''


# ============================================================
# PAGE 4: RÄUME
# ============================================================
RM_STYLE = '''
.rm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.rm-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; transition: all 200ms; }
.rm-card:hover { border-color: var(--primary); box-shadow: var(--shadow-lg); }
.rm-photo { aspect-ratio: 16/9; background: linear-gradient(135deg, var(--primary-tint) 0%, var(--primary-soft) 100%); display: flex; align-items: center; justify-content: center; font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 56px; color: var(--ink); position: relative; }
.rm-photo .rm-color { position: absolute; top: 14px; left: 14px; padding: 4px 10px; border-radius: 999px; background: rgba(60,33,36,0.78); color: var(--bg); font-size: 11px; font-weight: 600; letter-spacing: 0.04em; }
.rm-photo .rm-occ { position: absolute; top: 14px; right: 14px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.rm-photo .rm-occ.ok { background: var(--sage-tint); color: var(--sage-deep); }
.rm-photo .rm-occ.warn { background: var(--signal-tint); color: var(--signal); }
.rm-body { padding: 16px 20px 18px; }
.rm-name { font-family: var(--font-heading); font-weight: 700; font-size: 18px; color: var(--ink); letter-spacing: -0.005em; }
.rm-name em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.rm-meta { font-size: 12px; color: var(--muted-2); margin-top: 2px; }
.rm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.rm-row-label { font-size: 10.5px; color: var(--muted-2); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
.rm-row-value { font-size: 13.5px; color: var(--ink); font-weight: 600; }
.rm-equipment { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 12px; }
.rm-equipment span { font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--surface-alt); color: var(--ink-2); }
.rm-actions { display: flex; gap: 6px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.conflict-bar { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 16px 20px; background: var(--signal-tint); border: 1px solid rgba(180,82,58,0.20); border-radius: var(--radius-md); margin-bottom: 22px; }
.conflict-bar h4 { font-family: var(--font-heading); font-weight: 700; font-size: 14px; color: var(--signal); margin-bottom: 4px; }
.conflict-bar p { font-size: 13px; color: var(--ink-2); line-height: 1.5; }
.heatmap { display: grid; grid-template-columns: 80px repeat(7, 1fr); gap: 4px; font-size: 11px; }
.heatmap .heatmap-h { font-weight: 600; color: var(--muted-2); padding: 6px 0; }
.heatmap .cell { aspect-ratio: 4/1; border-radius: 4px; padding: 4px 6px; font-size: 10px; display: flex; align-items: center; justify-content: center; color: var(--ink); }
.heatmap .cell.l0 { background: var(--surface-alt); color: var(--muted-2); }
.heatmap .cell.l1 { background: rgba(204,137,94,0.20); }
.heatmap .cell.l2 { background: rgba(204,137,94,0.40); }
.heatmap .cell.l3 { background: rgba(204,137,94,0.65); color: var(--bg); }
.heatmap .cell.l4 { background: var(--primary); color: var(--bg); font-weight: 600; }
'''

RM_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Studio · Berlin Prenzlauer Berg</div>
          <h1 class="page-title">Räume &amp; <em>Verfügbarkeit</em></h1>
          <p class="page-sub">Definiere deine Räume und Kapazitäten — ich blockiere automatisch Kollisionen beim Kurs-Anlegen. Eine Mama, ein Termin, ein Raum.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">Belegungsplan</button>
          <button class="btn btn-primary">+ Neuer Raum</button>
        </div>
      </div>

      <div class="conflict-bar">
        <div>
          <h4>1 potentieller Konflikt erkannt</h4>
          <p>Beim Anlegen von „Krabbelkurs Mi 10:30" überschneidet sich der gewünschte Raum (Saal A) mit „Tanzkurs 4–6 J" (10:00–11:00). Vorschlag: Raum „Garten" oder Slot 11:30.</p>
        </div>
        <button class="btn btn-primary btn-sm">Vorschläge ansehen</button>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat">
          <div class="stat-label">Räume aktiv</div>
          <div class="stat-value">5 <em>von 6</em></div>
          <div class="stat-delta">Saal C in Renovierung</div>
        </div>
        <div class="stat">
          <div class="stat-label">Auslastung · Ø</div>
          <div class="stat-value">68 <em>%</em></div>
          <div class="stat-delta up">+12% vs. März</div>
        </div>
        <div class="stat">
          <div class="stat-label">Kollisionen verhindert · 30d</div>
          <div class="stat-value">14</div>
          <div class="stat-delta">Auto-Blocks beim Anlegen</div>
        </div>
        <div class="stat">
          <div class="stat-label">Peak-Slot</div>
          <div class="stat-value">Sa 09–12</div>
          <div class="stat-delta">95% Auslastung Saal A</div>
        </div>
      </div>

      <div class="rm-grid">
        <div class="rm-card">
          <div class="rm-photo">
            <span class="rm-color">SIENNA</span>
            <span class="rm-occ ok">Frei jetzt</span>
            A
          </div>
          <div class="rm-body">
            <div class="rm-name">Saal <em>A</em></div>
            <div class="rm-meta">Hauptsaal · 64 m² · Holzboden</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Kapazität</div>
                <div class="rm-row-value">12 Babys + 12 Eltern</div>
              </div>
              <div>
                <div class="rm-row-label">Aktuelle Belegung</div>
                <div class="rm-row-value">8 Kurse / Wo</div>
              </div>
            </div>
            <div class="rm-equipment">
              <span>Spiegelwand</span>
              <span>Musik-Anlage</span>
              <span>Wickeltisch</span>
              <span>Klima</span>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm">Belegung ansehen</button>
            </div>
          </div>
        </div>

        <div class="rm-card">
          <div class="rm-photo" style="background: linear-gradient(135deg, var(--sage-tint) 0%, var(--sage) 100%);">
            <span class="rm-color">SAGE</span>
            <span class="rm-occ warn">Belegt bis 11:30</span>
            B
          </div>
          <div class="rm-body">
            <div class="rm-name">Saal <em>B</em></div>
            <div class="rm-meta">Bewegung &amp; Tanz · 48 m² · Sportboden</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Kapazität</div>
                <div class="rm-row-value">10 Kinder</div>
              </div>
              <div>
                <div class="rm-row-label">Aktuelle Belegung</div>
                <div class="rm-row-value">6 Kurse / Wo</div>
              </div>
            </div>
            <div class="rm-equipment">
              <span>Yogamatten 12</span>
              <span>Bluetooth-Box</span>
              <span>Bälle/Reifen</span>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm">Belegung ansehen</button>
            </div>
          </div>
        </div>

        <div class="rm-card">
          <div class="rm-photo" style="background: linear-gradient(135deg, #FFF4E5 0%, #F5DCC5 100%);">
            <span class="rm-color">CREAM</span>
            <span class="rm-occ ok">Frei jetzt</span>
            <span style="font-size: 56px;">G</span>
          </div>
          <div class="rm-body">
            <div class="rm-name">Garten</div>
            <div class="rm-meta">Outdoor · 90 m² · April–Oktober</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Kapazität</div>
                <div class="rm-row-value">15 Familien</div>
              </div>
              <div>
                <div class="rm-row-label">Aktuelle Belegung</div>
                <div class="rm-row-value">4 Kurse / Wo</div>
              </div>
            </div>
            <div class="rm-equipment">
              <span>Sandkasten</span>
              <span>Schaukel</span>
              <span>Pavillon</span>
              <span>Wetter-Plan B</span>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm">Belegung ansehen</button>
            </div>
          </div>
        </div>

        <div class="rm-card">
          <div class="rm-photo" style="background: linear-gradient(135deg, #E2D8F5 0%, #B8A4D8 100%);">
            <span class="rm-color">LAVENDER</span>
            <span class="rm-occ ok">Frei jetzt</span>
            <span style="font-size: 56px;">M</span>
          </div>
          <div class="rm-body">
            <div class="rm-name">Musik-<em>raum</em></div>
            <div class="rm-meta">Klein · 24 m² · schallisoliert</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Kapazität</div>
                <div class="rm-row-value">6 Familien</div>
              </div>
              <div>
                <div class="rm-row-label">Aktuelle Belegung</div>
                <div class="rm-row-value">5 Kurse / Wo</div>
              </div>
            </div>
            <div class="rm-equipment">
              <span>Klavier</span>
              <span>Trommeln</span>
              <span>Klangstäbe</span>
              <span>Teppich</span>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm">Belegung ansehen</button>
            </div>
          </div>
        </div>

        <div class="rm-card">
          <div class="rm-photo" style="background: linear-gradient(135deg, #FFE0EC 0%, #FFB1C8 100%);">
            <span class="rm-color">ROSE</span>
            <span class="rm-occ ok">Frei jetzt</span>
            <span style="font-size: 56px;">K</span>
          </div>
          <div class="rm-body">
            <div class="rm-name">Kreativ-<em>Raum</em></div>
            <div class="rm-meta">Mal- &amp; Bastelzimmer · 32 m² · abwaschbar</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Kapazität</div>
                <div class="rm-row-value">8 Kinder</div>
              </div>
              <div>
                <div class="rm-row-label">Aktuelle Belegung</div>
                <div class="rm-row-value">3 Kurse / Wo</div>
              </div>
            </div>
            <div class="rm-equipment">
              <span>Staffeleien</span>
              <span>Material-Schrank</span>
              <span>Spüle</span>
              <span>Kinderhocker</span>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-ghost btn-sm">Belegung ansehen</button>
            </div>
          </div>
        </div>

        <div class="rm-card" style="opacity:0.6;">
          <div class="rm-photo" style="background: linear-gradient(135deg, #E5E5E5 0%, #BFBFBF 100%);">
            <span class="rm-color">GREY</span>
            <span class="rm-occ warn">Renovierung</span>
            <span style="font-size: 56px;">C</span>
          </div>
          <div class="rm-body">
            <div class="rm-name">Saal <em>C</em></div>
            <div class="rm-meta">Bewegung · 40 m² · pausiert seit 18.04</div>
            <div class="rm-row">
              <div>
                <div class="rm-row-label">Wieder verfügbar</div>
                <div class="rm-row-value">06.05.2026</div>
              </div>
              <div>
                <div class="rm-row-label">Kapazität (geplant)</div>
                <div class="rm-row-value">8 Kinder</div>
              </div>
            </div>
            <div class="rm-actions">
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
              <button class="btn btn-primary btn-sm">Aktivieren</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div class="card-head">
          <div class="card-title">Auslastungs-<em>Heatmap</em> · Saal A</div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-sm">Saal A</button>
            <button class="btn btn-ghost btn-sm">Diese Woche</button>
          </div>
        </div>
        <div class="heatmap">
          <div class="heatmap-h"></div>
          <div class="heatmap-h">Mo</div>
          <div class="heatmap-h">Di</div>
          <div class="heatmap-h">Mi</div>
          <div class="heatmap-h">Do</div>
          <div class="heatmap-h">Fr</div>
          <div class="heatmap-h">Sa</div>
          <div class="heatmap-h">So</div>

          <div class="heatmap-h">09:00</div>
          <div class="cell l3">8/12</div>
          <div class="cell l3">9/12</div>
          <div class="cell l4">12/12</div>
          <div class="cell l3">8/12</div>
          <div class="cell l4">11/12</div>
          <div class="cell l4">12/12</div>
          <div class="cell l0">–</div>

          <div class="heatmap-h">10:30</div>
          <div class="cell l4">12/12</div>
          <div class="cell l4">12/12</div>
          <div class="cell l3">9/12</div>
          <div class="cell l4">12/12</div>
          <div class="cell l3">8/12</div>
          <div class="cell l4">12/12</div>
          <div class="cell l0">–</div>

          <div class="heatmap-h">14:00</div>
          <div class="cell l1">3/12</div>
          <div class="cell l2">5/12</div>
          <div class="cell l1">2/12</div>
          <div class="cell l2">6/12</div>
          <div class="cell l1">3/12</div>
          <div class="cell l3">8/12</div>
          <div class="cell l1">2/12</div>

          <div class="heatmap-h">16:30</div>
          <div class="cell l2">5/12</div>
          <div class="cell l2">5/12</div>
          <div class="cell l1">3/12</div>
          <div class="cell l2">6/12</div>
          <div class="cell l3">8/12</div>
          <div class="cell l0">–</div>
          <div class="cell l0">–</div>

          <div class="heatmap-h">18:00</div>
          <div class="cell l0">–</div>
          <div class="cell l1">2/12</div>
          <div class="cell l1">3/12</div>
          <div class="cell l0">–</div>
          <div class="cell l1">2/12</div>
          <div class="cell l0">–</div>
          <div class="cell l0">–</div>
        </div>
      </div>
'''


# ============================================================
# PAGE 5: CREDITS
# ============================================================
CR_STYLE = '''
.credit-banner { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px 32px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
.credit-banner h3 { font-family: var(--font-heading); font-weight: 700; font-size: 22px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 6px; }
.credit-banner h3 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.credit-banner p { font-size: 13.5px; color: var(--ink-2); line-height: 1.55; }
.credit-pic { display: flex; align-items: center; justify-content: center; gap: 16px; }
.credit-circle { width: 68px; height: 68px; border-radius: 50%; background: var(--primary); color: var(--bg); display: flex; align-items: center; justify-content: center; font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 28px; box-shadow: 0 6px 22px rgba(204,137,94,0.30); }
.credit-arrow { font-family: var(--font-accent); font-style: italic; font-size: 32px; color: var(--muted); }
.credit-circle.outcome { background: var(--surface-alt); color: var(--ink); border: 2px solid var(--primary); font-size: 22px; }
.credit-pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
.credit-pack { padding: 22px 24px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); text-align: center; transition: all 200ms; cursor: pointer; position: relative; }
.credit-pack.featured { border-color: var(--primary); border-width: 2px; transform: scale(1.02); box-shadow: 0 8px 28px rgba(204,137,94,0.14); }
.credit-pack.featured::before { content: 'BELIEBT'; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); padding: 3px 10px; background: var(--primary); color: var(--bg); border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }
.credit-pack-num { font-family: var(--font-heading); font-weight: 700; font-size: 38px; color: var(--ink); line-height: 1; }
.credit-pack-num em { font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 18px; color: var(--primary); }
.credit-pack-label { font-size: 11px; color: var(--muted-2); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; margin: 6px 0 10px; }
.credit-pack-price { font-family: var(--font-heading); font-weight: 700; font-size: 22px; color: var(--primary); }
.credit-pack-price em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--muted-2); font-size: 12px; }
.credit-pack-meta { font-size: 11.5px; color: var(--muted-2); margin-top: 6px; }
.credit-table { width: 100%; border-collapse: collapse; }
.credit-table th { text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-2); border-bottom: 1px solid var(--border); }
.credit-table td { padding: 12px 14px; font-size: 13px; border-bottom: 1px solid var(--border); }
.credit-table tr:last-child td { border-bottom: 0; }
.credit-amount { font-family: var(--font-heading); font-weight: 700; color: var(--primary); }
.credit-amount.spent { color: var(--signal); }
.cr-trend { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
.cr-trend.up { background: var(--sage-tint); color: var(--sage-deep); }
.cr-trend.down { background: var(--signal-tint); color: var(--signal); }
'''

CR_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Credit-System · Add-Up-Pässe</div>
          <h1 class="page-title">Credits &amp; <em>Familien-Pässe</em></h1>
          <p class="page-sub">Mit Credits buchen Familien Add-Up-Stunden flexibel. 1 Credit = 1 Add-Up-Teilnahme bei einem beliebigen passenden Kurs. Kein Geld-Wert, keine Erstattung — pure Erlebnis-Währung.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">Regeln</button>
          <button class="btn btn-primary">+ Credits gutschreiben</button>
        </div>
      </div>

      <div class="credit-banner">
        <div>
          <h3>Wie der <em>Credit</em> funktioniert</h3>
          <p>Eine Familie kauft z. B. einen 8er-Kursblock und bekommt automatisch 2 Add-Up-Credits geschenkt. Wird das Kind krank oder will sie spontan zu einem zweiten Kurs am Sa, kann sie 1 Credit einlösen. Keine Verfallsdauer im aktiven Block. Nach Block-Ende verfallen ungenutzte Credits — außer Familie verlängert.</p>
        </div>
        <div class="credit-pic">
          <div class="credit-circle">C</div>
          <div class="credit-arrow">→</div>
          <div class="credit-circle outcome">1×<br>Add-Up</div>
        </div>
      </div>

      <h2 style="font-family: var(--font-heading); font-weight: 700; font-size: 20px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 12px;">Credit-<em class="italic-accent" style="color:var(--primary);">Pakete</em> für Eltern</h2>
      <p style="font-size: 13px; color: var(--muted-2); margin-bottom: 18px;">Werden im Eltern-Portal angeboten. Du kannst Pakete deaktivieren oder eigene zusammenstellen.</p>

      <div class="credit-pricing">
        <div class="credit-pack">
          <div class="credit-pack-num">2<em>×</em></div>
          <div class="credit-pack-label">Schnupperer</div>
          <div class="credit-pack-price">14 <em>€</em></div>
          <div class="credit-pack-meta">7 €/Credit · ab 1 Familie</div>
        </div>
        <div class="credit-pack featured">
          <div class="credit-pack-num">5<em>×</em></div>
          <div class="credit-pack-label">5er-Pass</div>
          <div class="credit-pack-price">30 <em>€</em></div>
          <div class="credit-pack-meta">6 €/Credit · sparst 5 €</div>
        </div>
        <div class="credit-pack">
          <div class="credit-pack-num">10<em>×</em></div>
          <div class="credit-pack-label">10er-Pass</div>
          <div class="credit-pack-price">55 <em>€</em></div>
          <div class="credit-pack-meta">5,50 €/Credit · sparst 15 €</div>
        </div>
        <div class="credit-pack">
          <div class="credit-pack-num">∞</div>
          <div class="credit-pack-label">Familien-Flat</div>
          <div class="credit-pack-price">120 <em>€/Mo</em></div>
          <div class="credit-pack-meta">unlimited Add-Ups · Auto-Verlängerung</div>
        </div>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat">
          <div class="stat-label">Credits im Umlauf</div>
          <div class="stat-value">487 <em>aktiv</em></div>
          <div class="stat-delta up">+58 gekauft (30d)</div>
        </div>
        <div class="stat">
          <div class="stat-label">Credits eingelöst · 30d</div>
          <div class="stat-value">142</div>
          <div class="stat-delta">durchschn. 1,8/Familie</div>
        </div>
        <div class="stat">
          <div class="stat-label">Umsatz · Credits 30d</div>
          <div class="stat-value">2.420 <em>€</em></div>
          <div class="stat-delta up"><strong>+18%</strong> vs. Vormonat</div>
        </div>
        <div class="stat">
          <div class="stat-label">Verfallsquote</div>
          <div class="stat-value">8 <em>%</em></div>
          <div class="stat-delta">unter Branchen-Median (12%)</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 22px;">
        <div class="card-head">
          <div class="card-title">Credit-<em>Bewegungen</em> · letzte 7 Tage</div>
          <a href="#" class="card-link">Alle Buchungen →</a>
        </div>
        <table class="credit-table">
          <thead>
            <tr>
              <th>Familie</th>
              <th>Aktion</th>
              <th>Credits</th>
              <th>Saldo</th>
              <th>Zeit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Hannah B.</strong> · Mia (8 Mo)</td>
              <td>Add-Up: Babykurs Sa 09:30</td>
              <td class="credit-amount spent">−1</td>
              <td>3 Credits</td>
              <td>vor 4 Min</td>
            </tr>
            <tr>
              <td><strong>Lisa K.</strong> · Emma (3 Mo)</td>
              <td>Kauf: 5er-Pass</td>
              <td class="credit-amount">+5</td>
              <td>5 Credits</td>
              <td>vor 22 Min</td>
            </tr>
            <tr>
              <td><strong>Marie F.</strong> · Twins</td>
              <td>Geschenk: Empfehlungs-Bonus</td>
              <td class="credit-amount">+2</td>
              <td>4 Credits</td>
              <td>vor 1 Std</td>
            </tr>
            <tr>
              <td><strong>Anna W.</strong> · Leon (2 J)</td>
              <td>Add-Up: Kreativ-Kurs Mi 16:30</td>
              <td class="credit-amount spent">−1</td>
              <td>0 Credits</td>
              <td>gestern</td>
            </tr>
            <tr>
              <td><strong>Familie Schulz</strong> · Lina</td>
              <td>Verfall: Block beendet</td>
              <td class="credit-amount spent">−2</td>
              <td>0 Credits</td>
              <td>vor 2 Tagen</td>
            </tr>
            <tr>
              <td><strong>Tina R.</strong> · Paul (1 J)</td>
              <td>Auto-Erstattung: Kurs ausgefallen</td>
              <td class="credit-amount">+1</td>
              <td>3 Credits</td>
              <td>vor 3 Tagen</td>
            </tr>
            <tr>
              <td><strong>Sara M.</strong> · Lia &amp; Tom</td>
              <td>Kauf: 10er-Pass</td>
              <td class="credit-amount">+10</td>
              <td>10 Credits</td>
              <td>vor 4 Tagen</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap: 18px;">
        <div class="card">
          <div class="card-head">
            <div class="card-title">Top-<em>Credit-Käufer</em></div>
            <span class="cr-trend up">+22% MoM</span>
          </div>
          <table class="credit-table">
            <tbody>
              <tr><td><strong>1. Lisa K.</strong></td><td>15 Credits gekauft</td><td>105 €</td></tr>
              <tr><td><strong>2. Marie F.</strong></td><td>10 Credits</td><td>55 €</td></tr>
              <tr><td><strong>3. Hannah B.</strong></td><td>10 Credits</td><td>55 €</td></tr>
              <tr><td><strong>4. Sara M.</strong></td><td>10 Credits</td><td>55 €</td></tr>
              <tr><td><strong>5. Tina R.</strong></td><td>5 Credits</td><td>30 €</td></tr>
            </tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-head">
            <div class="card-title">Auto-<em>Regeln</em></div>
            <a href="/einstellungen-preview#credits" class="card-link">Bearbeiten →</a>
          </div>
          <ul style="list-style:none;padding:0;margin:0;">
            <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:13.5px;color:var(--ink);"><strong>+2 Credits</strong> bei jedem 8er-Kursblock-Kauf</li>
            <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:13.5px;color:var(--ink);"><strong>+1 Credit</strong> bei jeder erfolgreichen Mom-Graph-Empfehlung</li>
            <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:13.5px;color:var(--ink);"><strong>+1 Credit</strong> Auto-Erstattung bei ausgefallenen Kursen</li>
            <li style="padding:12px 0;border-bottom:1px solid var(--border);font-size:13.5px;color:var(--ink);"><strong>Verfall</strong> nach Block-Ende, wenn nicht verlängert</li>
            <li style="padding:12px 0;font-size:13.5px;color:var(--ink);"><strong>Reminder</strong> 7 Tage vor Verfall per E-Mail</li>
          </ul>
        </div>
      </div>
'''


# ============================================================
# PAGE 6: ANWESENHEIT
# ============================================================
ATT_STYLE = '''
.att-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 18px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); }
.att-date-pick { display: flex; align-items: center; gap: 12px; }
.att-date-pick .date-arrow { width: 32px; height: 32px; border-radius: 50%; background: var(--surface-alt); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.att-date-pick .date { font-family: var(--font-heading); font-weight: 700; font-size: 16px; color: var(--ink); letter-spacing: -0.005em; }
.att-date-pick .date em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.att-quick { display: flex; gap: 6px; }
.att-quick .quick { font-size: 11.5px; padding: 5px 10px; border-radius: 999px; background: var(--surface-alt); color: var(--ink-2); cursor: pointer; transition: all 140ms; }
.att-quick .quick.active { background: var(--ink); color: var(--bg); font-weight: 600; }
.att-class-list { display: flex; flex-direction: column; gap: 14px; }
.att-class { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.att-class-head { padding: 14px 22px; background: var(--surface-alt); border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 1fr auto auto; gap: 14px; align-items: center; }
.att-class-title { font-family: var(--font-heading); font-weight: 700; font-size: 17px; color: var(--ink); letter-spacing: -0.005em; }
.att-class-title em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.att-class-meta { font-size: 12px; color: var(--muted-2); margin-top: 2px; }
.att-class-stats { display: flex; gap: 16px; font-size: 12px; align-items: center; }
.att-class-stats .stat-item { display: flex; flex-direction: column; align-items: flex-end; }
.att-class-stats .stat-num { font-family: var(--font-heading); font-weight: 700; font-size: 20px; color: var(--ink); line-height: 1; }
.att-class-stats .stat-label { font-size: 10.5px; color: var(--muted-2); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }
.att-rows { padding: 8px 12px; }
.att-row { display: grid; grid-template-columns: 36px 1.4fr 1fr auto auto; gap: 12px; align-items: center; padding: 10px 10px; border-radius: 8px; transition: background 140ms; }
.att-row:hover { background: var(--surface-alt); }
.att-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: var(--bg); display: flex; align-items: center; justify-content: center; font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 16px; }
.att-name { font-weight: 600; font-size: 13.5px; color: var(--ink); }
.att-name-meta { font-size: 11.5px; color: var(--muted-2); margin-top: 1px; }
.att-rate { font-size: 11px; padding: 3px 8px; border-radius: 999px; }
.att-rate.high { background: var(--sage-tint); color: var(--sage-deep); }
.att-rate.med { background: var(--primary-tint); color: var(--primary); }
.att-rate.low { background: var(--signal-tint); color: var(--signal); }
.att-toggle { display: flex; gap: 4px; background: var(--surface-alt); padding: 3px; border-radius: 999px; }
.att-toggle button { padding: 4px 10px; border: none; background: transparent; border-radius: 999px; font-size: 11.5px; font-weight: 500; color: var(--ink-2); cursor: pointer; transition: all 140ms; font-family: inherit; }
.att-toggle button.active.present { background: var(--sage-deep); color: var(--bg); }
.att-toggle button.active.late { background: var(--primary); color: var(--bg); }
.att-toggle button.active.absent { background: var(--signal); color: var(--bg); }
.att-toggle button.active.excused { background: var(--ink); color: var(--bg); }
.att-icon-btn { width: 28px; height: 28px; border-radius: 6px; background: transparent; color: var(--muted-2); border: none; cursor: pointer; transition: all 140ms; display: flex; align-items: center; justify-content: center; }
.att-icon-btn:hover { background: var(--surface-alt); color: var(--ink); }
'''

ATT_BODY = '''      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">Anwesenheit · Echtzeit-Tracking</div>
          <h1 class="page-title">Anwesenheits-<em>Tracking</em></h1>
          <p class="page-sub">Wer ist heute da, wer fehlt, wer kommt zu spät? Eine Geste pro Kind reicht — alles syncronisiert ins Eltern-Portal und in die Anwesenheits-Quote.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm">Export · CSV</button>
          <button class="btn btn-primary">QR-Check-In</button>
        </div>
      </div>

      <div class="stats" style="margin-bottom:22px;">
        <div class="stat">
          <div class="stat-label">Heute · 25.04.2026</div>
          <div class="stat-value">3 <em>Kurse</em></div>
          <div class="stat-delta">28 Anmeldungen erwartet</div>
        </div>
        <div class="stat">
          <div class="stat-label">Anwesend · jetzt</div>
          <div class="stat-value">22</div>
          <div class="stat-delta up">79% Auslastung</div>
        </div>
        <div class="stat">
          <div class="stat-label">Krank gemeldet</div>
          <div class="stat-value">3</div>
          <div class="stat-delta">Add-Up automatisch gutgeschrieben</div>
        </div>
        <div class="stat">
          <div class="stat-label">No-Shows · 30d</div>
          <div class="stat-value">4 <em>%</em></div>
          <div class="stat-delta">unter Branchen-Schnitt</div>
        </div>
      </div>

      <div class="att-toolbar">
        <div class="att-date-pick">
          <div class="date-arrow">←</div>
          <div>
            <div class="date">Heute, 25. <em>April</em> 2026</div>
            <div style="font-size:12px;color:var(--muted-2);margin-top:1px;">Freitag · KW 17 · 3 Kurse · 28 erwartet</div>
          </div>
          <div class="date-arrow">→</div>
        </div>
        <div class="att-quick">
          <span class="quick">Gestern</span>
          <span class="quick active">Heute</span>
          <span class="quick">Morgen</span>
          <span class="quick">Diese Woche</span>
        </div>
      </div>

      <div class="att-class-list">

        <div class="att-class">
          <div class="att-class-head">
            <div>
              <div class="att-class-title">Babykurs <em>Krabbeln</em> · 09:30 – 10:15</div>
              <div class="att-class-meta">Saal A · Sophie · 8 Anmeldungen · läuft seit 24 Min</div>
            </div>
            <div class="att-class-stats">
              <div class="stat-item">
                <div class="stat-num" style="color:var(--sage-deep);">7</div>
                <div class="stat-label">Anwesend</div>
              </div>
              <div class="stat-item">
                <div class="stat-num" style="color:var(--signal);">1</div>
                <div class="stat-label">Krank</div>
              </div>
              <div class="stat-item">
                <div class="stat-num">88<span style="font-size:13px;">%</span></div>
                <div class="stat-label">Quote</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm">Alle markieren</button>
          </div>
          <div class="att-rows">

            <div class="att-row">
              <div class="att-avatar">M</div>
              <div>
                <div class="att-name">Mia B. <span style="font-weight:400;color:var(--muted-2);">· 8 Mo</span></div>
                <div class="att-name-meta">Hannah B. · seit Feb 2026</div>
              </div>
              <div><span class="att-rate high">88% Quote</span> · 6/8 Termine</div>
              <div class="att-toggle">
                <button>Anwesend</button>
                <button>Spät</button>
                <button>Fehlt</button>
                <button class="active excused">Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

            <div class="att-row">
              <div class="att-avatar">L</div>
              <div>
                <div class="att-name">Lia M. <span style="font-weight:400;color:var(--muted-2);">· 10 Mo</span></div>
                <div class="att-name-meta">Sara M. · seit Mär 2026</div>
              </div>
              <div><span class="att-rate high">95% Quote</span> · 7/8 Termine</div>
              <div class="att-toggle">
                <button class="active present">Anwesend</button>
                <button>Spät</button>
                <button>Fehlt</button>
                <button>Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

            <div class="att-row">
              <div class="att-avatar">E</div>
              <div>
                <div class="att-name">Emma K. <span style="font-weight:400;color:var(--muted-2);">· 9 Mo</span></div>
                <div class="att-name-meta">Lisa K. · seit Apr 2026</div>
              </div>
              <div><span class="att-rate high">100% Quote</span> · 4/4 Termine</div>
              <div class="att-toggle">
                <button class="active present">Anwesend</button>
                <button>Spät</button>
                <button>Fehlt</button>
                <button>Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

            <div class="att-row">
              <div class="att-avatar">P</div>
              <div>
                <div class="att-name">Paul R. <span style="font-weight:400;color:var(--muted-2);">· 1 J</span></div>
                <div class="att-name-meta">Tina R. · seit Jan 2026</div>
              </div>
              <div><span class="att-rate med">75% Quote</span> · 9/12 Termine</div>
              <div class="att-toggle">
                <button>Anwesend</button>
                <button class="active late">+8 Min</button>
                <button>Fehlt</button>
                <button>Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

            <div class="att-row">
              <div class="att-avatar">N</div>
              <div>
                <div class="att-name">Noah F. <span style="font-weight:400;color:var(--muted-2);">· 7 Mo</span></div>
                <div class="att-name-meta">Marie F. · seit Mär 2026</div>
              </div>
              <div><span class="att-rate high">90% Quote</span> · 9/10 Termine</div>
              <div class="att-toggle">
                <button class="active present">Anwesend</button>
                <button>Spät</button>
                <button>Fehlt</button>
                <button>Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

            <div class="att-row">
              <div class="att-avatar">A</div>
              <div>
                <div class="att-name">Aaliyah S. <span style="font-weight:400;color:var(--muted-2);">· 11 Mo</span></div>
                <div class="att-name-meta">Familie Schulz · seit Feb 2026</div>
              </div>
              <div><span class="att-rate high">92% Quote</span> · 11/12 Termine</div>
              <div class="att-toggle">
                <button class="active present">Anwesend</button>
                <button>Spät</button>
                <button>Fehlt</button>
                <button>Krank</button>
              </div>
              <button class="att-icon-btn" title="Notiz">✎</button>
            </div>

          </div>
        </div>

        <div class="att-class">
          <div class="att-class-head">
            <div>
              <div class="att-class-title">Krabbel-<em>Yoga</em> · 11:00 – 12:00</div>
              <div class="att-class-meta">Saal B · Lena · 12 Anmeldungen · in 26 Min</div>
            </div>
            <div class="att-class-stats">
              <div class="stat-item">
                <div class="stat-num" style="color:var(--muted-2);">–</div>
                <div class="stat-label">Anwesend</div>
              </div>
              <div class="stat-item">
                <div class="stat-num" style="color:var(--muted-2);">–</div>
                <div class="stat-label">Krank</div>
              </div>
              <div class="stat-item">
                <div class="stat-num" style="color:var(--muted-2);">–</div>
                <div class="stat-label">Quote</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm">Vorbereiten</button>
          </div>
          <div style="padding: 22px; text-align: center; color: var(--muted-2); font-size: 13px;">Kurs startet in 26 Min — Roll-Call wird automatisch um 10:55 Uhr aktiviert.</div>
        </div>

        <div class="att-class">
          <div class="att-class-head">
            <div>
              <div class="att-class-title">Tanz <em>4–6 J</em> · 16:30 – 17:15</div>
              <div class="att-class-meta">Saal A · Mira · 8 Anmeldungen · heute Nachmittag</div>
            </div>
            <div class="att-class-stats">
              <div class="stat-item">
                <div class="stat-num" style="color:var(--muted-2);">–</div>
                <div class="stat-label">Anwesend</div>
              </div>
              <div class="stat-item">
                <div class="stat-num" style="color:var(--signal);">2</div>
                <div class="stat-label">Krank</div>
              </div>
              <div class="stat-item">
                <div class="stat-num" style="color:var(--muted-2);">–</div>
                <div class="stat-label">Quote</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm">Vorbereiten</button>
          </div>
          <div style="padding: 22px; text-align: center; color: var(--muted-2); font-size: 13px;">2 Krankmeldungen schon eingegangen · Wartelisten-Match wird ab 14 Uhr ausgelöst.</div>
        </div>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div class="card-head">
          <div class="card-title">No-Show-<em>Watchlist</em></div>
          <a href="#" class="card-link">Alle ansehen →</a>
        </div>
        <table class="credit-table">
          <thead>
            <tr>
              <th>Familie</th>
              <th>Anwesenheits-Quote</th>
              <th>Letzter No-Show</th>
              <th>Empfehlung</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Familie Müller</strong> · Jonas (3 J)</td>
              <td><span class="att-rate low">42%</span> 5/12</td>
              <td>vor 3 Tagen</td>
              <td>Reminder + Telefonat</td>
              <td><button class="btn btn-ghost btn-sm">Kontakt</button></td>
            </tr>
            <tr>
              <td><strong>Anna H.</strong> · Lara (5 J)</td>
              <td><span class="att-rate med">62%</span> 8/13</td>
              <td>vor 1 Wo</td>
              <td>Auto-Reminder reicht</td>
              <td><button class="btn btn-ghost btn-sm">Kontakt</button></td>
            </tr>
            <tr>
              <td><strong>Familie Werner</strong> · Eva</td>
              <td><span class="att-rate low">38%</span> 3/8</td>
              <td>gestern</td>
              <td>Persönliches Gespräch</td>
              <td><button class="btn btn-ghost btn-sm">Kontakt</button></td>
            </tr>
          </tbody>
        </table>
      </div>
'''


# ============================================================
# WRITE
# ============================================================
PAGES = [
    ("postfach-preview.html", "Postfach", "/postfach-preview", POSTFACH_BODY, POSTFACH_STYLE),
    ("ki-assistent-preview.html", "KI-Assistent", "/ki-assistent-preview", KI_BODY, KI_STYLE),
    ("integrationen-preview.html", "Integrationen", "/integrationen-preview", INT_BODY, INT_STYLE),
    ("raeume-preview.html", "Räume", "/raeume-preview", RM_BODY, RM_STYLE),
    ("credits-preview.html", "Credits", "/credits-preview", CR_BODY, CR_STYLE),
    ("anwesenheit-preview.html", "Anwesenheit", "/anwesenheit-preview", ATT_BODY, ATT_STYLE),
]

for filename, title, active, body, style in PAGES:
    out = render_page(filename.replace(".html", ""), title, active, body, style)
    p = ROOT / filename
    p.write_text(out, encoding="utf-8")
    print(f"  OK {filename} ({len(out)} bytes)")

print(f"\nOK Generated {len(PAGES)} pages")

# Cleanup shell file
(ROOT / "_v2_shell_head.html").unlink(missing_ok=True)
print("OK Cleaned up _v2_shell_head.html")
