#!/usr/bin/env python3
"""
Generiert 5 neue Subpages aus dem einstellungen-preview.html Shell:
- kursbloecke-preview.html
- probestunden-preview.html
- team-preview.html
- berichte-preview.html
- ferien-preview.html

Strategy:
  1. Read einstellungen-preview.html
  2. Split at `<!-- PAGE -->` marker
  3. For each new page, replace:
     - <title>
     - sidebar-nav active state
     - search placeholder
     - page content block
  4. Write new HTML file
"""
import re
from pathlib import Path

WIDGETS = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets")
SHELL = (WIDGETS / "einstellungen-preview.html").read_text(encoding="utf-8")

# Find boundaries
# Everything up to and including the `<!-- PAGE -->` + `<div class="page">` line
page_start_idx = SHELL.find("    <!-- PAGE -->\n    <div class=\"page\">")
assert page_start_idx > 0, "PAGE marker not found"
# The content body ends at the line with:    </div>\n  </div>\n</div>\n\n<script>\n
# Find `    </div>\n  </div>\n</div>\n\n<script>\nfunction toggleSidebar`
close_marker = "    </div>\n  </div>\n</div>\n\n<script>\nfunction toggleSidebar"
page_end_idx = SHELL.find(close_marker)
assert page_end_idx > 0, "Page close marker not found"

HEAD = SHELL[:page_start_idx]
TAIL = SHELL[page_end_idx:]

def build_page(title, search_placeholder, active_nav_text, page_kicker, page_h1_html, page_sub, primary_btn, content_html):
    """Assemble new page HTML from shell + content."""
    head = HEAD

    # Replace <title> tag
    head = re.sub(
        r"<title>.*?</title>",
        f"<title>{title}</title>",
        head,
        count=1,
    )

    # Remove existing active class from Einstellungen
    head = head.replace(
        'class="nav-item active" onclick="window.location.href=\'/einstellungen-preview\'"',
        'class="nav-item" onclick="window.location.href=\'/einstellungen-preview\'"',
    )

    # Add active class on the target nav button (matching by its visible text)
    # Pattern: <button class="nav-item"[ attrs]>TEXT [badge]</button>
    # We do it line-by-line for precision
    lines = head.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if 'class="nav-item"' in line and active_nav_text in line:
            # add onclick if missing (so dashboard-ui.js handles it), keep existing if present
            lines[i] = line.replace('class="nav-item"', 'class="nav-item active"', 1)
            break
    head = "".join(lines)

    # Update search placeholder
    head = re.sub(
        r'<input type="search" placeholder="[^"]*">',
        f'<input type="search" placeholder="{search_placeholder}">',
        head,
        count=1,
    )

    page_block = f"""    <!-- PAGE -->
    <div class="page">

      <div class="page-head">
        <div class="page-head-text">
          <div class="page-kicker">{page_kicker}</div>
          <h1 class="page-title">{page_h1_html}</h1>
          <p class="page-sub">{page_sub}</p>
        </div>
        <div>
          {primary_btn}
        </div>
      </div>

{content_html}

"""

    return head + page_block + TAIL


# ============================================================
# 1) KURSBLÖCKE
# ============================================================
KURSBLOECKE_CONTENT = """      <!-- Filter-Bar -->
      <div class="filter-tabs" role="tablist" aria-label="Kursblock-Filter">
        <button class="filter-tab active">Alle <span class="badge">12</span></button>
        <button class="filter-tab">Laufend <span class="badge">7</span></button>
        <button class="filter-tab">Geplant <span class="badge">3</span></button>
        <button class="filter-tab">Archiviert <span class="badge">2</span></button>
      </div>

      <!-- Kursblock-Grid -->
      <div class="block-grid">

        <article class="block-card">
          <div class="block-card-head">
            <div class="block-badge">10 Wochen</div>
            <div class="status-pill status-active">Laufend</div>
          </div>
          <h3 class="block-title">Musikgarten <em class="italic">Junior</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">04. Feb 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">15. Apr 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Teilnehmer</span><span class="block-meta-val">9 &middot; 12</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">Raum 2 &middot; Mi 09:30</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:75%"></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Woche 7 &middot; 8 / 10</span>
            <button class="btn btn-ghost btn-sm">Details</button>
          </div>
        </article>

        <article class="block-card">
          <div class="block-card-head">
            <div class="block-badge">8 Wochen</div>
            <div class="status-pill status-active">Laufend</div>
          </div>
          <h3 class="block-title">Eltern-Kind <em class="italic">Tanzen</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">18. Feb 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">15. Apr 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Teilnehmer</span><span class="block-meta-val">11 &middot; 12</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">Raum 1 &middot; Mi 10:00</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:62%"></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Woche 5 &middot; 6 / 8</span>
            <button class="btn btn-ghost btn-sm">Details</button>
          </div>
        </article>

        <article class="block-card">
          <div class="block-card-head">
            <div class="block-badge">12 Wochen</div>
            <div class="status-pill status-active">Laufend</div>
          </div>
          <h3 class="block-title">Krabbel <em class="italic">Musik</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">14. Jan 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">08. Apr 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Teilnehmer</span><span class="block-meta-val">8 &middot; 10</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">Raum 3 &middot; Di 09:00</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:83%"></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Woche 10 &middot; 11 / 12</span>
            <button class="btn btn-ghost btn-sm">Details</button>
          </div>
        </article>

        <article class="block-card">
          <div class="block-card-head">
            <div class="block-badge">10 Wochen</div>
            <div class="status-pill status-planned">Geplant</div>
          </div>
          <h3 class="block-title">Yoga <em class="italic">Mini</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">06. Mai 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">15. Jul 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Anmeldungen</span><span class="block-meta-val">4 &middot; 10</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">Raum 1 &middot; Mo 16:30</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:0%"></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Start in 12 Tagen</span>
            <button class="btn btn-ghost btn-sm">Bearbeiten</button>
          </div>
        </article>

        <article class="block-card">
          <div class="block-card-head">
            <div class="block-badge">8 Wochen</div>
            <div class="status-pill status-planned">Geplant</div>
          </div>
          <h3 class="block-title">Kinder <em class="italic">Zumba</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Start</span><span class="block-meta-val">13. Mai 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Ende</span><span class="block-meta-val">08. Jul 2026</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Anmeldungen</span><span class="block-meta-val">7 &middot; 14</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Raum</span><span class="block-meta-val">Raum 2 &middot; Fr 15:00</span></div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar" style="width:0%"></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Start in 19 Tagen</span>
            <button class="btn btn-ghost btn-sm">Bearbeiten</button>
          </div>
        </article>

        <article class="block-card block-card-muted">
          <div class="block-card-head">
            <div class="block-badge">10 Wochen</div>
            <div class="status-pill status-archived">Archiviert</div>
          </div>
          <h3 class="block-title">Musikgarten <em class="italic">Baby</em></h3>
          <div class="block-meta">
            <div class="block-meta-row"><span class="block-meta-label">Zeitraum</span><span class="block-meta-val">Okt &ndash; Dez 2025</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Teilnehmer</span><span class="block-meta-val">10 &middot; 10</span></div>
            <div class="block-meta-row"><span class="block-meta-label">Umsatz</span><span class="block-meta-val">2.400 &euro;</span></div>
            <div class="block-meta-row"><span class="block-meta-label">NPS</span><span class="block-meta-val">9,2 &middot; 8 Reviews</span></div>
          </div>
          <div class="block-foot">
            <span class="progress-label">Abgeschlossen &middot; 10 / 10 Stunden</span>
            <button class="btn btn-ghost btn-sm">Report</button>
          </div>
        </article>

        <!-- Add-Card -->
        <article class="block-card block-card-add">
          <div class="add-icon">+</div>
          <div class="add-title">Neuer <em class="italic">Kursblock</em></div>
          <div class="add-sub">Vorlage w&auml;hlen, Termine planen, Teilnehmer einladen.</div>
          <button class="btn btn-primary btn-sm" style="margin-top:16px">Block erstellen</button>
        </article>

      </div>

      <style>
      .filter-tabs { display:flex; gap:6px; margin-bottom:24px; flex-wrap:wrap; }
      .filter-tab { background:var(--surface); border:1px solid var(--border); padding:8px 14px; border-radius:var(--radius-pill); font-size:13px; font-weight:500; color:var(--ink-2); cursor:pointer; display:flex; align-items:center; gap:8px; transition: all var(--motion-fast); }
      .filter-tab:hover { background:var(--surface-alt); }
      .filter-tab.active { background:var(--ink); color:var(--bg); border-color:var(--ink); }
      .filter-tab .badge { background:rgba(60,33,36,0.08); color:var(--ink-2); padding:2px 8px; border-radius:var(--radius-pill); font-size:11px; font-weight:600; font-variant-numeric: tabular-nums; }
      .filter-tab.active .badge { background:rgba(255,239,225,0.2); color:var(--bg); }

      .block-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:18px; }
      .block-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:22px; display:flex; flex-direction:column; gap:14px; transition: all var(--motion-base); box-shadow: var(--shadow); }
      .block-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--border-strong); }
      .block-card-muted { opacity:0.78; }
      .block-card-head { display:flex; justify-content:space-between; align-items:center; }
      .block-badge { background:var(--primary-tint); color:var(--ink); font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; padding:4px 10px; border-radius:var(--radius-pill); }
      .status-pill { font-size:11px; font-weight:600; padding:4px 10px; border-radius:var(--radius-pill); font-family:var(--font-heading); letter-spacing:0.08em; text-transform:uppercase; }
      .status-active { background:#E4EBDE; color:#3E5030; }
      .status-planned { background:#F5DCC5; color:#874920; }
      .status-archived { background:rgba(60,33,36,0.08); color:var(--ink-2); }
      .block-title { font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--ink); line-height:1.15; letter-spacing:0.01em; }
      .block-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); letter-spacing:0; }
      .block-meta { display:flex; flex-direction:column; gap:6px; padding:12px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
      .block-meta-row { display:flex; justify-content:space-between; font-size:13px; }
      .block-meta-label { color:var(--muted-2); }
      .block-meta-val { color:var(--ink); font-weight:500; }
      .progress-wrap { height:6px; background:var(--surface-alt); border-radius:var(--radius-pill); overflow:hidden; }
      .progress-bar { height:100%; background: linear-gradient(90deg, var(--primary-soft), var(--primary)); border-radius:var(--radius-pill); transition: width var(--motion-base); }
      .progress-label { font-size:12px; color:var(--muted-2); }
      .block-foot { display:flex; justify-content:space-between; align-items:center; }

      .block-card-add { border-style:dashed; background:transparent; align-items:center; justify-content:center; text-align:center; padding:36px 22px; cursor:pointer; }
      .block-card-add:hover { background:var(--surface); border-style:solid; border-color: var(--primary); }
      .add-icon { font-family:var(--font-heading); font-size:48px; font-weight:300; color:var(--primary); line-height:1; }
      .add-title { font-family:var(--font-heading); font-size:19px; font-weight:700; color:var(--ink); }
      .add-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .add-sub { font-size:13px; color:var(--muted-2); max-width:220px; line-height:1.5; }

      .btn { font-family:var(--font-body); font-weight:600; border:none; cursor:pointer; border-radius:var(--radius-pill); padding:10px 18px; font-size:13px; letter-spacing:0.02em; transition: all var(--motion-fast); display:inline-flex; align-items:center; gap:8px; }
      .btn-sm { padding:7px 14px; font-size:12px; }
      .btn-primary { background:var(--primary); color:var(--bg); }
      .btn-primary:hover { background:var(--primary-hover); }
      .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--border-strong); }
      .btn-ghost:hover { background:var(--surface); }
      .btn-destructive { background:var(--signal); color:var(--bg); }
      .btn-destructive:hover { background:var(--signal-hover); }
      </style>"""


