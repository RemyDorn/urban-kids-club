#!/usr/bin/env python3
"""
Eltern-Portal um Buchungs-Flow erweitern:
  - Neuer Tab "Entdecken" zwischen Meine Kurse + Postfach
  - Kurs-Liste mit Filter (Alter, Kategorie, Tag)
  - Kurs-Detail-Modal mit 3 Aktionen (Probestunde / Block / Credit)
  - Booking-Modal mit Bestätigung + Toast
  - Wires existing "Add-Up-Termin buchen" + "Discover CTA"
"""
from pathlib import Path

P = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/portal-preview.html")
src = P.read_text(encoding="utf-8")

if 'data-tab="discover"' in src:
    print("- discover tab already present")
    raise SystemExit(0)

# ============================================================
# 1. Tab nav: insert "Entdecken" tab between my-courses and postfach
# ============================================================
old_nav = '''  <nav class="tabs">
    <button class="tab active" data-tab="my-courses" onclick="switchTab('my-courses')">Meine Kurse<span class="tab-count">2</span></button>
    <button class="tab" data-tab="postfach" onclick="switchTab('postfach')">Postfach<span class="tab-count" id="tab-postfach-count">2</span></button>
    <button class="tab" data-tab="bookings" onclick="switchTab('bookings')">Buchungen<span class="tab-count">12</span></button>
    <button class="tab" data-tab="credits" onclick="switchTab('credits')">Guthaben<span class="tab-count">3</span></button>
    <button class="tab" data-tab="empfehlungen" onclick="switchTab('empfehlungen')">Empfehlungen<span class="tab-count" id="tab-ref-count">0</span></button>
  </nav>'''

new_nav = '''  <nav class="tabs">
    <button class="tab active" data-tab="my-courses" onclick="switchTab('my-courses')">Meine Kurse<span class="tab-count">2</span></button>
    <button class="tab" data-tab="discover" onclick="switchTab('discover')">Entdecken<span class="tab-count">12</span></button>
    <button class="tab" data-tab="postfach" onclick="switchTab('postfach')">Postfach<span class="tab-count" id="tab-postfach-count">2</span></button>
    <button class="tab" data-tab="bookings" onclick="switchTab('bookings')">Buchungen<span class="tab-count">12</span></button>
    <button class="tab" data-tab="credits" onclick="switchTab('credits')">Guthaben<span class="tab-count">3</span></button>
    <button class="tab" data-tab="empfehlungen" onclick="switchTab('empfehlungen')">Empfehlungen<span class="tab-count" id="tab-ref-count">0</span></button>
  </nav>'''

if old_nav not in src:
    raise SystemExit("tab nav anchor not found exactly")
src = src.replace(old_nav, new_nav, 1)

# ============================================================
# 2. Insert Discover panel BEFORE postfach panel
# ============================================================
postfach_anchor = '  <!-- TAB: POSTFACH -->'
if postfach_anchor not in src:
    raise SystemExit("postfach panel anchor not found")

