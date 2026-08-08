#!/usr/bin/env python3
"""
Vertieft die KI-Assistent-Seite: fügt Activity-Feed, ROI-Calculator,
Plan-Comparison und Live-Chat-Demo VOR dem Settings-Card ein.
Plus: extra CSS für die neuen Sections.
"""
from pathlib import Path

P = Path("/opt/urban-kids-club-v2/packages/provider-dashboard/src/widgets/ki-assistent-preview.html")
src = P.read_text(encoding="utf-8")

if "ki-activity-feed" in src:
    print("- KI page already enriched, skipping")
    raise SystemExit(0)

# ============================================================
# CSS additions — appended to the page-specific style block
# ============================================================
EXTRA_CSS = """
/* === KI Page Enrichment === */
.ki-section-head { margin: 30px 0 14px; display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.ki-section-head h2 { font-family: var(--font-heading); font-weight: 700; font-size: 22px; color: var(--ink); letter-spacing: -0.005em; }
.ki-section-head h2 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.ki-section-head .ki-section-meta { font-size: 12px; color: var(--muted-2); }

/* Activity feed */
.ki-activity-feed { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 0; }
.ki-activity-row { display: grid; grid-template-columns: 28px auto 1fr auto; gap: 16px; padding: 14px 22px; border-bottom: 1px solid var(--border); align-items: center; transition: background 140ms; }
.ki-activity-row:last-child { border-bottom: 0; }
.ki-activity-row:hover { background: var(--surface-alt); }
.ki-activity-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
.ki-activity-dot.draft { background: var(--primary-tint); color: var(--primary); }
.ki-activity-dot.send { background: var(--sage-tint); color: var(--sage-deep); }
.ki-activity-dot.report { background: var(--surface-alt); color: var(--ink); }
.ki-activity-dot.alert { background: var(--signal-tint); color: var(--signal); }
.ki-activity-time { font-size: 12px; color: var(--muted-2); white-space: nowrap; min-width: 100px; }
.ki-activity-text { font-size: 13.5px; color: var(--ink); line-height: 1.5; }
.ki-activity-text strong { font-weight: 600; }
.ki-activity-text .quote { color: var(--ink-2); font-family: var(--font-accent); font-style: italic; }
.ki-activity-action { font-size: 11px; padding: 4px 10px; border-radius: 999px; background: transparent; border: 1px solid var(--border); color: var(--ink-2); cursor: pointer; transition: all 140ms; font-family: inherit; white-space: nowrap; }
.ki-activity-action:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-tint); }

/* ROI panel */
.ki-roi { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
.ki-roi-stats { background: var(--ink); color: var(--bg); border-radius: var(--radius-md); padding: 28px 30px; position: relative; overflow: hidden; }
.ki-roi-stats::after { content: ''; position: absolute; top: -30px; right: -30px; width: 180px; height: 180px; background: radial-gradient(circle, rgba(204,137,94,0.16) 0%, transparent 70%); }
.ki-roi-kicker { font-family: var(--font-heading); font-weight: 700; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--primary-soft); margin-bottom: 12px; }
.ki-roi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; position: relative; z-index: 1; }
.ki-roi-num { font-family: var(--font-heading); font-weight: 700; font-size: 36px; color: var(--bg); line-height: 1; letter-spacing: -0.005em; }
.ki-roi-num em { font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 18px; color: var(--primary-soft); }
.ki-roi-label { font-size: 11.5px; color: rgba(255,239,225,0.65); margin-top: 6px; line-height: 1.4; }
.ki-roi-side { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 22px 24px; display: flex; flex-direction: column; gap: 10px; }
.ki-roi-side h3 { font-family: var(--font-heading); font-weight: 700; font-size: 15px; color: var(--ink); }
.ki-roi-side h3 em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.ki-roi-side .ki-roi-bar { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--ink-2); }
.ki-roi-side .ki-roi-bar-track { flex: 1; height: 6px; background: var(--surface-alt); border-radius: 3px; overflow: hidden; }
.ki-roi-side .ki-roi-bar-fill { height: 100%; background: var(--primary); border-radius: 3px; }
.ki-roi-side .ki-roi-bar-pct { font-weight: 600; color: var(--ink); min-width: 36px; text-align: right; }

/* Plan comparison */
.ki-plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ki-plan { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 26px 28px; position: relative; transition: all 200ms; }
.ki-plan.featured { border: 2px solid var(--primary); transform: translateY(-4px); box-shadow: 0 12px 32px rgba(204,137,94,0.18); }
.ki-plan.featured::before { content: 'EMPFOHLEN'; position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--primary); color: var(--bg); padding: 3px 12px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; }
.ki-plan-name { font-family: var(--font-heading); font-weight: 700; font-size: 18px; color: var(--ink); letter-spacing: -0.005em; }
.ki-plan-name em { font-family: var(--font-accent); font-style: italic; font-weight: 400; color: var(--primary); }
.ki-plan-price { font-family: var(--font-heading); font-weight: 700; font-size: 36px; color: var(--ink); margin: 12px 0 6px; line-height: 1; }
.ki-plan-price em { font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size: 14px; color: var(--muted-2); margin-left: 4px; }
.ki-plan-tagline { font-size: 13px; color: var(--muted-2); margin-bottom: 18px; min-height: 36px; line-height: 1.45; }
.ki-plan ul { list-style: none; padding: 0; margin: 0 0 22px; }
.ki-plan ul li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--ink-2); display: flex; gap: 8px; align-items: flex-start; }
.ki-plan ul li:last-child { border-bottom: 0; }
.ki-plan ul li.has::before { content: '✓'; color: var(--sage-deep); font-weight: 700; flex-shrink: 0; }
.ki-plan ul li.no::before { content: '·'; color: var(--muted); font-weight: 700; flex-shrink: 0; opacity: 0.5; }
.ki-plan ul li.no { color: var(--muted-2); opacity: 0.7; }
.ki-plan-cta { width: 100%; padding: 12px; border-radius: 10px; font-family: inherit; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 140ms; border: 1px solid var(--ink); background: transparent; color: var(--ink); }
.ki-plan.featured .ki-plan-cta { background: var(--ink); color: var(--bg); }
.ki-plan-cta:hover { background: var(--ink); color: var(--bg); }
.ki-plan.featured .ki-plan-cta:hover { background: #2a1418; }

/* Demo chat */
.ki-demo-chat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px 28px; }
.ki-demo-msgs { display: flex; flex-direction: column; gap: 14px; max-height: 480px; overflow-y: auto; padding-right: 6px; }
.ki-demo-msg { max-width: 78%; padding: 13px 18px; border-radius: 16px; font-size: 13.5px; line-height: 1.5; }
.ki-demo-msg.user { background: var(--ink); color: var(--bg); align-self: flex-end; border-bottom-right-radius: 5px; }
.ki-demo-msg.kira { background: var(--bg); color: var(--ink); align-self: flex-start; border: 1px solid var(--border); border-bottom-left-radius: 5px; }
.ki-demo-msg.kira strong { font-weight: 600; }
.ki-demo-msg .ki-demo-meta { font-size: 11px; opacity: 0.55; margin-top: 6px; font-style: italic; font-family: var(--font-accent); }
.ki-demo-msg.kira ul { list-style: none; padding: 0; margin: 8px 0 0; }
.ki-demo-msg.kira ul li { padding: 4px 0; padding-left: 16px; position: relative; }
.ki-demo-msg.kira ul li::before { content: '→'; position: absolute; left: 0; color: var(--primary); font-weight: 600; }
.ki-demo-msg .ki-attach { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--surface-alt); border-radius: 8px; margin-top: 8px; font-size: 12px; color: var(--ink); }
.ki-demo-msg .ki-attach::before { content: '📎'; }
.ki-demo-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
.ki-demo-suggestions .pill { padding: 7px 13px; border-radius: 999px; background: var(--surface-alt); font-size: 12px; color: var(--ink-2); cursor: pointer; transition: all 140ms; user-select: none; }
.ki-demo-suggestions .pill:hover { background: var(--primary-tint); color: var(--primary); }
@media (max-width: 900px) { .ki-roi { grid-template-columns: 1fr; } .ki-plans { grid-template-columns: 1fr; } }
"""

