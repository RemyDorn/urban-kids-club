# Urban Kids Club – Provider Dashboard

## Projektübersicht

SaaS-Plattform für Kursanbieter (Tanzschulen, Musikschulen, Sportvereine, Kreativstudios, STEM-Labs). Provider verwalten ihre Kurse, Buchungen, Finanzen – und können optional auf der Urban Kids Club Plattform listen.

## Techstack

- **Backend**: Node.js + TypeScript, In-Memory Store (Map-basiert), Zero-Dependency HTTP Router
- **Frontend**: Single HTML mit Tailwind CSS (CDN), Vanilla JS
- **Tests**: Node.js built-in test runner (61 Unit Tests)
- **Monorepo**: `packages/provider-dashboard/` (herauslösbares Subprojekt)

## Starten

```bash
npm install
npm test              # 61 Tests
npm run dev           # Server auf :3000
# oder mit anderem Port:
PORT=3001 npm run dev
```

## Struktur

```
packages/provider-dashboard/src/
├── types/index.ts          – 30+ TypeScript Interfaces
├── domain/store.ts         – In-Memory Store (27 Maps, 45+ Indizes)
├── services/               – 29 Services + Workflows + Validators + Helpers
│   ├── Kern: provider, activity, booking, attendance, location, team, parent, review, message
│   ├── 130%: waitlist, coupon, calendar, trial, notification, payment, sepa, invoice,
│   │         document, consent, season, holiday, audit, widget, crm, export, reporting
│   ├── Compliance: einvoice (ZUGFeRD/XRechnung), but-voucher, contract (Scheinselbständigkeit)
│   ├── Marketing: marketing (Automation Flows, Templates)
│   ├── helpers.ts – createNotification, createAuditEntry, constants
│   ├── validators.ts – 20+ Validatoren
│   └── workflows.ts – TrialConversion, WaitlistConversion, BackgroundJobs, CascadeDelete
├── api/
│   ├── router.ts    – Zero-dependency HTTP Router
│   ├── routes.ts    – 100+ REST Endpoints
│   ├── seed.ts      – Demo-Daten (5 Provider, 350+ Buchungen, 150 Eltern, ~25k€ Umsatz)
│   ├── server.ts    – HTTP Server + Frontend-Auslieferung
│   └── openapi.ts   – OpenAPI 3.0 Spec
└── frontend/
    └── dashboard.html – Komplettes Provider Dashboard (3500+ Zeilen)
```

## Frontend-Seiten (13)

1. **Dashboard** – Wochenkalender (Tag/Woche/Monat) + 8 KPIs + Auslastung
2. **Kurse** – CRUD, Multi-Tag Zeitplan, Paketpreise, Geschwisterrabatt, Farbwähler, Bildupload, Kids Club Plattform-Toggle mit Kontingent
3. **Buchungen** – Deutsche Labels, Kursfilter, Bezahlt/Stornieren, CSV/DATEV Export, Quelle (Direkt/Plattform)
4. **Kunden** – 4-stufiges Loyalty-System (konfigurierbar), Kundendetail-Modal
5. **Probestunden** – Abschließen, No-Show, Zur Buchung konvertieren
6. **Rechnungen** – Auto-Generierung, Versenden/Bezahlt/Stornieren, MwSt-Übersicht
7. **Team** – Hinzufügen, Aktivieren/Deaktivieren, Dokumente (Führungszeugnis), Abwesenheiten
8. **Dokumente** – Upload (max 10MB), 8 Kategorien, Download/Löschen
9. **Berichte** – 6 Tabs: Übersicht, Kurse, Teilnehmer, Probestunden, Umsatz, Team
10. **Einbettung** – 5 Widget-Typen mit Copy-to-Clipboard
11. **Marketing** – 10 Automation Flows mit Toggles, 11 Templates, GTM/Pixel/GA4/TikTok
12. **Einstellungen** – 4 Tabs: Unternehmen, Steuern & Finanzen, Treueprogramm, Rechtliches
13. **Kids Club Profil** – Plattform-Listing mit Kontingent (provider_first/equal/platform_first)

## Key Features

- **Kalender**: Kursfarben, Auslastungs-Fülleffekt, Tag/Woche/Monat, Last-Minute Kids Club Freigabe
- **Buchungssystem**: Validierung (Alter, Doppelbuchung, Kapazität), Coupon-Integration, Warteliste mit Prioritäten
- **Finanzen**: GoBD-konform, variable MwSt, E-Rechnung (ZUGFeRD/XRechnung), SEPA, DATEV-Export
- **Compliance**: Scheinselbständigkeit-Risk-Check, DSGVO Consent/Löschung, Führungszeugnis-Tracking
- **Bildupload**: Canvas-API Komprimierung (max 800px, 80% JPEG), Logo/Titelbild/Galerie
- **Demo**: 5 Provider, 21 Kurse, 150 Eltern, 350+ Buchungen, ~25k€ Umsatz

## Docs

- `BRAINSTORM.md` – Vision & Konzept
- `MARKET_ANALYSIS.md` – Wettbewerbsanalyse, 13 Konkurrenten, Feature-Matrix
- `packages/provider-dashboard/README.md` – API-Dokumentation

## Branch

Entwicklung auf: `claude/brainstorm-saas-platform-jLgmQ`