DISCOVER_PANEL = '''  <!-- TAB: ENTDECKEN -->
  <section class="tab-panel" id="panel-discover" style="display:none">

    <div class="discover-hero">
      <div class="discover-hero-icon">
        <img src="/portal/socialy/brand/logo.svg" width="56" height="56" alt="" onerror="this.style.display='none'">
      </div>
      <div class="discover-hero-text">
        <div class="discover-hero-kicker">Socialy · Berlin Prenzlauer Berg</div>
        <h2 class="discover-hero-title">Alle <em>Kurse</em> vom Studio</h2>
        <p class="discover-hero-sub">12 Kurse für Kinder von 0–6 Jahren. Schnupper-Termine sind kostenlos und unverbindlich. Block-Buchungen mit 8 oder 10 Terminen — du sparst pro Block ca. 15%.</p>
      </div>
    </div>

    <div class="dc-filterbar">
      <div class="dc-filter-group">
        <span class="dc-filter-label">Alter</span>
        <button class="dc-filter active" data-filter="age" data-value="all">Alle</button>
        <button class="dc-filter" data-filter="age" data-value="0-1">0–1 J</button>
        <button class="dc-filter" data-filter="age" data-value="1-3">1–3 J</button>
        <button class="dc-filter" data-filter="age" data-value="3-6">3–6 J</button>
      </div>
      <div class="dc-filter-group">
        <span class="dc-filter-label">Kategorie</span>
        <button class="dc-filter active" data-filter="cat" data-value="all">Alle</button>
        <button class="dc-filter" data-filter="cat" data-value="bewegung">Bewegung</button>
        <button class="dc-filter" data-filter="cat" data-value="musik">Musik</button>
        <button class="dc-filter" data-filter="cat" data-value="kreativ">Kreativ</button>
        <button class="dc-filter" data-filter="cat" data-value="eltern-kind">Eltern-Kind</button>
      </div>
    </div>

    <div class="dc-list" id="dc-list">

      <article class="dc-card" data-age="0-1" data-cat="bewegung" data-id="pekip-basis"
               data-title="PEKiP Basis" data-trainer="Sophie" data-day="Montag" data-time="09:30"
               data-duration="60 Min" data-block-price="80€" data-trial-available="true"
               data-credit-available="true" data-spots="6/10">
        <div class="dc-card-head">
          <span class="dc-card-cat">Bewegung · Eltern-Kind</span>
          <span class="dc-card-spots ok">noch 4 Plätze</span>
        </div>
        <h3 class="dc-card-title">PEKiP <em>Basis</em></h3>
        <div class="dc-card-meta">Mo · 09:30 · 60 Min · für 0–6 Mo</div>
        <p class="dc-card-desc">Sanfte Bewegungsanregungen für Babys, Austausch für Eltern. Klassischer Einsteiger-Kurs.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>80€</strong> <em>10er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="1-3" data-cat="bewegung" data-id="ek-turnen"
               data-title="Eltern-Kind-Turnen" data-trainer="Sophie" data-day="Dienstag" data-time="10:00"
               data-duration="45 Min" data-block-price="96€" data-trial-available="false"
               data-credit-available="true" data-spots="9/10">
        <div class="dc-card-head">
          <span class="dc-card-cat">Bewegung · Eltern-Kind</span>
          <span class="dc-card-spots warn">noch 1 Platz</span>
        </div>
        <h3 class="dc-card-title">Eltern-Kind-<em>Turnen</em></h3>
        <div class="dc-card-meta">Di · 10:00 · 45 Min · für 1–3 J</div>
        <p class="dc-card-desc">Bewegungsbaustelle, Rollbrett, Reifen, Bälle — Spaß für 1–3 Jahre, Eltern dabei.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>96€</strong> <em>10er-Block</em></span>
            <span class="dc-price-trial muted">keine Probestunde</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="1-3" data-cat="musik" data-id="musikgarten"
               data-title="Musikgarten" data-trainer="Lena" data-day="Donnerstag" data-time="15:30"
               data-duration="45 Min" data-block-price="88€" data-trial-available="true"
               data-credit-available="true" data-spots="3/8">
        <div class="dc-card-head">
          <span class="dc-card-cat">Musik · Früherziehung</span>
          <span class="dc-card-spots ok">noch 5 Plätze</span>
        </div>
        <h3 class="dc-card-title">Musik-<em>garten</em></h3>
        <div class="dc-card-meta">Do · 15:30 · 45 Min · für 1–3 J</div>
        <p class="dc-card-desc">Lieder, Klanggesten, kleine Instrumente — musikalische Früherziehung mit Konzept.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>88€</strong> <em>8er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="3-6" data-cat="kreativ" data-id="kreativ-werkstatt"
               data-title="Kreativ-Werkstatt" data-trainer="Mira" data-day="Mittwoch" data-time="16:00"
               data-duration="60 Min" data-block-price="104€" data-trial-available="true"
               data-credit-available="false" data-spots="4/8">
        <div class="dc-card-head">
          <span class="dc-card-cat">Kreativ · ohne Eltern</span>
          <span class="dc-card-spots ok">noch 4 Plätze</span>
        </div>
        <h3 class="dc-card-title">Kreativ-<em>Werkstatt</em></h3>
        <div class="dc-card-meta">Mi · 16:00 · 60 Min · für 3–6 J</div>
        <p class="dc-card-desc">Malen, Kleben, Bauen — Kinder ohne Eltern, freies Werken mit Anleitung.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>104€</strong> <em>8er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="3-6" data-cat="bewegung" data-id="kindertanz"
               data-title="Kindertanz 4-6" data-trainer="Mira" data-day="Mittwoch" data-time="16:30"
               data-duration="45 Min" data-block-price="88€" data-trial-available="true"
               data-credit-available="true" data-spots="3/8">
        <div class="dc-card-head">
          <span class="dc-card-cat">Bewegung · ohne Eltern</span>
          <span class="dc-card-spots ok">noch 5 Plätze</span>
        </div>
        <h3 class="dc-card-title">Kinder-<em>tanz</em> 4–6</h3>
        <div class="dc-card-meta">Mi · 16:30 · 45 Min · für 4–6 J</div>
        <p class="dc-card-desc">Choreografie für die Großen — kreatives Tanzen mit Showpotenzial.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>88€</strong> <em>8er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="0-1" data-cat="musik" data-id="babymassage"
               data-title="Babymassage" data-trainer="Sophie" data-day="Freitag" data-time="10:00"
               data-duration="50 Min" data-block-price="65€" data-trial-available="true"
               data-credit-available="false" data-spots="2/6">
        <div class="dc-card-head">
          <span class="dc-card-cat">Eltern-Kind · Bonding</span>
          <span class="dc-card-spots ok">noch 4 Plätze</span>
        </div>
        <h3 class="dc-card-title">Baby-<em>massage</em></h3>
        <div class="dc-card-meta">Fr · 10:00 · 50 Min · für 0–6 Mo</div>
        <p class="dc-card-desc">Indische Babymassage in 5 Einheiten — Bonding, Schlaf-Unterstützung, Bauch-Beruhigung.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>65€</strong> <em>5er-Kurs</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="1-3" data-cat="eltern-kind" data-id="zwergensport"
               data-title="Zwergensport" data-trainer="Lena" data-day="Samstag" data-time="09:30"
               data-duration="60 Min" data-block-price="96€" data-trial-available="true"
               data-credit-available="true" data-spots="5/10">
        <div class="dc-card-head">
          <span class="dc-card-cat">Bewegung · Eltern-Kind</span>
          <span class="dc-card-spots ok">noch 5 Plätze</span>
        </div>
        <h3 class="dc-card-title">Zwergen-<em>sport</em></h3>
        <div class="dc-card-meta">Sa · 09:30 · 60 Min · für 2–4 J</div>
        <p class="dc-card-desc">Bewegungsspiele am Wochenende — perfekt für Papas und berufstätige Mamas.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>96€</strong> <em>10er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

      <article class="dc-card" data-age="3-6" data-cat="musik" data-id="liederwerkstatt"
               data-title="Lieder-Werkstatt" data-trainer="Lena" data-day="Donnerstag" data-time="16:30"
               data-duration="45 Min" data-block-price="80€" data-trial-available="true"
               data-credit-available="true" data-spots="6/8">
        <div class="dc-card-head">
          <span class="dc-card-cat">Musik · ohne Eltern</span>
          <span class="dc-card-spots ok">noch 2 Plätze</span>
        </div>
        <h3 class="dc-card-title">Lieder-<em>Werkstatt</em></h3>
        <div class="dc-card-meta">Do · 16:30 · 45 Min · für 4–6 J</div>
        <p class="dc-card-desc">Singen, Klatschen, kleine Instrumente — Vorbereitung auf Musikschule.</p>
        <div class="dc-card-foot">
          <div class="dc-card-prices">
            <span class="dc-price-block"><strong>80€</strong> <em>10er-Block</em></span>
            <span class="dc-price-trial">Probe gratis</span>
          </div>
          <button class="btn btn-primary btn-sm dc-open-detail">Ansehen</button>
        </div>
      </article>

    </div>

    <div class="dc-empty" id="dc-empty" style="display:none">
      <div class="dc-empty-icon">🔍</div>
      <div class="dc-empty-title">Keine Kurse gefunden</div>
      <div class="dc-empty-sub">Lockere die Filter oder schau später noch mal vorbei.</div>
    </div>

  </section>

'''

