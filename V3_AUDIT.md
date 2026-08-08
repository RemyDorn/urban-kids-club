# UKC Provider-Dashboard V3 · Komplette Audit-Übersicht
*Stand: 2026-04-26*

## Architektur (klargestellt)

```
User → app.urbankids.club → Caddy → host.docker.internal:3013 → dashboard-prod-v2 service
                                                                       ↓
GET /              → dashboard.html  (530 KB · Login-Wrapper, 5000+ Zeilen Legacy-Code)
                       └─ Nach Login: window.location.href = '/v3'
GET /v1            → (kein eigener route)
GET /v3            → dashboard-v3.html  (393 KB · ECHTES Provider-Dashboard, Sophie-Look)
                       └─ Lädt /assets/dashboard-ui.js, dashboard-cmdk.js, etc.
GET /assets/*.js   → Statische JS-Module
GET /api/*         → ~280 REST-Endpoints (alle vorhanden)
```

**Wichtig:** `/v3` ist das **echte produktive Dashboard**. `/` ist nur Legacy-Login-Page mit Auto-Redirect.

## Status pro Section in dashboard-v3.html

| Section | Größe | Mockup-Daten | Dynamic? | Nötige API |
|---|---|---|---|---|
| dashboard | 3.2 KB | 1 Name | **Teilweise** ✅ | `/api/me`, `/api/providers/:id/bookings/stats`, `/api/providers/:id/bookings` |
| kurse | 23 KB | 11 Kurse, 3 Preise | ❌ Mockup | `/api/providers/:providerId/activities` |
| buchungen | 31 KB | 13 Namen, 16 Kurse | ❌ Mockup | `/api/providers/:providerId/bookings` |
| kursbloecke | 14 KB | 4 Kurse | ❌ Mockup | `/api/providers/:id/course-blocks` |
| kunden | 29 KB | 16 Namen | ❌ Mockup | `/api/parents` |
| probestunden | 16 KB | 11 Namen, 8 Kurse | ❌ Mockup | trials.ts (7 endpoints) |
| team | 17 KB | 3 Namen | ❌ Mockup | `/api/team/*` (settings.ts) |
| postfach | 9 KB | 20 Namen | ❌ Mockup | **fehlt** — provider-side messaging API |
| rechnungen | 30 KB | 10 Namen | ❌ Mockup | `/api/providers/:providerId/invoices` |
| credits | 8.5 KB | 11 Namen | ❌ Mockup | `/api/parents/:id/credits` (per parent) |
| anwesenheit | 12 KB | 11 Namen | ❌ Mockup + Bug ⚠️ | `/api/attendance/today` (hat schema-bug `provider_id`) |
| raeume | 12 KB | – | ❌ Mockup | `/api/rooms` |
| ferien | 18 KB | – | ❌ Static | `/api/holidays/bundeslaender` |
| marketing | 9.8 KB | 14 Namen | ❌ Mockup | marketing.ts (16 endpoints) |
| ki-assistent | 22 KB | 13 Namen | ❌ Mockup (Pro-Feature, Demo) | ai.ts (1 endpoint) |
| integrationen | 13 KB | – | ❌ Static | – (UI-only) |
| einstellungen | 31 KB | 4 Namen | ❌ Mockup | settings.ts (16 endpoints) |
| berichte | 16 KB | – | ❌ Mockup | – (komplexe Aggregation, ggf. neu) |
| embed | 0.4 KB | – | EMPTY/Placeholder | – |

**Zusammenfassung:**
- 1 Section teilweise dynamisch (Dashboard)
- 16 Sections komplett Mockup
- 2 Sections Static/UI-only

## API-Coverage

23 Router-Files, ~280 Endpoints. **Existieren bereits:**
- `activities.ts` (8) — Kurse CRUD ✅
- `bookings.ts` (12) — Buchungen CRUD ✅
- `course-blocks.ts` (31) — Kursblöcke umfangreich ✅
- `invoices.ts` (18) — Rechnungen ✅
- `parents.ts` (9) — Kunden ✅
- `trials.ts` (7) — Probestunden ✅
- `marketing.ts` (16) ✅
- `settings.ts` (16) ✅
- `waitlist.ts` (8) ✅
- `parent-invites.ts` (14) — Mom-Graph ✅
- `portal.ts` (21) — Eltern-Portal ✅
- `reviews.ts` (7) ✅

**Fehlt noch:**
- Provider-seitige Messaging/Postfach-API (nur portal-Variante existiert)
- Aggregierte Reports/Berichte-API

## Aufwandsschätzung pro Section

Pro Section = (Mockup-HTML weg) + (JS-Render-Funktion mit API-Call) + (Empty-State + Loading-State) + (CRUD-Buttons funktional verdrahten):