# ============================================================
# 2) PROBESTUNDEN
# ============================================================
PROBESTUNDEN_CONTENT = """      <!-- KPI Row -->
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Diese Woche</div>
          <div class="kpi-value">4</div>
          <div class="kpi-trend positive">+2 ggü. letzter Woche</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Conversion</div>
          <div class="kpi-value">68%</div>
          <div class="kpi-trend positive">Schnupper → Buchung</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Offen</div>
          <div class="kpi-value">7</div>
          <div class="kpi-trend">Folgen ausstehend</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Via Mom-Graph</div>
          <div class="kpi-value">12</div>
          <div class="kpi-trend positive">60% aller Trials</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="filter-tabs" role="tablist" aria-label="Probestunden-Filter">
        <button class="filter-tab active">Bevorstehend <span class="badge">8</span></button>
        <button class="filter-tab">Heute <span class="badge">2</span></button>
        <button class="filter-tab">Folge-Aufruf <span class="badge">7</span></button>
        <button class="filter-tab">Absagen <span class="badge">3</span></button>
        <button class="filter-tab">Alle</button>
      </div>

      <!-- Tabelle -->
      <div class="card">
        <div class="table-head">
          <div class="table-title">Kommende <em class="italic">Schnupperstunden</em></div>
          <button class="btn btn-primary btn-sm">+ Neue Probestunde</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Datum &middot; Zeit</th>
              <th>Kurs</th>
              <th>Kind</th>
              <th>Elternteil</th>
              <th>Herkunft</th>
              <th>Status</th>
              <th style="text-align:right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Do 25. Apr</strong><br><span class="cell-sub">10:00 &ndash; 10:45</span></td>
              <td>Musikgarten Junior<br><span class="cell-sub">Raum 2</span></td>
              <td>Lea Hartmann<br><span class="cell-sub">2 J.</span></td>
              <td>Miriam Hartmann<br><span class="cell-sub">+49 172 9812345</span></td>
              <td><span class="origin-pill origin-momgraph">Mom-Graph</span><br><span class="cell-sub">via Anna Klein</span></td>
              <td><span class="status-pill status-active">Bestätigt</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bearbeiten</button></td>
            </tr>
            <tr>
              <td><strong>Do 25. Apr</strong><br><span class="cell-sub">11:00 &ndash; 11:45</span></td>
              <td>Eltern-Kind Tanzen<br><span class="cell-sub">Raum 1</span></td>
              <td>Ben Richter<br><span class="cell-sub">3 J.</span></td>
              <td>Tina Richter<br><span class="cell-sub">+49 151 4589012</span></td>
              <td><span class="origin-pill origin-direct">Direkt</span></td>
              <td><span class="status-pill status-pending">Ausstehend</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bestätigen</button></td>
            </tr>
            <tr>
              <td><strong>Fr 26. Apr</strong><br><span class="cell-sub">09:30 &ndash; 10:15</span></td>
              <td>Krabbel Musik<br><span class="cell-sub">Raum 3</span></td>
              <td>Mia Vogel<br><span class="cell-sub">1 J.</span></td>
              <td>Sarah Vogel<br><span class="cell-sub">+49 176 2341567</span></td>
              <td><span class="origin-pill origin-momgraph">Mom-Graph</span><br><span class="cell-sub">via Julia Weber</span></td>
              <td><span class="status-pill status-active">Bestätigt</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bearbeiten</button></td>
            </tr>
            <tr>
              <td><strong>Mo 29. Apr</strong><br><span class="cell-sub">16:00 &ndash; 16:45</span></td>
              <td>Yoga Mini<br><span class="cell-sub">Raum 1</span></td>
              <td>Noah Petrov<br><span class="cell-sub">4 J.</span></td>
              <td>Oksana Petrov<br><span class="cell-sub">+49 173 8765432</span></td>
              <td><span class="origin-pill origin-direct">Direkt</span></td>
              <td><span class="status-pill status-active">Bestätigt</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bearbeiten</button></td>
            </tr>
            <tr>
              <td><strong>Di 30. Apr</strong><br><span class="cell-sub">09:00 &ndash; 09:45</span></td>
              <td>Krabbel Musik<br><span class="cell-sub">Raum 3</span></td>
              <td>Emma Silva<br><span class="cell-sub">0 J. 10 M.</span></td>
              <td>Carolina Silva<br><span class="cell-sub">+49 162 5648391</span></td>
              <td><span class="origin-pill origin-momgraph">Mom-Graph</span><br><span class="cell-sub">via Miriam Hartmann</span></td>
              <td><span class="status-pill status-pending">Ausstehend</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bestätigen</button></td>
            </tr>
            <tr>
              <td><strong>Mi 01. Mai</strong><br><span class="cell-sub">10:30 &ndash; 11:15</span></td>
              <td>Musikgarten Junior<br><span class="cell-sub">Raum 2</span></td>
              <td>Felix Ziegler<br><span class="cell-sub">2 J.</span></td>
              <td>Marie Ziegler<br><span class="cell-sub">+49 170 1122334</span></td>
              <td><span class="origin-pill origin-direct">Direkt</span></td>
              <td><span class="status-pill status-active">Bestätigt</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bearbeiten</button></td>
            </tr>
            <tr>
              <td><strong>Do 02. Mai</strong><br><span class="cell-sub">11:00 &ndash; 11:45</span></td>
              <td>Kinder Zumba<br><span class="cell-sub">Raum 2</span></td>
              <td>Lara Koch<br><span class="cell-sub">5 J.</span></td>
              <td>Denise Koch<br><span class="cell-sub">+49 157 8899001</span></td>
              <td><span class="origin-pill origin-momgraph">Mom-Graph</span><br><span class="cell-sub">via Sarah Vogel</span></td>
              <td><span class="status-pill status-active">Bestätigt</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bearbeiten</button></td>
            </tr>
            <tr>
              <td><strong>Fr 03. Mai</strong><br><span class="cell-sub">15:00 &ndash; 15:45</span></td>
              <td>Eltern-Kind Tanzen<br><span class="cell-sub">Raum 1</span></td>
              <td>Jonas Mayer<br><span class="cell-sub">3 J.</span></td>
              <td>Lisa Mayer<br><span class="cell-sub">+49 178 4433221</span></td>
              <td><span class="origin-pill origin-direct">Direkt</span></td>
              <td><span class="status-pill status-pending">Ausstehend</span></td>
              <td class="table-actions"><button class="btn btn-ghost btn-sm">Bestätigen</button></td>
            </tr>
          </tbody>
        </table>

        <div class="pagination-bar">
          <span class="pagination-info">Zeige 1 &ndash; 8 von 23 Probestunden</span>
          <div class="pagination-controls">
            <button class="pager-btn">&larr;</button>
            <button class="pager-btn active">1</button>
            <button class="pager-btn">2</button>
            <button class="pager-btn">3</button>
            <button class="pager-btn">&rarr;</button>
          </div>
        </div>
      </div>

      <!-- Follow-up Panel -->
      <div class="follow-up-panel">
        <div class="follow-up-head">
          <div>
            <div class="follow-up-kicker">Nach der Schnupper</div>
            <h3 class="follow-up-title">Offene <em class="italic">Folgegespräche</em></h3>
            <p class="follow-up-sub">Nach 48 Std. ohne Antwort automatisch auf „Nachfassen" gesetzt.</p>
          </div>
          <button class="btn btn-primary btn-sm">Nachricht senden</button>
        </div>
        <div class="follow-up-list">
          <div class="follow-up-item">
            <div class="follow-up-name">Tina Richter &middot; <span class="cell-sub">Eltern-Kind Tanzen</span></div>
            <div class="follow-up-stat">Schnupper Mi 17. Apr &middot; noch keine Rückmeldung (6 Tage)</div>
            <button class="btn btn-ghost btn-sm">Follow-up senden</button>
          </div>
          <div class="follow-up-item">
            <div class="follow-up-name">Oksana Petrov &middot; <span class="cell-sub">Yoga Mini</span></div>
            <div class="follow-up-stat">Schnupper Do 18. Apr &middot; noch keine Rückmeldung (5 Tage)</div>
            <button class="btn btn-ghost btn-sm">Follow-up senden</button>
          </div>
          <div class="follow-up-item">
            <div class="follow-up-name">Marie Ziegler &middot; <span class="cell-sub">Musikgarten Junior</span></div>
            <div class="follow-up-stat">Schnupper Fr 19. Apr &middot; noch keine Rückmeldung (4 Tage)</div>
            <button class="btn btn-ghost btn-sm">Follow-up senden</button>
          </div>
        </div>
      </div>

      <style>
      .kpi-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:16px; margin-bottom:28px; }
      .kpi { background: var(--surface); border:1px solid var(--border); padding:22px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
      .kpi-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:10px; }
      .kpi-value { font-family:var(--font-heading); font-size:38px; font-weight:700; color:var(--ink); line-height:1; font-variant-numeric: tabular-nums; }
      .kpi-trend { font-size:12px; color:var(--muted-2); margin-top:10px; }
      .kpi-trend.positive { color: var(--sage-deep); }

      .filter-tabs { display:flex; gap:6px; margin-bottom:24px; flex-wrap:wrap; }
      .filter-tab { background:var(--surface); border:1px solid var(--border); padding:8px 14px; border-radius:var(--radius-pill); font-size:13px; font-weight:500; color:var(--ink-2); cursor:pointer; display:flex; align-items:center; gap:8px; transition: all var(--motion-fast); }
      .filter-tab:hover { background:var(--surface-alt); }
      .filter-tab.active { background:var(--ink); color:var(--bg); border-color:var(--ink); }
      .filter-tab .badge { background:rgba(60,33,36,0.08); color:var(--ink-2); padding:2px 8px; border-radius:var(--radius-pill); font-size:11px; font-weight:600; font-variant-numeric: tabular-nums; }
      .filter-tab.active .badge { background:rgba(255,239,225,0.2); color:var(--bg); }

      .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:26px; margin-bottom:22px; box-shadow:var(--shadow); }
      .table-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
      .table-title { font-family:var(--font-heading); font-size:20px; font-weight:700; color:var(--ink); }
      .table-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }

      .data-table { width:100%; border-collapse: collapse; font-size:13px; }
      .data-table th { text-align:left; font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted-2); padding:12px 10px; border-bottom:1px solid var(--border); }
      .data-table td { padding:14px 10px; border-bottom:1px solid var(--border); color:var(--ink); vertical-align:top; }
      .data-table tr:hover td { background:var(--surface-alt); }
      .cell-sub { color:var(--muted-2); font-size:12px; }
      .table-actions { text-align:right; }

      .origin-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:var(--radius-pill); font-family:var(--font-heading); letter-spacing:0.08em; text-transform:uppercase; display:inline-block; }
      .origin-momgraph { background:#F5DCC5; color:#874920; }
      .origin-direct { background: rgba(60,33,36,0.06); color: var(--ink-2); }

      .status-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:var(--radius-pill); font-family:var(--font-heading); letter-spacing:0.08em; text-transform:uppercase; display:inline-block; }
      .status-active { background:#E4EBDE; color:#3E5030; }
      .status-pending { background:#F5DCC5; color:#874920; }
      .status-archived { background:rgba(60,33,36,0.08); color:var(--ink-2); }

      .pagination-bar { display:flex; justify-content:space-between; align-items:center; padding:16px 0 0; border-top:1px solid var(--border); margin-top:16px; }
      .pagination-info { color:var(--muted-2); font-size:13px; }
      .pagination-controls { display:flex; gap:6px; }
      .pager-btn { background:var(--surface); border:1px solid var(--border); padding:6px 12px; border-radius:var(--radius-sm); font-size:12px; font-weight:600; color:var(--ink); cursor:pointer; min-width:32px; }
      .pager-btn:hover { background:var(--surface-alt); }
      .pager-btn.active { background:var(--ink); color:var(--bg); border-color:var(--ink); }

      .follow-up-panel { background:var(--surface); border:1px solid var(--border); border-radius: var(--radius-lg); padding:26px; margin-top:8px; }
      .follow-up-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; gap:16px; }
      .follow-up-kicker { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:4px; }
      .follow-up-title { font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--ink); }
      .follow-up-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .follow-up-sub { font-size:13px; color:var(--muted-2); margin-top:4px; max-width:540px; }
      .follow-up-list { display:flex; flex-direction:column; gap:10px; }
      .follow-up-item { display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-md); gap:16px; flex-wrap:wrap; }
      .follow-up-name { font-weight:600; color:var(--ink); font-size:14px; }
      .follow-up-stat { font-size:12px; color:var(--muted-2); flex:1; }

      .btn { font-family:var(--font-body); font-weight:600; border:none; cursor:pointer; border-radius:var(--radius-pill); padding:10px 18px; font-size:13px; letter-spacing:0.02em; transition: all var(--motion-fast); display:inline-flex; align-items:center; gap:8px; }
      .btn-sm { padding:7px 14px; font-size:12px; }
      .btn-primary { background:var(--primary); color:var(--bg); }
      .btn-primary:hover { background:var(--primary-hover); }
      .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--border-strong); }
      .btn-ghost:hover { background:var(--surface); }
      </style>"""