src = src.replace(postfach_anchor, DISCOVER_PANEL + postfach_anchor, 1)

# ============================================================
# 3. Update Discover-CTA in My-Courses tab to point to internal tab
# ============================================================
old_discover_cta = '''    <!-- Discover CTA -->
    <div class="discover-card">
      <div class="discover-title">Noch mehr <em>entdecken</em>?</div>
      <div class="discover-sub">Weitere Kurse und Termine findest du auf unserer Website.</div>
      <a class="btn btn-primary btn-sm" href="https://socialy.club" target="_blank">Zum Kursangebot →</a>
    </div>'''

new_discover_cta = '''    <!-- Discover CTA -->
    <div class="discover-card">
      <div class="discover-title">Noch mehr <em>entdecken</em>?</div>
      <div class="discover-sub">10 weitere Kurse für deine Kids — Probestunden gratis, Add-Ups via Credit.</div>
      <button class="btn btn-primary btn-sm" onclick="switchTab('discover')">Alle Kurse ansehen →</button>
    </div>'''

if old_discover_cta in src:
    src = src.replace(old_discover_cta, new_discover_cta, 1)

# ============================================================
# 4. Wire "Add-Up-Termin buchen" CTA in Credits tab
# ============================================================
old_credits_cta = '<button class="credits-hero-cta">Add-Up-Termin buchen →</button>'
new_credits_cta = '<button class="credits-hero-cta" onclick="switchTab(\'discover\'); setTimeout(() => filterByAddUp(), 100);">Add-Up-Termin buchen →</button>'
src = src.replace(old_credits_cta, new_credits_cta, 1)

