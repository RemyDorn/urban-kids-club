# Provider Dashboard (Subprojekt)

Standalone SaaS-Software für Kursanbieter – eigenständig nutzbar, aber nahtlos in die Urban Kids Club Plattform integriert.

## Philosophie

- **100%** der Features fließen in die Plattform-Integration (Kurse, Buchungen, Verfügbarkeit)
- **130–150%** Mehrwert für den Provider: Geschäftsverwaltung, Rechnungen, Berichte, CRM, Integrationen – alles, was ein Kursanbieter braucht, um sein Business zu managen

## Struktur

```
src/
├── types/        – TypeScript Interfaces & Typen
├── domain/       – Entitäten & Value Objects
├── services/     – Business-Logik (In-Memory Stores)
└── api/          – API-Routen (Schnittstelle zur Plattform & Frontend)
```

## Abgrenzung

Dieses Subprojekt ist **herauslösbar**: Es hat keine direkten Abhängigkeiten zur Plattform. Die Plattform konsumiert die Provider-API, nicht umgekehrt.