# ============================================================
# 3) TEAM
# ============================================================
TEAM_CONTENT = """      <!-- Team KPIs -->
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Aktive Mitarbeiter</div>
          <div class="kpi-value">6</div>
          <div class="kpi-trend">2 Admin &middot; 4 Trainer</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Einladungen offen</div>
          <div class="kpi-value">1</div>
          <div class="kpi-trend">seit 3 Tagen</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Diese Woche</div>
          <div class="kpi-value">38</div>
          <div class="kpi-trend positive">Trainer-Stunden</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Trainer-NPS</div>
          <div class="kpi-value">9,1</div>
          <div class="kpi-trend positive">Durchschnitt</div>
        </div>
      </div>

      <!-- Team-Grid -->
      <div class="team-grid">

        <article class="team-card team-card-owner">
          <div class="team-head">
            <div class="team-avatar" style="background: linear-gradient(135deg, #CC895E, #B4523A)">S</div>
            <div>
              <div class="team-name">Sophie <em class="italic">Brandt</em></div>
              <div class="team-role">Inhaberin &middot; Admin</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">E-Mail</span><span class="meta-val">sophie@socialy.club</span></div>
            <div class="team-meta-row"><span class="meta-label">Zugriff</span><span class="meta-val">Alle Bereiche</span></div>
            <div class="team-meta-row"><span class="meta-label">Zuletzt aktiv</span><span class="meta-val">Vor 2 Minuten</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-active">Online</span>
          </div>
        </article>

        <article class="team-card">
          <div class="team-head">
            <div class="team-avatar" style="background: linear-gradient(135deg, #93A388, #627A5A)">J</div>
            <div>
              <div class="team-name">Julia <em class="italic">Weber</em></div>
              <div class="team-role">Admin &middot; Office</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">E-Mail</span><span class="meta-val">julia@socialy.club</span></div>
            <div class="team-meta-row"><span class="meta-label">Zugriff</span><span class="meta-val">Buchungen, Kunden, Rechnungen</span></div>
            <div class="team-meta-row"><span class="meta-label">Zuletzt aktiv</span><span class="meta-val">Heute, 09:14</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-active">Online</span>
            <button class="btn btn-ghost btn-sm">Verwalten</button>
          </div>
        </article>

        <article class="team-card">
          <div class="team-head">
            <div class="team-avatar" style="background: linear-gradient(135deg, #D7A98A, #A78776)">M</div>
            <div>
              <div class="team-name">Miriam <em class="italic">Tanzpädagogin</em></div>
              <div class="team-role">Trainerin &middot; Eltern-Kind</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">Kurse</span><span class="meta-val">Eltern-Kind Tanzen, Kinder Zumba</span></div>
            <div class="team-meta-row"><span class="meta-label">Stunden / Woche</span><span class="meta-val">12,5</span></div>
            <div class="team-meta-row"><span class="meta-label">Zuletzt aktiv</span><span class="meta-val">Gestern, 18:42</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-muted">Offline</span>
            <button class="btn btn-ghost btn-sm">Verwalten</button>
          </div>
        </article>

        <article class="team-card">
          <div class="team-head">
            <div class="team-avatar" style="background: linear-gradient(135deg, #AFC7B3, #627A5A)">L</div>
            <div>
              <div class="team-name">Leo <em class="italic">Musikgarten</em></div>
              <div class="team-role">Trainer &middot; Musikpädagogik</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">Kurse</span><span class="meta-val">Musikgarten Junior, Krabbel Musik</span></div>
            <div class="team-meta-row"><span class="meta-label">Stunden / Woche</span><span class="meta-val">10,0</span></div>
            <div class="team-meta-row"><span class="meta-label">Zuletzt aktiv</span><span class="meta-val">Heute, 08:05</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-active">Online</span>
            <button class="btn btn-ghost btn-sm">Verwalten</button>
          </div>
        </article>

        <article class="team-card">
          <div class="team-head">
            <div class="team-avatar" style="background: linear-gradient(135deg, #F5DCC5, #CC895E)">P</div>
            <div>
              <div class="team-name">Pia <em class="italic">Yogalehrerin</em></div>
              <div class="team-role">Trainerin &middot; Yoga &amp; Entspannung</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">Kurse</span><span class="meta-val">Yoga Mini, Entspannung Teens</span></div>
            <div class="team-meta-row"><span class="meta-label">Stunden / Woche</span><span class="meta-val">8,0</span></div>
            <div class="team-meta-row"><span class="meta-label">Zuletzt aktiv</span><span class="meta-val">Vor 3 Tagen</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-muted">Offline</span>
            <button class="btn btn-ghost btn-sm">Verwalten</button>
          </div>
        </article>

        <article class="team-card team-card-muted">
          <div class="team-head">
            <div class="team-avatar" style="background: rgba(60,33,36,0.15); color: var(--muted-2)">T</div>
            <div>
              <div class="team-name">Tim <em class="italic">Aushilfe</em></div>
              <div class="team-role">Aushilfe &middot; Empfang</div>
            </div>
          </div>
          <div class="team-meta">
            <div class="team-meta-row"><span class="meta-label">Zugriff</span><span class="meta-val">Nur Kalender-Ansicht</span></div>
            <div class="team-meta-row"><span class="meta-label">Einladung</span><span class="meta-val">Versendet am 21. Apr</span></div>
            <div class="team-meta-row"><span class="meta-label">Status</span><span class="meta-val">Noch nicht angenommen</span></div>
          </div>
          <div class="team-foot">
            <span class="status-pill status-pending">Einladung offen</span>
            <button class="btn btn-ghost btn-sm">Erneut senden</button>
          </div>
        </article>

        <article class="team-card team-card-add">
          <div class="add-icon">+</div>
          <div class="add-title">Neues <em class="italic">Teammitglied</em></div>
          <div class="add-sub">Rolle vergeben, Zugriffsbereiche festlegen, Einladung verschicken.</div>
          <button class="btn btn-primary btn-sm" style="margin-top:16px">Person einladen</button>
        </article>

      </div>

      <!-- Rollen & Berechtigungen -->
      <div class="card" style="margin-top:28px">
        <div class="table-head">
          <div>
            <div class="section-kicker">Rollen-System</div>
            <div class="table-title">Berechtigungs<em class="italic">-Matrix</em></div>
            <div class="section-sub">Definiert, welche Bereiche jede Rolle sehen und bearbeiten darf.</div>
          </div>
          <button class="btn btn-ghost btn-sm">Eigene Rolle erstellen</button>
        </div>
        <table class="data-table" style="margin-top:20px">
          <thead>
            <tr>
              <th>Bereich</th>
              <th style="text-align:center">Inhaber</th>
              <th style="text-align:center">Admin</th>
              <th style="text-align:center">Trainer</th>
              <th style="text-align:center">Aushilfe</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Kurse &amp; Kursblöcke</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-read">sichtbar</span></td><td class="center"><span class="dot-no">—</span></td></tr>
            <tr><td>Buchungen</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-read">eigene</span></td><td class="center"><span class="dot-no">—</span></td></tr>
            <tr><td>Kunden</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-read">eigene</span></td><td class="center"><span class="dot-no">—</span></td></tr>
            <tr><td>Rechnungen &amp; Finanzen</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-no">—</span></td><td class="center"><span class="dot-no">—</span></td></tr>
            <tr><td>Marketing &amp; Mom-Graph</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-no">—</span></td><td class="center"><span class="dot-no">—</span></td></tr>
            <tr><td>Kalender</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-read">sichtbar</span></td></tr>
            <tr><td>Einstellungen</td><td class="center"><span class="dot-ok">✓</span></td><td class="center"><span class="dot-read">teilweise</span></td><td class="center"><span class="dot-no">—</span></td><td class="center"><span class="dot-no">—</span></td></tr>
          </tbody>
        </table>
      </div>

      <style>
      .kpi-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap:16px; margin-bottom:28px; }
      .kpi { background: var(--surface); border:1px solid var(--border); padding:22px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
      .kpi-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:10px; }
      .kpi-value { font-family:var(--font-heading); font-size:38px; font-weight:700; color:var(--ink); line-height:1; font-variant-numeric: tabular-nums; }
      .kpi-trend { font-size:12px; color:var(--muted-2); margin-top:10px; }
      .kpi-trend.positive { color: var(--sage-deep); }

      .team-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:18px; }
      .team-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:22px; display:flex; flex-direction:column; gap:14px; transition: all var(--motion-base); box-shadow: var(--shadow); }
      .team-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--border-strong); }
      .team-card-owner { border-color: var(--primary); background: linear-gradient(180deg, var(--surface), var(--primary-tint) 400%); }
      .team-card-muted { opacity: 0.82; }
      .team-head { display:flex; gap:14px; align-items:center; }
      .team-avatar { width:52px; height:52px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-heading); font-weight:700; font-size:22px; color:var(--bg); flex-shrink:0; letter-spacing:0; }
      .team-name { font-family:var(--font-heading); font-size:20px; font-weight:700; color:var(--ink); line-height:1.1; }
      .team-name em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .team-role { font-size:12px; color:var(--muted-2); margin-top:2px; }
      .team-meta { display:flex; flex-direction:column; gap:6px; padding:12px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
      .team-meta-row { display:flex; justify-content:space-between; font-size:13px; gap:12px; }
      .meta-label { color:var(--muted-2); }
      .meta-val { color:var(--ink); font-weight:500; text-align:right; }
      .team-foot { display:flex; justify-content:space-between; align-items:center; }

      .status-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:var(--radius-pill); font-family:var(--font-heading); letter-spacing:0.08em; text-transform:uppercase; display:inline-block; }
      .status-active { background:#E4EBDE; color:#3E5030; }
      .status-pending { background:#F5DCC5; color:#874920; }
      .status-muted { background: rgba(60,33,36,0.08); color:var(--ink-2); }

      .team-card-add { border-style:dashed; background:transparent; align-items:center; justify-content:center; text-align:center; padding:36px 22px; cursor:pointer; }
      .team-card-add:hover { background:var(--surface); border-style:solid; border-color: var(--primary); }
      .add-icon { font-family:var(--font-heading); font-size:48px; font-weight:300; color:var(--primary); line-height:1; }
      .add-title { font-family:var(--font-heading); font-size:19px; font-weight:700; color:var(--ink); }
      .add-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .add-sub { font-size:13px; color:var(--muted-2); max-width:240px; line-height:1.5; }

      .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:26px; margin-bottom:22px; box-shadow:var(--shadow); }
      .table-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
      .section-kicker { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:4px; }
      .table-title { font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--ink); }
      .table-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .section-sub { font-size:13px; color:var(--muted-2); margin-top:4px; max-width:520px; }

      .data-table { width:100%; border-collapse: collapse; font-size:13px; }
      .data-table th { text-align:left; font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted-2); padding:12px 10px; border-bottom:1px solid var(--border); }
      .data-table td { padding:12px 10px; border-bottom:1px solid var(--border); color:var(--ink); vertical-align:top; }
      .data-table tr:hover td { background:var(--surface-alt); }
      .data-table td.center { text-align:center; }
      .dot-ok { color: var(--sage-deep); font-size:16px; font-weight:700; }
      .dot-no { color: var(--muted-2); }
      .dot-read { color: var(--ink-2); font-size:12px; font-weight:500; }

      .btn { font-family:var(--font-body); font-weight:600; border:none; cursor:pointer; border-radius:var(--radius-pill); padding:10px 18px; font-size:13px; letter-spacing:0.02em; transition: all var(--motion-fast); display:inline-flex; align-items:center; gap:8px; }
      .btn-sm { padding:7px 14px; font-size:12px; }
      .btn-primary { background:var(--primary); color:var(--bg); }
      .btn-primary:hover { background:var(--primary-hover); }
      .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--border-strong); }
      .btn-ghost:hover { background:var(--surface); }
      </style>"""