# ============================================================
# 5. CSS for discover tab + course detail modal + booking modal
# ============================================================
EXTRA_CSS = '''

/* ============ Discover Tab ============ */
.discover-hero { display: grid; grid-template-columns: 80px 1fr; gap: 22px; align-items: center; padding: 24px 28px; background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 18px; margin-bottom: 22px; }
.discover-hero-icon { width: 80px; height: 80px; border-radius: 18px; background: var(--bg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(31,29,24,0.06); overflow: hidden; }
.discover-hero-kicker { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-muted); font-weight: 600; margin-bottom: 4px; }
.discover-hero-title { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 22px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 6px; }
.discover-hero-title em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.discover-hero-sub { font-size: 13.5px; color: var(--ink-muted); line-height: 1.55; max-width: 520px; }

.dc-filterbar { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 14px; margin-bottom: 18px; }
.dc-filter-group { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dc-filter-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: var(--ink-muted); margin-right: 6px; min-width: 80px; }
.dc-filter { padding: 7px 14px; border-radius: 999px; background: var(--bg); border: 1px solid rgba(31,29,24,0.12); font-size: 12.5px; font-weight: 500; color: var(--ink-muted); cursor: pointer; transition: all 140ms; font-family: inherit; }
.dc-filter.active { background: var(--ink); color: var(--bg); border-color: var(--ink); font-weight: 600; }
.dc-filter:hover:not(.active) { background: var(--surface-alt); color: var(--ink); }

.dc-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.dc-card { background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 16px; padding: 22px 24px; transition: all 200ms cubic-bezier(.2,.8,.2,1); cursor: pointer; display: flex; flex-direction: column; }
.dc-card:hover { transform: translateY(-3px); border-color: var(--primary); box-shadow: 0 12px 28px rgba(31,29,24,0.10); }
.dc-card.hidden { display: none; }
.dc-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; }
.dc-card-cat { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; color: var(--ink-muted); }
.dc-card-spots { font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; }
.dc-card-spots.ok { background: rgba(168,182,163,0.30); color: var(--accent-deep); }
.dc-card-spots.warn { background: rgba(217,108,69,0.18); color: var(--primary); }
.dc-card-title { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 19px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 4px; }
.dc-card-title em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.dc-card-meta { font-size: 12.5px; color: var(--ink-muted); margin-bottom: 8px; }
.dc-card-desc { font-size: 13px; color: var(--ink); line-height: 1.55; margin-bottom: 16px; flex: 1; }
.dc-card-foot { display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid rgba(31,29,24,0.08); gap: 10px; flex-wrap: wrap; }
.dc-card-prices { display: flex; flex-direction: column; gap: 2px; }
.dc-price-block { font-size: 13.5px; color: var(--ink); }
.dc-price-block strong { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; color: var(--ink); }
.dc-price-block em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--ink-muted); font-size: 11.5px; margin-left: 2px; }
.dc-price-trial { font-size: 11.5px; color: var(--accent-deep); font-weight: 600; }
.dc-price-trial.muted { color: var(--ink-muted); font-weight: 500; }

.dc-empty { text-align: center; padding: 60px 20px; color: var(--ink-muted); }
.dc-empty-icon { font-size: 36px; margin-bottom: 14px; opacity: 0.5; }
.dc-empty-title { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 600; font-size: 16px; color: var(--ink); margin-bottom: 6px; }
.dc-empty-sub { font-size: 13px; }

/* ============ Course Detail Modal (slide-up) ============ */
.cd-modal-backdrop { position: fixed; inset: 0; background: rgba(31,29,24,0.55); display: none; align-items: flex-end; justify-content: center; z-index: 200; backdrop-filter: blur(4px); animation: fade-in 200ms ease; }
.cd-modal-backdrop.open { display: flex; }
.cd-modal { background: var(--bg); width: 100%; max-width: 620px; max-height: 92vh; overflow-y: auto; border-radius: 22px 22px 0 0; padding: 28px 30px 30px; box-shadow: 0 -8px 40px rgba(31,29,24,0.18); animation: slide-up 280ms cubic-bezier(.2,.8,.2,1); }
@media (min-width: 720px) { .cd-modal-backdrop { align-items: center; } .cd-modal { border-radius: 22px; } }
.cd-modal-grip { width: 44px; height: 4px; background: rgba(31,29,24,0.16); border-radius: 999px; margin: 0 auto 18px; }
.cd-modal-cat { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: var(--ink-muted); margin-bottom: 6px; }
.cd-modal h3 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 26px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 8px; }
.cd-modal h3 em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); }
.cd-modal-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--ink-muted); margin-bottom: 18px; }
.cd-modal-meta .meta-item { display: inline-flex; align-items: center; gap: 5px; }
.cd-modal-desc { font-size: 14.5px; color: var(--ink); line-height: 1.65; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid rgba(31,29,24,0.08); }
.cd-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
.cd-stat { padding: 14px 16px; background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 12px; }
.cd-stat-label { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: var(--ink-muted); margin-bottom: 4px; }
.cd-stat-val { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 15.5px; color: var(--ink); letter-spacing: -0.005em; }
.cd-stat-val em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--primary); font-size: 12px; margin-left: 2px; }

.cd-actions { display: flex; flex-direction: column; gap: 10px; }
.cd-action { padding: 16px 20px; border-radius: 14px; border: 1px solid rgba(31,29,24,0.10); background: var(--surface); cursor: pointer; transition: all 160ms; display: grid; grid-template-columns: 44px 1fr auto; gap: 14px; align-items: center; text-align: left; font-family: inherit; }
.cd-action:hover { border-color: var(--primary); transform: translateY(-1px); }
.cd-action[disabled] { opacity: 0.45; cursor: not-allowed; }
.cd-action[disabled]:hover { transform: none; border-color: rgba(31,29,24,0.10); }
.cd-action-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
.cd-action.trial .cd-action-icon { background: rgba(168,182,163,0.30); color: var(--accent-deep); }
.cd-action.block .cd-action-icon { background: rgba(217,108,69,0.16); color: var(--primary); }
.cd-action.credit .cd-action-icon { background: rgba(31,29,24,0.10); color: var(--ink); }
.cd-action-title { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 15px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 2px; }
.cd-action-sub { font-size: 12.5px; color: var(--ink-muted); line-height: 1.45; }
.cd-action-price { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 15px; color: var(--primary); white-space: nowrap; }
.cd-action-price em { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: var(--ink-muted); font-size: 11.5px; margin-left: 2px; }

/* ============ Booking confirm step ============ */
.cd-confirm { display: none; }
.cd-confirm.active { display: block; }
.cd-list-block { display: flex; flex-direction: column; gap: 4px; }
.cd-confirm h4 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; font-size: 17px; color: var(--ink); letter-spacing: -0.005em; margin-bottom: 14px; }
.cd-confirm-summary { background: var(--surface); border: 1px solid rgba(31,29,24,0.08); border-radius: 14px; padding: 16px 18px; margin-bottom: 18px; display: grid; gap: 8px; }
.cd-confirm-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.cd-confirm-row .label { color: var(--ink-muted); }
.cd-confirm-row .value { color: var(--ink); font-weight: 600; text-align: right; }
.cd-confirm-row.total { padding-top: 8px; border-top: 1px solid rgba(31,29,24,0.08); font-size: 15px; }
.cd-confirm-row.total .value { color: var(--primary); font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-weight: 700; }
.cd-form-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.cd-form-row label { font-size: 12px; letter-spacing: 0.04em; color: var(--ink-muted); font-weight: 600; }
.cd-form-row input, .cd-form-row select { padding: 12px 14px; border: 1px solid rgba(31,29,24,0.12); border-radius: 10px; background: var(--bg); font-family: inherit; font-size: 13.5px; color: var(--ink); }
.cd-form-row input:focus, .cd-form-row select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(217,108,69,0.12); }
.cd-form-grid { display: grid; grid-template-columns: 1fr 80px; gap: 10px; }
.cd-payment-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
.cd-payment-pill { padding: 12px 10px; border-radius: 10px; border: 1px solid rgba(31,29,24,0.12); background: var(--surface); font-family: inherit; font-size: 13px; color: var(--ink); cursor: pointer; transition: all 140ms; font-weight: 500; text-align: center; }
.cd-payment-pill.active { border-color: var(--primary); background: rgba(217,108,69,0.10); font-weight: 600; box-shadow: 0 0 0 3px rgba(217,108,69,0.10); }
.cd-consent { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: var(--surface); border-radius: 10px; margin-bottom: 18px; }
.cd-consent input { flex-shrink: 0; margin-top: 2px; }
.cd-consent label { font-size: 12px; color: var(--ink-muted); line-height: 1.5; cursor: pointer; }
.cd-actions-row { display: flex; gap: 10px; }
.cd-actions-row .ghost-btn { flex: 0 0 auto; }
.cd-actions-row .primary-btn { flex: 1; }
'''

