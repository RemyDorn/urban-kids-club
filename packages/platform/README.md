# Urban Kids Club – Eltern-Plattform

Die Hauptplattform für Eltern: Kinderkurse finden, buchen und verwalten.

## Starten

```bash
# Backend muss laufen (Provider Dashboard API)
npm run dev          # Port 3000

# Plattform starten
npm run dev:platform # Port 3001

# Oder beides gleichzeitig
npm run dev:all
```

## Features

- **Kurs-Discovery**: Suche nach Kategorie, Alter, Standort
- **Kurs-Details**: Beschreibung, Zeitplan, Preise, Bewertungen
- **Probestunde buchen**: Kostenlos/günstig ausprobieren
- **Online-Buchung**: Kind anmelden mit Formular
- **Bewertungen**: Nach Kursbesuch bewerten

## Architektur

```
packages/platform/
├── src/
│   ├── server.ts           – HTTP Server + API-Proxy
│   └── frontend/
│       └── platform.html   – Eltern-Frontend (SPA)
└── package.json
```

Die Plattform ist ein eigenständiger Frontend-Server, der API-Requests an das Provider-Dashboard-Backend weiterleitet.