# ============================================================
# 4) BERICHTE
# ============================================================
BERICHTE_CONTENT = """      <!-- Period Selector -->
      <div class="period-bar">
        <div class="period-label">Zeitraum</div>
        <div class="period-controls">
          <button class="filter-tab">Heute</button>
          <button class="filter-tab">7 Tage</button>
          <button class="filter-tab active">April 2026</button>
          <button class="filter-tab">Quartal</button>
          <button class="filter-tab">Jahr</button>
          <button class="filter-tab">Eigener Zeitraum…</button>
        </div>
        <div class="period-export">
          <button class="btn btn-ghost btn-sm">📄 PDF</button>
          <button class="btn btn-ghost btn-sm">📊 CSV</button>
          <button class="btn btn-primary btn-sm">Export starten</button>
        </div>
      </div>

      <!-- Haupt-KPIs -->
      <div class="kpi-row">
        <div class="kpi kpi-primary">
          <div class="kpi-label">Umsatz April</div>
          <div class="kpi-value">8.642 &euro;</div>
          <div class="kpi-trend positive">+18,4% vs. März</div>
          <div class="kpi-bars"><span style="height:40%"></span><span style="height:55%"></span><span style="height:50%"></span><span style="height:62%"></span><span style="height:58%"></span><span style="height:72%"></span><span style="height:68%"></span><span style="height:82%"></span><span style="height:76%"></span><span style="height:88%"></span><span style="height:92%"></span><span style="height:100%"></span></div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Auslastung</div>
          <div class="kpi-value">87%</div>
          <div class="kpi-trend positive">+4 pp</div>
          <div class="progress-wrap"><div class="progress-bar" style="width:87%"></div></div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Neue Kunden</div>
          <div class="kpi-value">14</div>
          <div class="kpi-trend positive">+6 via Mom-Graph</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Stornierungen</div>
          <div class="kpi-value">3</div>
          <div class="kpi-trend">1,8% der Buchungen</div>
        </div>
      </div>

      <!-- Haupt-Chart -->
      <div class="card">
        <div class="table-head">
          <div>
            <div class="section-kicker">Umsatzverlauf</div>
            <div class="table-title">Täglicher <em class="italic">Umsatz</em> &middot; April 2026</div>
            <div class="section-sub">Grünes Feld = über Tagesziel von 280 €. Mom-Graph-Boost in KW 15 &amp; 16 deutlich sichtbar.</div>
          </div>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-dot" style="background:var(--primary)"></span> Umsatz</span>
            <span class="legend-item"><span class="legend-dot" style="background:var(--sage)"></span> Ziel</span>
          </div>
        </div>
        <svg class="chart-svg" viewBox="0 0 720 240" preserveAspectRatio="none">
          <!-- Grid -->
          <line x1="0" y1="60" x2="720" y2="60" stroke="rgba(60,33,36,0.08)" stroke-dasharray="3,3"/>
          <line x1="0" y1="120" x2="720" y2="120" stroke="rgba(60,33,36,0.08)" stroke-dasharray="3,3"/>
          <line x1="0" y1="180" x2="720" y2="180" stroke="rgba(60,33,36,0.08)" stroke-dasharray="3,3"/>
          <!-- Ziel-Linie -->
          <line x1="0" y1="135" x2="720" y2="135" stroke="#93A388" stroke-width="2" stroke-dasharray="6,6" opacity="0.6"/>
          <!-- Fläche -->
          <path d="M0,200 L24,180 L48,170 L72,190 L96,160 L120,150 L144,175 L168,145 L192,130 L216,165 L240,155 L264,140 L288,160 L312,130 L336,115 L360,140 L384,120 L408,100 L432,135 L456,110 L480,85 L504,130 L528,105 L552,80 L576,115 L600,90 L624,70 L648,95 L672,75 L696,55 L720,70 L720,240 L0,240 Z" fill="url(#areaGrad)" opacity="0.5"/>
          <!-- Linie -->
          <path d="M0,200 L24,180 L48,170 L72,190 L96,160 L120,150 L144,175 L168,145 L192,130 L216,165 L240,155 L264,140 L288,160 L312,130 L336,115 L360,140 L384,120 L408,100 L432,135 L456,110 L480,85 L504,130 L528,105 L552,80 L576,115 L600,90 L624,70 L648,95 L672,75 L696,55 L720,70" fill="none" stroke="#CC895E" stroke-width="2.5"/>
          <defs>
            <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#CC895E" stop-opacity="0.4"/>
              <stop offset="1" stop-color="#CC895E" stop-opacity="0"/>
            </linearGradient>
          </defs>
        </svg>
        <div class="chart-axis">
          <span>01</span><span>05</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span>
        </div>
      </div>

      <!-- Zwei-Spalten: Kurs-Performance + Mom-Graph-Funnel -->
      <div class="report-grid">

        <div class="card">
          <div class="table-head">
            <div>
              <div class="section-kicker">Top-Performer</div>
              <div class="table-title">Kurs-<em class="italic">Performance</em></div>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Kurs</th><th style="text-align:right">Umsatz</th><th style="text-align:right">Auslastung</th></tr>
            </thead>
            <tbody>
              <tr><td>Musikgarten Junior</td><td class="right"><strong>2.160 &euro;</strong></td><td class="right">100%</td></tr>
              <tr><td>Krabbel Musik</td><td class="right"><strong>1.920 &euro;</strong></td><td class="right">96%</td></tr>
              <tr><td>Eltern-Kind Tanzen</td><td class="right"><strong>1.650 &euro;</strong></td><td class="right">92%</td></tr>
              <tr><td>Kinder Zumba</td><td class="right"><strong>1.408 &euro;</strong></td><td class="right">78%</td></tr>
              <tr><td>Yoga Mini</td><td class="right"><strong>896 &euro;</strong></td><td class="right">72%</td></tr>
              <tr><td>Entspannung Teens</td><td class="right"><strong>608 &euro;</strong></td><td class="right">68%</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="table-head">
            <div>
              <div class="section-kicker">Mom-Graph</div>
              <div class="table-title">Empfehlungs-<em class="italic">Funnel</em></div>
            </div>
          </div>
          <div class="funnel">
            <div class="funnel-step">
              <div class="funnel-bar" style="width:100%"><span class="funnel-count">42</span></div>
              <div class="funnel-label">Einladungen verschickt</div>
            </div>
            <div class="funnel-step">
              <div class="funnel-bar" style="width:72%"><span class="funnel-count">30</span></div>
              <div class="funnel-label">Landing geöffnet &middot; 72%</div>
            </div>
            <div class="funnel-step">
              <div class="funnel-bar" style="width:48%"><span class="funnel-count">20</span></div>
              <div class="funnel-label">Schnupper gebucht &middot; 48%</div>
            </div>
            <div class="funnel-step">
              <div class="funnel-bar" style="width:33%"><span class="funnel-count">14</span></div>
              <div class="funnel-label">Konvertiert &middot; 33%</div>
            </div>
            <div class="funnel-step">
              <div class="funnel-bar success" style="width:26%"><span class="funnel-count">11</span></div>
              <div class="funnel-label">Credits ausgezahlt &middot; 26%</div>
            </div>
          </div>
        </div>

      </div>

      <!-- Bottom: Zahlungsmethoden + Stornogründe -->
      <div class="report-grid">
        <div class="card">
          <div class="table-head">
            <div>
              <div class="section-kicker">Zahlung</div>
              <div class="table-title">Zahlungs<em class="italic">-Methoden</em></div>
            </div>
          </div>
          <div class="donut-grid">
            <div class="donut-row"><span class="donut-dot" style="background:#CC895E"></span><span>Rechnung</span><span class="right-val"><strong>42%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#B4523A"></span><span>SEPA-Lastschrift</span><span class="right-val"><strong>28%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#93A388"></span><span>PayPal</span><span class="right-val"><strong>18%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#C49980"></span><span>Kreditkarte</span><span class="right-val"><strong>8%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#3C2124"></span><span>Bar vor Ort</span><span class="right-val"><strong>4%</strong></span></div>
          </div>
        </div>

        <div class="card">
          <div class="table-head">
            <div>
              <div class="section-kicker">Retention</div>
              <div class="table-title">Storno-<em class="italic">Gründe</em></div>
            </div>
          </div>
          <div class="donut-grid">
            <div class="donut-row"><span class="donut-dot" style="background:#CC895E"></span><span>Kind krank / gesundheitlich</span><span class="right-val"><strong>45%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#B4523A"></span><span>Zeitlich nicht mehr passend</span><span class="right-val"><strong>28%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#93A388"></span><span>Umzug / Entfernung</span><span class="right-val"><strong>12%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#C49980"></span><span>Anderer Anbieter</span><span class="right-val"><strong>9%</strong></span></div>
            <div class="donut-row"><span class="donut-dot" style="background:#3C2124"></span><span>Kein Grund angegeben</span><span class="right-val"><strong>6%</strong></span></div>
          </div>
        </div>
      </div>

      <style>
      .period-bar { display:flex; gap:16px; align-items:center; flex-wrap:wrap; background:var(--surface); border:1px solid var(--border); padding:14px 18px; border-radius:var(--radius-lg); margin-bottom:24px; box-shadow:var(--shadow); }
      .period-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); }
      .period-controls { display:flex; gap:4px; flex-wrap:wrap; flex:1; }
      .period-export { display:flex; gap:6px; }

      .filter-tab { background:transparent; border:1px solid var(--border); padding:6px 12px; border-radius:var(--radius-pill); font-size:12px; font-weight:500; color:var(--ink-2); cursor:pointer; transition: all var(--motion-fast); }
      .filter-tab:hover { background:var(--surface-alt); }
      .filter-tab.active { background:var(--ink); color:var(--bg); border-color:var(--ink); }

      .kpi-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:16px; margin-bottom:28px; }
      .kpi { background: var(--surface); border:1px solid var(--border); padding:22px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
      .kpi-primary { border-color: var(--primary); }
      .kpi-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:10px; }
      .kpi-value { font-family:var(--font-heading); font-size:38px; font-weight:700; color:var(--ink); line-height:1; font-variant-numeric: tabular-nums; }
      .kpi-trend { font-size:12px; color:var(--muted-2); margin-top:10px; }
      .kpi-trend.positive { color: var(--sage-deep); }
      .kpi-bars { display:flex; align-items:flex-end; gap:3px; height:40px; margin-top:14px; }
      .kpi-bars span { flex:1; background: linear-gradient(180deg, var(--primary-soft), var(--primary)); border-radius:2px; min-height:8%; }

      .progress-wrap { height:6px; background:var(--surface-alt); border-radius:var(--radius-pill); overflow:hidden; margin-top:14px; }
      .progress-bar { height:100%; background: linear-gradient(90deg, var(--primary-soft), var(--primary)); border-radius:var(--radius-pill); }

      .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:26px; margin-bottom:22px; box-shadow:var(--shadow); }
      .table-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
      .section-kicker { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:4px; }
      .table-title { font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--ink); }
      .table-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .section-sub { font-size:13px; color:var(--muted-2); margin-top:4px; max-width:560px; }

      .chart-legend { display:flex; gap:18px; font-size:12px; color:var(--muted-2); }
      .legend-item { display:flex; align-items:center; gap:6px; }
      .legend-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
      .chart-svg { width:100%; height:240px; display:block; }
      .chart-axis { display:flex; justify-content:space-between; font-size:11px; color:var(--muted-2); padding:0 6px; margin-top:6px; }

      .report-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:18px; }

      .data-table { width:100%; border-collapse: collapse; font-size:13px; }
      .data-table th { text-align:left; font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted-2); padding:10px 8px; border-bottom:1px solid var(--border); }
      .data-table td { padding:10px 8px; border-bottom:1px solid var(--border); color:var(--ink); }
      .data-table td.right { text-align:right; font-variant-numeric: tabular-nums; }

      .funnel { display:flex; flex-direction:column; gap:10px; }
      .funnel-step { display:flex; flex-direction:column; gap:4px; }
      .funnel-bar { background: linear-gradient(90deg, var(--primary-soft), var(--primary)); padding:8px 14px; border-radius: var(--radius-sm); color:var(--bg); font-weight:600; font-size:14px; min-width:64px; }
      .funnel-bar.success { background: linear-gradient(90deg, var(--sage), var(--sage-deep)); }
      .funnel-count { font-family:var(--font-heading); font-weight:700; font-size:16px; letter-spacing:0.02em; }
      .funnel-label { font-size:12px; color:var(--muted-2); padding-left:2px; }

      .donut-grid { display:flex; flex-direction:column; gap:10px; }
      .donut-row { display:grid; grid-template-columns: 16px 1fr auto; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); font-size:13px; color:var(--ink); }
      .donut-row:last-child { border-bottom:none; }
      .donut-dot { width:12px; height:12px; border-radius:50%; display:inline-block; }
      .right-val { font-variant-numeric: tabular-nums; }

      .btn { font-family:var(--font-body); font-weight:600; border:none; cursor:pointer; border-radius:var(--radius-pill); padding:10px 18px; font-size:13px; letter-spacing:0.02em; transition: all var(--motion-fast); display:inline-flex; align-items:center; gap:8px; }
      .btn-sm { padding:7px 14px; font-size:12px; }
      .btn-primary { background:var(--primary); color:var(--bg); }
      .btn-primary:hover { background:var(--primary-hover); }
      .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--border-strong); }
      .btn-ghost:hover { background:var(--surface); }
      </style>"""