style_close_idx = src.rfind("</style>")
src = src[:style_close_idx] + EXTRA_CSS + "\n" + src[style_close_idx:]

# ============================================================
# 6. Course Detail Modal HTML + JS (insert before </body>)
# ============================================================
DISCOVER_MODAL_AND_JS = '''
<!-- COURSE DETAIL MODAL -->
<div class="cd-modal-backdrop" id="cd-modal-backdrop" onclick="if(event.target===this)closeCdModal()">
  <div class="cd-modal" role="dialog" aria-modal="true" aria-labelledby="cd-modal-title">
    <div class="cd-modal-grip"></div>

    <!-- STEP 1: Course detail with action buttons -->
    <div id="cd-step-detail">
      <div class="cd-modal-cat" id="cd-modal-cat"></div>
      <h3 id="cd-modal-title">Kurs</h3>
      <div class="cd-modal-meta" id="cd-modal-meta"></div>
      <p class="cd-modal-desc" id="cd-modal-desc"></p>

      <div class="cd-stat-row">
        <div class="cd-stat">
          <div class="cd-stat-label">Termine</div>
          <div class="cd-stat-val" id="cd-stat-sessions">8 <em>Termine</em></div>
        </div>
        <div class="cd-stat">
          <div class="cd-stat-label">Plätze</div>
          <div class="cd-stat-val" id="cd-stat-spots">noch 4</div>
        </div>
        <div class="cd-stat">
          <div class="cd-stat-label">Trainer:in</div>
          <div class="cd-stat-val" id="cd-stat-trainer">Sophie</div>
        </div>
      </div>

      <div class="cd-actions">
        <button class="cd-action trial" id="cd-action-trial" onclick="goToConfirm('trial')">
          <div class="cd-action-icon">🌱</div>
          <div>
            <div class="cd-action-title">Probestunde anfragen</div>
            <div class="cd-action-sub">1× kostenlos &amp; unverbindlich. Sophie meldet sich mit dem nächsten freien Termin.</div>
          </div>
          <div class="cd-action-price">gratis</div>
        </button>

        <button class="cd-action block" id="cd-action-block" onclick="goToConfirm('block')">
          <div class="cd-action-icon">📅</div>
          <div>
            <div class="cd-action-title">Block buchen</div>
            <div class="cd-action-sub">8–10 Termine als Paket. Sparst pro Block ca. 15% gegenüber Drop-In.</div>
          </div>
          <div class="cd-action-price" id="cd-block-price">96€<em>/Block</em></div>
        </button>

        <button class="cd-action credit" id="cd-action-credit" onclick="goToConfirm('credit')">
          <div class="cd-action-icon">↻</div>
          <div>
            <div class="cd-action-title">Add-Up via Credit</div>
            <div class="cd-action-sub" id="cd-credit-sub">3 Credits verfügbar — 1 Credit = 1 Termin in diesem Kurs.</div>
          </div>
          <div class="cd-action-price">1 Credit</div>
        </button>
      </div>
    </div>

    <!-- STEP 2: Confirm + form -->
    <div class="cd-confirm" id="cd-step-confirm">
      <h4 id="cd-confirm-title">Probestunde anfragen</h4>

      <div class="cd-confirm-summary">
        <div class="cd-confirm-row"><span class="label">Kurs</span><span class="value" id="cd-confirm-course"></span></div>
        <div class="cd-confirm-row"><span class="label">Termin</span><span class="value" id="cd-confirm-when"></span></div>
        <div class="cd-confirm-row" id="cd-confirm-block-line"><span class="label">Umfang</span><span class="value">10 Termine</span></div>
        <div class="cd-confirm-row total" id="cd-confirm-total-row"><span class="label">Gesamt</span><span class="value" id="cd-confirm-total">gratis</span></div>
      </div>

      <div id="cd-trial-form" style="display:none">
        <div class="cd-form-grid">
          <div class="cd-form-row">
            <label for="cd-trial-name">Vorname Kind</label>
            <input id="cd-trial-name" type="text" placeholder="z.B. Mia">
          </div>
          <div class="cd-form-row">
            <label for="cd-trial-age">Alter</label>
            <input id="cd-trial-age" type="number" min="0" max="12" placeholder="2">
          </div>
        </div>
      </div>

      <div id="cd-block-form" style="display:none">
        <div class="cd-form-row">
          <label>Zahlungsart</label>
          <div class="cd-payment-row">
            <button type="button" class="cd-payment-pill active" data-payment="sepa">SEPA</button>
            <button type="button" class="cd-payment-pill" data-payment="card">Karte</button>
            <button type="button" class="cd-payment-pill" data-payment="paypal">PayPal</button>
          </div>
        </div>
      </div>

      <div class="cd-consent">
        <input type="checkbox" id="cd-consent-marketing">
        <label for="cd-consent-marketing">Ich möchte E-Mails über neue Kurse, Probestunden &amp; Aktionen von Socialy bekommen. Jederzeit widerrufbar.</label>
      </div>

      <div class="cd-actions-row">
        <button class="ghost-btn" onclick="goToDetail()">← Zurück</button>
        <button class="primary-btn" id="cd-confirm-btn" onclick="submitBooking()">Anfrage senden</button>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  let currentCourse = null;
  let currentKind = null;
  let currentPayment = 'sepa';

  function $(id) { return document.getElementById(id); }
  function show(el) { el.style.display = ''; }
  function hide(el) { el.style.display = 'none'; }

  // ===== Filtering =====
  const filterState = { age: 'all', cat: 'all' };

  function applyFilters() {
    const cards = document.querySelectorAll('.dc-card');
    let visible = 0;
    cards.forEach(card => {
      const okAge = filterState.age === 'all' || card.dataset.age === filterState.age;
      const okCat = filterState.cat === 'all' || card.dataset.cat === filterState.cat;
      if (okAge && okCat) {
        card.classList.remove('hidden');
        visible++;
      } else {
        card.classList.add('hidden');
      }
    });
    const empty = document.getElementById('dc-empty');
    if (empty) empty.style.display = visible === 0 ? '' : 'none';
  }

  document.addEventListener('click', (e) => {
    const f = e.target.closest('.dc-filter');
    if (!f) return;
    const group = f.dataset.filter;
    document.querySelectorAll(`.dc-filter[data-filter="${group}"]`).forEach(b => b.classList.remove('active'));
    f.classList.add('active');
    filterState[group] = f.dataset.value;
    applyFilters();
  });

  // ===== Course detail modal =====
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.dc-card');
    const btn = e.target.closest('.dc-open-detail');
    if (!card) return;
    if (e.target.closest('.dc-card-foot') && !btn) return;
    openCdModal(card);
  });

  function openCdModal(card) {
    currentCourse = {
      id: card.dataset.id,
      title: card.dataset.title,
      trainer: card.dataset.trainer,
      day: card.dataset.day,
      time: card.dataset.time,
      duration: card.dataset.duration,
      blockPrice: card.dataset.blockPrice,
      trialAvailable: card.dataset.trialAvailable === 'true',
      creditAvailable: card.dataset.creditAvailable === 'true',
      cat: card.querySelector('.dc-card-cat')?.textContent || '',
      desc: card.querySelector('.dc-card-desc')?.textContent || '',
      titleHtml: card.querySelector('.dc-card-title')?.innerHTML || card.dataset.title,
      spots: card.dataset.spots || '',
      ageRange: card.querySelector('.dc-card-meta')?.textContent || '',
    };

    $('cd-modal-cat').textContent = currentCourse.cat;
    $('cd-modal-title').innerHTML = currentCourse.titleHtml;
    $('cd-modal-meta').innerHTML =
      `<span class="meta-item">📅 ${currentCourse.day} · ${currentCourse.time}</span>` +
      `<span class="meta-item">⏱ ${currentCourse.duration}</span>` +
      `<span class="meta-item">👤 ${currentCourse.trainer}</span>`;
    $('cd-modal-desc').textContent = currentCourse.desc;
    $('cd-stat-sessions').innerHTML = '10 <em>Termine</em>';
    $('cd-stat-spots').textContent = currentCourse.spots.includes('/')
      ? 'noch ' + (parseInt(currentCourse.spots.split('/')[1]) - parseInt(currentCourse.spots.split('/')[0])) + ' frei'
      : currentCourse.spots;
    $('cd-stat-trainer').textContent = currentCourse.trainer;
    $('cd-block-price').innerHTML = currentCourse.blockPrice + '<em>/Block</em>';

    // Action availability
    const trialBtn = $('cd-action-trial');
    if (currentCourse.trialAvailable) {
      trialBtn.removeAttribute('disabled');
      trialBtn.querySelector('.cd-action-sub').textContent = '1× kostenlos & unverbindlich. Sophie meldet sich mit dem nächsten freien Termin.';
    } else {
      trialBtn.setAttribute('disabled', 'true');
      trialBtn.querySelector('.cd-action-sub').textContent = 'Für diesen Kurs sind keine Probestunden verfügbar.';
    }

    const creditBtn = $('cd-action-credit');
    if (currentCourse.creditAvailable) {
      creditBtn.removeAttribute('disabled');
      $('cd-credit-sub').textContent = '3 Credits verfügbar — 1 Credit = 1 Termin in diesem Kurs.';
    } else {
      creditBtn.setAttribute('disabled', 'true');
      $('cd-credit-sub').textContent = 'Add-Up nicht für diesen Kurs verfügbar.';
    }

    goToDetail();
    $('cd-modal-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  window.closeCdModal = function() {
    $('cd-modal-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    currentCourse = null;
    currentKind = null;
  };

  window.goToDetail = function() {
    show($('cd-step-detail'));
    hide($('cd-step-confirm'));
  };

  window.goToConfirm = function(kind) {
    if (!currentCourse) return;
    currentKind = kind;
    hide($('cd-step-detail'));
    show($('cd-step-confirm'));
    $('cd-step-confirm').classList.add('active');

    // Prefill summary
    $('cd-confirm-course').textContent = currentCourse.title;
    $('cd-confirm-when').textContent = currentCourse.day + ' · ' + currentCourse.time;
    const total = $('cd-confirm-total');
    const blockLine = $('cd-confirm-block-line');
    const trialForm = $('cd-trial-form');
    const blockForm = $('cd-block-form');

    hide(trialForm); hide(blockForm); show(blockLine);

    if (kind === 'trial') {
      $('cd-confirm-title').textContent = 'Probestunde anfragen';
      total.textContent = 'gratis';
      blockLine.querySelector('.value').textContent = '1 Termin · gratis';
      show(trialForm);
      $('cd-confirm-btn').textContent = 'Anfrage senden';
    } else if (kind === 'block') {
      $('cd-confirm-title').textContent = 'Block buchen';
      total.textContent = currentCourse.blockPrice;
      blockLine.querySelector('.value').textContent = '10 Termine';
      show(blockForm);
      $('cd-confirm-btn').textContent = 'Zahlung starten';
    } else if (kind === 'credit') {
      $('cd-confirm-title').textContent = 'Add-Up via Credit einlösen';
      total.textContent = '1 Credit';
      blockLine.querySelector('.value').textContent = '1 Termin · 1 Credit';
      $('cd-confirm-btn').textContent = 'Credit einlösen';
    }
  };

  // Payment pills
  document.addEventListener('click', (e) => {
    const pill = e.target.closest('.cd-payment-pill');
    if (!pill) return;
    document.querySelectorAll('.cd-payment-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentPayment = pill.dataset.payment;
  });

  window.submitBooking = async function() {
    if (!currentCourse || !currentKind) return;
    const btn = $('cd-confirm-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Wird gesendet...';

    const route = currentKind === 'trial' ? '/api/parent/book-trial'
                : currentKind === 'block' ? '/api/parent/book-block'
                                          : '/api/parent/redeem-credit';

    const body = {
      courseId: currentCourse.id,
      paymentMethod: currentPayment,
      marketingConsent: $('cd-consent-marketing').checked,
    };
    if (currentKind === 'trial') {
      body.childName = ($('cd-trial-name').value || '').trim();
      body.childAge = parseInt($('cd-trial-age').value || '0', 10);
    }

    let result = null;
    try {
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      result = await res.json().catch(() => null);
    } catch (err) {
      // demo: fall through to optimistic message
    }

    btn.disabled = false;
    btn.textContent = originalText;
    closeCdModal();

    // Toast (reuse cancel-toast)
    const toast = document.getElementById('cancel-toast');
    const toastText = document.getElementById('cancel-toast-text');
    if (toast && toastText) {
      toastText.textContent = result?.message || (
        currentKind === 'trial' ? 'Probestunde angefragt — Sophie meldet sich.' :
        currentKind === 'block' ? 'Block reserviert — Zahlung wird ausgelöst.' :
                                   'Add-Up gebucht — 1 Credit eingelöst.'
      );
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 4500);
    }
  };

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('cd-modal-backdrop').classList.contains('open')) {
      closeCdModal();
    }
  });

  // Helper for "Add-Up-Termin buchen" CTA in Credits tab
  window.filterByAddUp = function() {
    document.querySelectorAll('.dc-card').forEach(card => {
      if (card.dataset.creditAvailable === 'true') {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
    document.querySelectorAll('#panel-discover')[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Apply initial state on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFilters);
  } else {
    applyFilters();
  }
})();
</script>
'''

body_close_idx = src.rfind("</body>")
src = src[:body_close_idx] + DISCOVER_MODAL_AND_JS + "\n" + src[body_close_idx:]

P.write_text(src, encoding="utf-8")
print(f"OK portal-preview gets discover tab + course detail modal + booking flow ({len(src)} bytes)")
