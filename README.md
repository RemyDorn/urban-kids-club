# Urban Kids Club

Plattform für Kinderkurse – Eltern finden und buchen, Anbieter verwalten ihr Business.

## Monorepo-Struktur

```
packages/
├── provider-dashboard/   ← SaaS-Software für Kursanbieter (herauslösbar)
│   └── src/
│       ├── types/        – TypeScript Interfaces
│       ├── domain/       – In-Memory Store
│       ├── services/     – Business-Logik
│       └── api/          – API-Routen
│
└── platform/             ← Hauptplattform (Eltern-Discovery + Buchung)
    └── src/
```

### Architektur-Prinzip

Das **Provider Dashboard** ist ein eigenständiges Subprojekt:
- **100%** fließt in die Plattform (Kurse, Buchungen, Verfügbarkeit)
- **130–150%** Mehrwert für Provider (Rechnungen, Berichte, CRM, Team-Verwaltung)
- Herauslösbar: Keine Abhängigkeit zur Plattform, die Plattform konsumiert die Provider-API