# ============================================================
# 5) FERIEN & SAISONS
# ============================================================
FERIEN_CONTENT = """      <!-- Hero-Status -->
      <div class="hero-card">
        <div class="hero-left">
          <div class="section-kicker">Aktueller Status</div>
          <h2 class="hero-title">Nächste Schließung: <em class="italic">Himmelfahrt</em></h2>
          <p class="hero-sub">Donnerstag, 14. Mai 2026 &middot; automatisch im Kalender blockiert. Betroffene Buchungen: 8 (Eltern bereits informiert).</p>
          <div class="hero-chips">
            <span class="hero-chip hero-chip-ok">✓ Eltern informiert</span>
            <span class="hero-chip hero-chip-ok">✓ Credits verschoben</span>
            <span class="hero-chip">14 Tage bis Schließung</span>
          </div>
        </div>
        <div class="hero-right">
          <div class="hero-count">8</div>
          <div class="hero-count-label">Betroffene Stunden</div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Feiertage 2026</div>
          <div class="kpi-value">12</div>
          <div class="kpi-trend">Berlin &middot; automatisch</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Eigene Pausen</div>
          <div class="kpi-value">3</div>
          <div class="kpi-trend">Winter, Sommer, Betriebsferien</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Saison-Kurse</div>
          <div class="kpi-value">2</div>
          <div class="kpi-trend">Sommer-Camp, Winter-Yoga</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Next Check-in</div>
          <div class="kpi-value">14 T</div>
          <div class="kpi-trend">Himmelfahrt (14.05.)</div>
        </div>
      </div>

      <!-- Feiertage 2026 -->
      <div class="card">
        <div class="table-head">
          <div>
            <div class="section-kicker">Automatisch</div>
            <div class="table-title">Feiertage <em class="italic">Berlin 2026</em></div>
            <div class="section-sub">Gesetzliche Feiertage werden automatisch im Kalender blockiert. Bundesland änderbar in Einstellungen.</div>
          </div>
          <button class="btn btn-ghost btn-sm">Bundesland wechseln</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Feiertag</th>
              <th>Datum</th>
              <th>Wochentag</th>
              <th>Betroffene Kurse</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Neujahr</td><td>01.01.</td><td>Donnerstag</td><td><span class="cell-sub">vergangen</span></td><td><span class="status-pill status-archived">—</span></td></tr>
            <tr><td>Karfreitag</td><td>03.04.</td><td>Freitag</td><td><span class="cell-sub">vergangen</span></td><td><span class="status-pill status-archived">—</span></td></tr>
            <tr><td>Ostermontag</td><td>06.04.</td><td>Montag</td><td><span class="cell-sub">vergangen</span></td><td><span class="status-pill status-archived">—</span></td></tr>
            <tr><td>Tag der Arbeit</td><td>01.05.</td><td>Freitag</td><td>3 Kurse</td><td><span class="status-pill status-planned">Geplant</span></td></tr>
            <tr class="row-highlight"><td><strong>Christi Himmelfahrt</strong></td><td><strong>14.05.</strong></td><td>Donnerstag</td><td>4 Kurse</td><td><span class="status-pill status-active">Aktiv</span></td></tr>
            <tr><td>Pfingstmontag</td><td>25.05.</td><td>Montag</td><td>3 Kurse</td><td><span class="status-pill status-planned">Geplant</span></td></tr>
            <tr><td>Tag der Dt. Einheit</td><td>03.10.</td><td>Samstag</td><td><span class="cell-sub">Wochenende</span></td><td><span class="status-pill status-muted">Ohne Wirkung</span></td></tr>
            <tr><td>1. Weihnachtstag</td><td>25.12.</td><td>Freitag</td><td>3 Kurse</td><td><span class="status-pill status-planned">Geplant</span></td></tr>
            <tr><td>2. Weihnachtstag</td><td>26.12.</td><td>Samstag</td><td><span class="cell-sub">Wochenende</span></td><td><span class="status-pill status-muted">Ohne Wirkung</span></td></tr>
          </tbody>
        </table>
      </div>

      <!-- Eigene Betriebsferien -->
      <div class="card">
        <div class="table-head">
          <div>
            <div class="section-kicker">Manuell geplant</div>
            <div class="table-title">Deine <em class="italic">Betriebsferien</em></div>
            <div class="section-sub">Eigene Schließzeiten planen, betroffene Kursstunden werden automatisch verschoben.</div>
          </div>
          <button class="btn btn-primary btn-sm">+ Neue Pause</button>
        </div>

        <div class="break-list">
          <div class="break-item">
            <div class="break-icon">🌞</div>
            <div class="break-body">
              <div class="break-title">Sommer<em class="italic">pause</em></div>
              <div class="break-range">20. Jul &ndash; 16. Aug 2026 &middot; 28 Tage</div>
              <div class="break-meta">
                <span class="cell-sub">12 Kursstunden betroffen</span> &middot;
                <span class="cell-sub">42 Credits werden verschoben</span> &middot;
                <span class="cell-sub">Eltern bereits informiert</span>
              </div>
            </div>
            <div class="break-actions">
              <span class="status-pill status-active">Aktiv</span>
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
            </div>
          </div>

          <div class="break-item">
            <div class="break-icon">❄️</div>
            <div class="break-body">
              <div class="break-title">Winter<em class="italic">pause</em></div>
              <div class="break-range">24. Dez 2026 &ndash; 04. Jan 2027 &middot; 12 Tage</div>
              <div class="break-meta">
                <span class="cell-sub">8 Kursstunden betroffen</span> &middot;
                <span class="cell-sub">Credits-Verschiebung ausstehend</span>
              </div>
            </div>
            <div class="break-actions">
              <span class="status-pill status-planned">Geplant</span>
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
            </div>
          </div>

          <div class="break-item">
            <div class="break-icon">🛠️</div>
            <div class="break-body">
              <div class="break-title">Renovierung <em class="italic">Raum 2</em></div>
              <div class="break-range">08. Sep &ndash; 12. Sep 2026 &middot; 5 Tage</div>
              <div class="break-meta">
                <span class="cell-sub">Nur Raum 2 betroffen</span> &middot;
                <span class="cell-sub">Ersatzräume geplant</span>
              </div>
            </div>
            <div class="break-actions">
              <span class="status-pill status-planned">Geplant</span>
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Saison-Kurse -->
      <div class="card">
        <div class="table-head">
          <div>
            <div class="section-kicker">Saisonal &middot; Pop-Up</div>
            <div class="table-title">Saison-<em class="italic">Kurse</em></div>
            <div class="section-sub">Kurzzeitige Angebote für spezielle Zeiträume &middot; z.B. Sommercamps, Winter-Specials, Oster-Workshops.</div>
          </div>
          <button class="btn btn-primary btn-sm">+ Saison-Kurs planen</button>
        </div>
        <div class="season-grid">
          <article class="season-card">
            <div class="season-badge">Sommer 2026</div>
            <h3 class="season-title">Sommer<em class="italic">-Camp</em> Musik &amp; Bewegung</h3>
            <div class="season-range">03. &ndash; 07. Aug 2026 &middot; 5 Tage</div>
            <div class="season-meta">
              <div class="team-meta-row"><span class="meta-label">Zielgruppe</span><span class="meta-val">3 &ndash; 6 Jahre</span></div>
              <div class="team-meta-row"><span class="meta-label">Plätze</span><span class="meta-val">8 &middot; 12</span></div>
              <div class="team-meta-row"><span class="meta-label">Preis</span><span class="meta-val">149,- &euro;</span></div>
              <div class="team-meta-row"><span class="meta-label">Trainer</span><span class="meta-val">Leo &amp; Miriam</span></div>
            </div>
            <div class="team-foot">
              <span class="status-pill status-planned">Anmeldung offen</span>
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
            </div>
          </article>

          <article class="season-card">
            <div class="season-badge">Winter 2026/27</div>
            <h3 class="season-title">Winter <em class="italic">Yoga-Wochen</em></h3>
            <div class="season-range">12. Jan &ndash; 20. Feb 2027 &middot; 6 Wochen</div>
            <div class="season-meta">
              <div class="team-meta-row"><span class="meta-label">Zielgruppe</span><span class="meta-val">5 &ndash; 10 Jahre</span></div>
              <div class="team-meta-row"><span class="meta-label">Plätze</span><span class="meta-val">0 &middot; 10</span></div>
              <div class="team-meta-row"><span class="meta-label">Preis</span><span class="meta-val">99,- &euro;</span></div>
              <div class="team-meta-row"><span class="meta-label">Trainer</span><span class="meta-val">Pia</span></div>
            </div>
            <div class="team-foot">
              <span class="status-pill status-muted">Entwurf</span>
              <button class="btn btn-ghost btn-sm">Bearbeiten</button>
            </div>
          </article>
        </div>
      </div>

      <style>
      .hero-card { display:grid; grid-template-columns: 1fr auto; gap:24px; background: linear-gradient(135deg, var(--primary-tint), var(--surface)); border:1px solid var(--border); border-radius:var(--radius-lg); padding:32px; margin-bottom:28px; box-shadow:var(--shadow); align-items:center; }
      .hero-left { max-width:680px; }
      .hero-title { font-family:var(--font-heading); font-size:34px; font-weight:700; color:var(--ink); line-height:1.1; margin-top:4px; }
      .hero-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .hero-sub { font-size:14px; color:var(--ink-2); margin-top:10px; max-width:640px; line-height:1.6; }
      .hero-chips { display:flex; gap:8px; margin-top:18px; flex-wrap:wrap; }
      .hero-chip { background:var(--surface); color:var(--ink-2); font-size:12px; font-weight:500; padding:5px 11px; border-radius:var(--radius-pill); border:1px solid var(--border); }
      .hero-chip-ok { background: rgba(98,122,90,0.12); color: var(--sage-deep); border-color: rgba(98,122,90,0.3); }
      .hero-right { text-align:center; padding:16px 24px; background:var(--surface); border:1px solid var(--border); border-radius: var(--radius-lg); }
      .hero-count { font-family:var(--font-heading); font-size:58px; font-weight:700; color:var(--primary); line-height:1; font-variant-numeric: tabular-nums; }
      .hero-count-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-top:8px; }

      .kpi-row { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:16px; margin-bottom:28px; }
      .kpi { background: var(--surface); border:1px solid var(--border); padding:22px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
      .kpi-label { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:10px; }
      .kpi-value { font-family:var(--font-heading); font-size:38px; font-weight:700; color:var(--ink); line-height:1; font-variant-numeric: tabular-nums; }
      .kpi-trend { font-size:12px; color:var(--muted-2); margin-top:10px; }
      .kpi-trend.positive { color: var(--sage-deep); }

      .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:26px; margin-bottom:22px; box-shadow:var(--shadow); }
      .table-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
      .section-kicker { font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted-2); margin-bottom:4px; }
      .table-title { font-family:var(--font-heading); font-size:22px; font-weight:700; color:var(--ink); }
      .table-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .section-sub { font-size:13px; color:var(--muted-2); margin-top:4px; max-width:640px; }

      .data-table { width:100%; border-collapse: collapse; font-size:13px; }
      .data-table th { text-align:left; font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted-2); padding:12px 10px; border-bottom:1px solid var(--border); }
      .data-table td { padding:14px 10px; border-bottom:1px solid var(--border); color:var(--ink); }
      .data-table tr:hover td { background:var(--surface-alt); }
      .data-table tr.row-highlight td { background: var(--primary-tint); }
      .cell-sub { color:var(--muted-2); font-size:12px; }
      .status-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:var(--radius-pill); font-family:var(--font-heading); letter-spacing:0.08em; text-transform:uppercase; display:inline-block; }
      .status-active { background:#E4EBDE; color:#3E5030; }
      .status-planned { background:#F5DCC5; color:#874920; }
      .status-archived { background:rgba(60,33,36,0.08); color:var(--ink-2); }
      .status-muted { background:rgba(60,33,36,0.06); color:var(--muted-2); }

      .break-list { display:flex; flex-direction:column; gap:12px; }
      .break-item { display:grid; grid-template-columns: 56px 1fr auto; gap:18px; align-items:center; padding:20px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-md); }
      .break-icon { font-size:32px; text-align:center; }
      .break-title { font-family:var(--font-heading); font-size:18px; font-weight:700; color:var(--ink); margin-bottom:4px; }
      .break-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .break-range { font-size:13px; color:var(--ink); font-weight:500; }
      .break-meta { font-size:12px; color:var(--muted-2); margin-top:4px; }
      .break-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }

      .season-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap:18px; }
      .season-card { background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-lg); padding:22px; display:flex; flex-direction:column; gap:12px; }
      .season-badge { background:var(--primary-tint); color:var(--ink); font-family:var(--font-heading); font-weight:700; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; padding:4px 10px; border-radius:var(--radius-pill); align-self:flex-start; }
      .season-title { font-family:var(--font-heading); font-size:20px; font-weight:700; color:var(--ink); line-height:1.2; }
      .season-title em.italic { font-family:var(--font-accent); font-style:italic; font-weight:400; color:var(--primary); }
      .season-range { font-size:13px; color:var(--ink); font-weight:500; }
      .season-meta { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
      .team-meta-row { display:flex; justify-content:space-between; font-size:13px; }
      .meta-label { color:var(--muted-2); }
      .meta-val { color:var(--ink); font-weight:500; }
      .team-foot { display:flex; justify-content:space-between; align-items:center; margin-top:4px; }

      .btn { font-family:var(--font-body); font-weight:600; border:none; cursor:pointer; border-radius:var(--radius-pill); padding:10px 18px; font-size:13px; letter-spacing:0.02em; transition: all var(--motion-fast); display:inline-flex; align-items:center; gap:8px; }
      .btn-sm { padding:7px 14px; font-size:12px; }
      .btn-primary { background:var(--primary); color:var(--bg); }
      .btn-primary:hover { background:var(--primary-hover); }
      .btn-ghost { background:transparent; color:var(--ink); border:1px solid var(--border-strong); }
      .btn-ghost:hover { background:var(--surface); }
      </style>"""