| Priorität | Section | Aufwand | Begründung |
|---|---|---|---|
| P0 | dashboard | 1-2h | Bereits teilweise dynamic — fehlende Felder ergänzen + Mockup-Reste raus |
| P0 | kurse | 3-4h | Kern-Workflow, API komplett da |
| P0 | buchungen | 4-5h | Kern-Workflow, viele Statusfelder |
| P0 | kunden | 3-4h | API komplett da |
| P1 | kursbloecke | 4-6h | Komplexe State-Transitions (Enrollment, Warteliste) |
| P1 | rechnungen | 4-5h | PDF-Preview-Integration |
| P1 | anwesenheit | 3-4h | + erst Schema-Bug fixen (`attendance.provider_id` Migration) |
| P1 | probestunden | 2-3h | API überschaubar |
| P2 | credits | 2-3h | Parent-basierte Lookup-Logik |
| P2 | team | 2h | Klein |
| P2 | raeume | 2h | Klein |
| P2 | ferien | 1h | Static-Daten + bundeslaender-API |
| P2 | einstellungen | 4-5h | Viele Felder |
| P3 | postfach | 6-8h | + Backend-API muss erst gebaut werden |
| P3 | berichte | 8-10h | + Aggregation-Layer |
| P3 | marketing | 4-5h | Komplex |
| P3 | ki-assistent | – | Pro-Feature, Mockup OK für jetzt |
| P3 | integrationen | – | UI-only, kein Backend |

**Gesamtaufwand:** ~50-70 Stunden konzentrierter Arbeit. In Sprints aufgeteilt: 2-3 Wochen Vollzeit oder 4-6 Wochen mit anderer Arbeit parallel.

## Vorschlag Vorgehen

Weil das eine Wochen-Aufgabe ist, schlage ich vor in 4 Sprints:

**Sprint A — Kern-Workflow (P0, ~12-15h):**
- Mockup-Daten raus, dynamic API-Calls rein für: dashboard, kurse, buchungen, kunden
- Diese 4 Sektionen sind das Tagesgeschäft jedes Providers

**Sprint B — Erweiterung (P1, ~13-18h):**
- kursbloecke, rechnungen, anwesenheit (+ Schema-Fix), probestunden
- Damit ist der komplette Kursmanagement-Loop dynamisch

**Sprint C — Settings & Tools (P2, ~11-14h):**
- credits, team, raeume, ferien, einstellungen
- Damit kann der Provider sein Setup selbst verwalten

**Sprint D — Optional (P3, ~18-23h):**
- postfach (mit Backend-Bau), berichte, marketing, ki-assistent, integrationen
- Was zum Launch nicht kritisch ist

## Aktuelle laufende Arbeit (Kontext)

Frühere Session (heute, 2026-04-26):
- ✅ Postfach-Duplikat in v3-Sidebar gefixt (CSS-Dedup ignoriert jetzt Badges)
- ✅ Strukturelles `<div>`-Imbalance in dashboard-Section gefixt (alle Subseiten zeigen Inhalt)
- ✅ ~49 KB CSS aus preview-Pages in v3-`<style>` gemerged (mobile-cards, pills, auslastung etc.)
- ✅ `att-toggle` auf grid-layout umgestellt (gleichmäßige button-Breiten bei "+8 Min" State)

Memory-Context:
- V2-Live-Switch war 2026-04-25
- Service: `dashboard-prod-v2` auf Port 3013
- Backup: `dashboard-v3.html.pre-css-merge-20260426` falls revert nötig
- Pre-existing Bug: `attendance.provider_id` Spalte fehlt in Production-Supabase

## Was ich NICHT autonom tun werde

- Sprint A-D ausführen ohne dein OK (jede Section ist 2-5h echte Code-Arbeit + Test)
- Die Mockup-Sections direkt ersetzen — du musst zuerst entscheiden ob du Empty-States oder Demo-Daten willst während wir schrittweise migrieren
- Schema-Migrationen in Production-DB ohne explizites OK pro Migration

## Was ich JETZT tun könnte (autonom, low-risk)

- Memory updaten mit korrekter v3-Architektur (überschreibt alte falsche Info)
- v3-Mockup-Cleanup: Demo-Namen wie "Anna", "Lisa" etc. durch generische Platzhalter wie "Max Mustermann" ersetzen — nur kosmetik, ändert nichts am Backend
- Dashboard-Section finalisieren (P0, klein) — die fehlenden 1-2 Mockup-Reste durch API-Calls ersetzen
- Schema-Fix für `attendance.provider_id` vorbereiten (SQL-Migration-File schreiben, NICHT ausführen)

## Meine Empfehlung

1. Du entscheidest welche Sprint-Priorität (A-D) wir zuerst angehen
2. Pro Section: ich liefere **eine** vollständige Migration (Mockup raus + API rein + Empty-State + Tests) als ein in-sich-geschlossenes Stück Arbeit
3. Du klickst es durch, gibst Feedback, dann nächste Section
4. Nach jeder Section: git commit damit wir Rollback haben

**Mein Vorschlag konkret:** Wir starten mit **dashboard + kurse** (P0, das ist 4-6h Arbeit). Wenn das gut läuft, machen wir buchungen + kunden. Das ist der Kern-Workflow, und nach diesem ersten Sprint hast du ein funktionierendes Live-Dashboard mit echten Daten in den 4 wichtigsten Sektionen.