# ============================================================
# HTML to insert before settings card
# ============================================================
INSERT_HTML = """
      <!-- Activity-Feed -->
      <div class="ki-section-head">
        <h2>Was Kira diese <em>Woche</em> gemacht hat</h2>
        <span class="ki-section-meta">22 Aktionen · 11 vorbereitet, du hast 11 freigegeben</span>
      </div>
      <div class="ki-activity-feed">

        <div class="ki-activity-row">
          <div class="ki-activity-dot draft">✉</div>
          <div class="ki-activity-time">vor 12 Min</div>
          <div class="ki-activity-text">Antwort an <strong>Hannah B.</strong> auf Krankmeldung verfasst — <span class="quote">„Gute Besserung an die kleine Maus..."</span></div>
          <button class="ki-activity-action">Draft öffnen</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot send">✓</div>
          <div class="ki-activity-time">vor 1 Std</div>
          <div class="ki-activity-text">11 Wartelisten-Eltern für <strong>Tanzkurs Mi 16:30</strong> per E-Mail erinnert · Klick-Rate bisher 27%</div>
          <button class="ki-activity-action">Resultate</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot report">📊</div>
          <div class="ki-activity-time">vor 3 Std</div>
          <div class="ki-activity-text">Wochenbericht <strong>KW17</strong> erstellt · 8 Kursblöcke analysiert · Auslastung 79% · Krankmeldungs-Trend stabil</div>
          <button class="ki-activity-action">Bericht ansehen</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot draft">✨</div>
          <div class="ki-activity-time">vor 5 Std</div>
          <div class="ki-activity-text">3 Instagram-Captions für <strong>Sommer-Krabbelkurs</strong> entworfen — Bildideen automatisch von Pinterest geholt</div>
          <button class="ki-activity-action">Captions ansehen</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot alert">⚠</div>
          <div class="ki-activity-time">heute 06:30</div>
          <div class="ki-activity-text">Auslastungs-Alert: <strong>Kreativ-Kurs Mi 16:30</strong> bei 38% — empfehle Marketing-Push oder Block-Verschiebung</div>
          <button class="ki-activity-action">Aktionen</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot send">✓</div>
          <div class="ki-activity-time">gestern 22:14</div>
          <div class="ki-activity-text">Probestunden-Follow-Up an <strong>Anna K.</strong> + 3 weitere automatisch versendet · Conversion-Tracking läuft</div>
          <button class="ki-activity-action">Conversions</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot draft">📝</div>
          <div class="ki-activity-time">gestern</div>
          <div class="ki-activity-text">Newsletter <strong>„Mai-Kurse"</strong> Vorlage erstellt · 4 Kategorien, 12 Bildvorschläge · wartet auf deine Freigabe</div>
          <button class="ki-activity-action">Newsletter prüfen</button>
        </div>

        <div class="ki-activity-row">
          <div class="ki-activity-dot report">💡</div>
          <div class="ki-activity-time">vor 2 Tagen</div>
          <div class="ki-activity-text">Cohort-Analyse Q1 abgeschlossen · 78% Retention nach 8 Wochen · Top-Channel: Mom-Graph (38% der Neukunden)</div>
          <button class="ki-activity-action">Insights</button>
        </div>

      </div>

      <!-- ROI Panel -->
      <div class="ki-section-head">
        <h2>Was Kira dir <em>spart</em></h2>
        <span class="ki-section-meta">Letzte 30 Tage · Trend: ↗ +14% Zeit-Ersparnis</span>
      </div>
      <div class="ki-roi">
        <div class="ki-roi-stats">
          <div class="ki-roi-kicker">Time saved · 30 Tage</div>
          <div class="ki-roi-grid">
            <div>
              <div class="ki-roi-num">14,2 <em>Std</em></div>
              <div class="ki-roi-label">Verbringst du nicht in deinem Mail-Postfach.</div>
            </div>
            <div>
              <div class="ki-roi-num">62 <em>Drafts</em></div>
              <div class="ki-roi-label">E-Mails von Kira vorbereitet, du hast nur freigegeben.</div>
            </div>
            <div>
              <div class="ki-roi-num">8 <em>Berichte</em></div>
              <div class="ki-roi-label">Auswertungen ohne dass du Excel öffnen musstest.</div>
            </div>
            <div>
              <div class="ki-roi-num">~ 510 <em>€</em></div>
              <div class="ki-roi-label">Ersparnis vs. Werkstudent:in @ 18€/h für gleiche Tasks.</div>
            </div>
          </div>
        </div>
        <div class="ki-roi-side">
          <h3>Wo Kira am <em>stärksten</em> ist</h3>
          <div class="ki-roi-bar">
            <span style="min-width:84px;">E-Mail-Drafts</span>
            <div class="ki-roi-bar-track"><div class="ki-roi-bar-fill" style="width:88%;"></div></div>
            <span class="ki-roi-bar-pct">88%</span>
          </div>
          <div class="ki-roi-bar">
            <span style="min-width:84px;">Auswertung</span>
            <div class="ki-roi-bar-track"><div class="ki-roi-bar-fill" style="width:74%;"></div></div>
            <span class="ki-roi-bar-pct">74%</span>
          </div>
          <div class="ki-roi-bar">
            <span style="min-width:84px;">Marketing</span>
            <div class="ki-roi-bar-track"><div class="ki-roi-bar-fill" style="width:62%;"></div></div>
            <span class="ki-roi-bar-pct">62%</span>
          </div>
          <div class="ki-roi-bar">
            <span style="min-width:84px;">Reminder</span>
            <div class="ki-roi-bar-track"><div class="ki-roi-bar-fill" style="width:54%;"></div></div>
            <span class="ki-roi-bar-pct">54%</span>
          </div>
          <div class="ki-roi-bar">
            <span style="min-width:84px;">Buchhaltung</span>
            <div class="ki-roi-bar-track"><div class="ki-roi-bar-fill" style="width:18%;background:var(--muted);"></div></div>
            <span class="ki-roi-bar-pct" style="color:var(--muted-2);">PRO</span>
          </div>
          <p style="font-size:11.5px;color:var(--muted-2);margin-top:8px;line-height:1.5;">Schwächer: Personal/Schichten — kommt wenn du das Studio-Pro-Plan upgradest.</p>
        </div>
      </div>

      <!-- Live-Demo Chat -->
      <div class="ki-section-head">
        <h2>Probier's <em>aus</em></h2>
        <span class="ki-section-meta">Demo-Konversation · echte Antworten kommen mit Pro-Aktivierung</span>
      </div>
      <div class="ki-demo-chat">
        <div class="ki-demo-msgs">

          <div class="ki-demo-msg user">Wie viele Add-Ups habe ich diese Woche noch verfügbar?</div>
          <div class="ki-demo-msg kira">
            Du hast aktuell <strong>14 Add-Up-Slots</strong> diese Woche frei verteilt:
            <ul>
              <li>Mo 09:30 Babykurs · 4 Slots</li>
              <li>Di 11:00 Krabbel-Yoga · 3 Slots</li>
              <li>Mi 16:30 Tanz 4–6 J · 5 Slots <strong>(unter-besetzt)</strong></li>
              <li>Sa 09:30 Babykurs · 2 Slots</li>
            </ul>
            <span class="ki-demo-meta">basiert auf Stand 25.04. 09:14 · 11 Eltern-Credits im Umlauf</span>
          </div>

          <div class="ki-demo-msg user">Schreib eine Antwort an Hannah, die für Mia das Babykurs-Add-Up am Sa annimmt</div>
          <div class="ki-demo-msg kira">
            Hier ist mein Vorschlag für Hannah:
            <div class="ki-attach">draft-hannah-mia-addup.md</div>
            <ul>
              <li>Begrüßung warm, persönlich (Mia bei Namen)</li>
              <li>Bestätigt Sa 09:30, 1 Credit eingelöst</li>
              <li>Erwähnt nächsten Termin Mo, falls Mia bis dahin wieder fit</li>
              <li>Schließt mit „Gute Besserung 💛" — passt zu deinem Ton</li>
            </ul>
            Soll ich's senden oder willst du erst lesen?
            <span class="ki-demo-meta">geschätzte Lesezeit 14 Sek</span>
          </div>

          <div class="ki-demo-msg user">Wer aus den Wartelisten kommt für Mi 16:30 in Frage?</div>
          <div class="ki-demo-msg kira">
            Drei Familien matchen optimal (Alter + Kategorie):
            <ul>
              <li><strong>Familie Weber</strong> · Lara (5J) · steht auf Warteliste seit 18.03 · hatte bei dir bereits Probestunde</li>
              <li><strong>Tina R.</strong> · Paul (1J zu jung) · matched auf Bewegung allgemein, könnte Krabbel-Tanz interessant finden</li>
              <li><strong>Marie F.</strong> · hat zwei Kinder im Zielalter</li>
            </ul>
            Soll ich Magic-Link-Einladungen mit 5%-Code an alle drei vorbereiten?
            <span class="ki-demo-meta">erwarteter Conversion-Lift +18% · ROI 4,2×</span>
          </div>

          <div class="ki-demo-msg user">Erstell mir den Wochenbericht KW17 als PDF</div>
          <div class="ki-demo-msg kira">
            Wochenbericht KW17 ist fertig:
            <div class="ki-attach">UKC-Wochenbericht-KW17.pdf · 4 Seiten · 312 KB</div>
            <strong>Highlights:</strong>
            <ul>
              <li>Auslastung gesamt: 79% (+5% vs. KW16)</li>
              <li>Top-Kurs: Babykurs Mo 09:30 mit 100% Auslastung</li>
              <li>Risiko: Tanz 4–6 J auf 38% — Marketing-Push empfohlen</li>
              <li>Mom-Graph: 7 neue Empfehlungen, 3 davon konvertiert</li>
            </ul>
            <span class="ki-demo-meta">automatisch in dein Postfach + LexOffice gemirrort</span>
          </div>

        </div>

        <div class="ki-demo-suggestions">
          <span class="pill">Was war diesen Monat ungewöhnlich?</span>
          <span class="pill">Welche Eltern verlieren wir gerade?</span>
          <span class="pill">3 Captions für Tanzkurs (Stil: warm, locker)</span>
          <span class="pill">Reminder an Wartelisten-Eltern</span>
          <span class="pill">Q1-Steuer-Auswertung vorbereiten</span>
          <span class="pill">Wer ist Top-Empfehler:in diesen Monat?</span>
        </div>
      </div>

      <!-- Plans -->
      <div class="ki-section-head">
        <h2>Pläne &amp; <em>Limits</em></h2>
        <span class="ki-section-meta">Free für immer · Pro &amp; Studio jederzeit kündbar</span>
      </div>
      <div class="ki-plans">

        <div class="ki-plan">
          <div class="ki-plan-name">Free</div>
          <div class="ki-plan-price">0 <em>€/Mo</em></div>
          <div class="ki-plan-tagline">Genug zum Reinschnuppern. Du siehst Kira's Vorschläge, aber sendest selbst.</div>
          <ul>
            <li class="has">3 Insights / Woche</li>
            <li class="has">5 E-Mail-Drafts / Monat</li>
            <li class="has">Wochenbericht (Basis)</li>
            <li class="no">Keine Auto-Aktionen</li>
            <li class="no">Kein Marketing-Modul</li>
            <li class="no">Keine Buchhaltungs-Hilfe</li>
            <li class="no">Kein Personal-Modul</li>
          </ul>
          <button class="ki-plan-cta">Aktiver Plan</button>
        </div>

        <div class="ki-plan featured">
          <div class="ki-plan-name">Pro <em>· empfohlen</em></div>
          <div class="ki-plan-price">19 <em>€/Mo</em></div>
          <div class="ki-plan-tagline">Für aktive Studios. Kira übernimmt Routine, du machst Strategie.</div>
          <ul>
            <li class="has">Unbegrenzte Insights</li>
            <li class="has">Unbegrenzte E-Mail-Drafts</li>
            <li class="has">Auto-Aktionen (Wartelisten, Reminder)</li>
            <li class="has">Marketing-Modul (IG, Newsletter)</li>
            <li class="has">Berichte als PDF + Excel</li>
            <li class="no">Buchhaltung in Beta (Q3)</li>
            <li class="no">Personal-Modul kommt mit Studio</li>
          </ul>
          <button class="ki-plan-cta">14 Tage gratis testen</button>
        </div>

        <div class="ki-plan">
          <div class="ki-plan-name">Studio <em>Pro+</em></div>
          <div class="ki-plan-price">49 <em>€/Mo</em></div>
          <div class="ki-plan-tagline">Wenn du Personal hast. Kira plant Schichten, bereitet Lohnabrechnungen vor.</div>
          <ul>
            <li class="has">Alles aus Pro</li>
            <li class="has">Personal-Modul (Schichtplan, Stundenkonto)</li>
            <li class="has">Buchhaltungs-Helper (LexOffice, sevDesk)</li>
            <li class="has">UStVA-Vorbereitung</li>
            <li class="has">Multi-User &amp; Rollen</li>
            <li class="has">Priority Support &lt; 4h</li>
            <li class="has">Custom Sprachstil-Training</li>
          </ul>
          <button class="ki-plan-cta">Demo buchen</button>
        </div>

      </div>

"""

# ============================================================
# 1. Append CSS to existing style block (before final </style>)
# ============================================================
style_close_idx = src.rfind("</style>")
if style_close_idx < 0:
    raise SystemExit("</style> not found")
src = src[:style_close_idx] + EXTRA_CSS + "\n" + src[style_close_idx:]

# ============================================================
# 2. Insert HTML before settings card
# ============================================================
settings_anchor = '      <div class="card">\n        <div class="card-head">\n          <div class="card-title">Kira <em>· Settings</em></div>'
if settings_anchor not in src:
    raise SystemExit("settings card anchor not found")
src = src.replace(settings_anchor, INSERT_HTML + settings_anchor, 1)

P.write_text(src, encoding="utf-8")
print(f"OK ki-assistent-preview enriched ({len(src)} bytes)")