# ============================================================
# Pages Config
# ============================================================
PAGES = [
    {
        "file": "kursbloecke-preview.html",
        "title": "Kursblöcke · Urban Kids Club",
        "search": "Kursblock finden…",
        "active_nav": "Kursblöcke",
        "kicker": "Kursserien · Blöcke · Kurzstrecken",
        "h1": 'Deine <em class="italic">Kursblöcke</em>',
        "sub": "Mehrwöchige Kursserien mit fixen Teilnehmer:innen &middot; Block-Buchung, Fortschritt, Abschluss.",
        "btn": '<button class="btn btn-primary">+ Neuer Kursblock</button>',
        "content": KURSBLOECKE_CONTENT,
    },
    {
        "file": "probestunden-preview.html",
        "title": "Probestunden · Urban Kids Club",
        "search": "Probestunde finden…",
        "active_nav": "Probestunden",
        "kicker": "Schnupper · Conversion · Follow-up",
        "h1": 'Offene <em class="italic">Probestunden</em>',
        "sub": "Warteschlange, Bestätigungen, Follow-up-Gespräche &middot; aus Schnuppern werden Buchungen.",
        "btn": '<button class="btn btn-primary">+ Probestunde planen</button>',
        "content": PROBESTUNDEN_CONTENT,
    },
    {
        "file": "team-preview.html",
        "title": "Team · Urban Kids Club",
        "search": "Teammitglied finden…",
        "active_nav": "Team",
        "kicker": "Personen · Rollen · Zugriffe",
        "h1": 'Dein <em class="italic">Team</em>',
        "sub": "Trainer:innen, Admins, Aushilfen &middot; Rollen-System mit feinkörnigen Berechtigungen.",
        "btn": '<button class="btn btn-primary">+ Person einladen</button>',
        "content": TEAM_CONTENT,
    },
    {
        "file": "berichte-preview.html",
        "title": "Berichte · Urban Kids Club",
        "search": "Bericht finden…",
        "active_nav": "Berichte",
        "kicker": "Umsatz · Auslastung · Retention",
        "h1": 'Deine <em class="italic">Berichte</em>',
        "sub": "Monatliche Übersichten, Kurs-Performance, Mom-Graph-Funnel &middot; Export als PDF oder CSV.",
        "btn": '<button class="btn btn-primary">Export starten</button>',
        "content": BERICHTE_CONTENT,
    },
    {
        "file": "ferien-preview.html",
        "title": "Ferien & Saisons · Urban Kids Club",
        "search": "Feiertag oder Pause finden…",
        "active_nav": "Ferien",
        "kicker": "Feiertage · Pausen · Saisons",
        "h1": 'Ferien &amp; <em class="italic">Saisons</em>',
        "sub": "Automatische Feiertage, eigene Betriebsferien, kurzfristige Saison-Kurse &middot; alles an einem Ort.",
        "btn": '<button class="btn btn-primary">+ Neue Pause</button>',
        "content": FERIEN_CONTENT,
    },
]


# ============================================================
# Generate
# ============================================================
for page in PAGES:
    html = build_page(
        title=page["title"],
        search_placeholder=page["search"],
        active_nav_text=page["active_nav"],
        page_kicker=page["kicker"],
        page_h1_html=page["h1"],
        page_sub=page["sub"],
        primary_btn=page["btn"],
        content_html=page["content"],
    )
    out = WIDGETS / page["file"]
    out.write_text(html, encoding="utf-8")
    print(f"✓ {page['file']}  ({len(html)//1024} KB)")

print("\nDone.")
