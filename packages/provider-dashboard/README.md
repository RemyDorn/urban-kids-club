# Provider Dashboard (Subprojekt)

Standalone SaaS-Software für Kursanbieter – eigenständig nutzbar, aber nahtlos in die Urban Kids Club Plattform integriert.

## Quickstart

```bash
npm install
npm run dev
# → http://localhost:3000

# Health Check
curl http://localhost:3000/api/health

# Dashboard eines Providers
curl http://localhost:3000/api/providers
curl http://localhost:3000/api/providers/{id}/dashboard
```

Demo-Daten werden automatisch geladen (2 Provider, 4 Kurse, 5 Buchungen, 3 Eltern).

## Architektur

```
src/
├── types/          – 30+ TypeScript Interfaces
├── domain/store.ts – In-Memory Store (27 Maps, 45+ Indizes)
├── services/       – 29 Services + Validators + Workflows + Helpers
│   ├── Kern (9)    – Provider, Activity, Booking, Attendance, Location, Team, Parent, Review, Message
│   ├── 130% (17)   – Waitlist, Coupon, Calendar, Trial, Notification, Payment, SEPA, Invoice,
│   │                  Document, Consent, Season, Holiday, Audit, Widget, CRM, Export, Reporting
│   ├── Compliance   – EInvoice (ZUGFeRD/XRechnung), BuT-Voucher, Contract (Scheinselbständigkeit)
│   ├── validators   – 20+ Validatoren (Alter, Doppelbuchung, Kapazität, IBAN, Zeitkonflikte)
│   ├── workflows    – Trial→Booking, Waitlist→Booking, BackgroundJobs, CascadeDelete
│   └── helpers      – createNotification, createAuditEntry, getEntitiesFromIndex
└── api/
    ├── router.ts    – Zero-dependency HTTP Router
    ├── routes.ts    – 100+ REST Endpoints
    ├── seed.ts      – Demo-Daten
    └── server.ts    – HTTP Server

## API Endpoints (Auszug)

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| GET | `/api/providers` | Alle Provider |
| GET | `/api/providers/:id/dashboard` | Dashboard-KPIs (11 Metriken) |
| GET | `/api/activities/search?q=&category=&ageMin=&ageMax=` | Kurssuche |
| POST | `/api/bookings` | Buchung erstellen (mit Validierung, Coupon, Notification) |
| POST | `/api/trials/:id/convert` | Probestunde → Buchung |
| POST | `/api/waitlist/:id/accept` | Warteliste → Buchung |
| GET | `/api/providers/:id/calendar?start=&end=` | Kalender + Konflikte |
| POST | `/api/invoices/from-booking/:id` | Rechnung aus Buchung |
| POST | `/api/einvoices/generate` | ZUGFeRD/XRechnung XML |
| GET | `/api/contracts/:id/risk` | Scheinselbständigkeit-Check |
| GET | `/api/providers/:id/reports/revenue/:period` | Umsatz-Report |
| GET | `/api/providers/:id/reports/clv` | Customer Lifetime Value |
| POST | `/api/admin/jobs/daily` | Background-Jobs auslösen |

## Herauslösbar

Dieses Subprojekt hat keine Abhängigkeiten zur Plattform. Die Plattform konsumiert die Provider-API, nicht umgekehrt.
```
