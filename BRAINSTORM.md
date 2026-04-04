# Urban Kids Club – Provider SaaS Platform: Brainstorming

## Vision

Eine SaaS-Plattform, über die **Anbieter** (Provider) von Kinderkursen, Workshops und Aktivitäten ihre Angebote verwalten, veröffentlichen und Buchungen abwickeln können. Eltern finden und buchen darüber Kurse für ihre Kinder.

---

## Kernkonzepte & Domänenmodell (In-Memory)

### Entitäten

```
Provider          – Kursanbieter (Tanzschule, Sportverein, Musikschule, …)
├── Profile       – Name, Beschreibung, Logo, Kontakt, Adresse, Social Links
├── Locations     – Standorte, an denen Kurse stattfinden
├── Team Members  – Trainer/Lehrer mit Rollen & Berechtigungen
└── Subscription  – SaaS-Plan (Free / Starter / Pro / Enterprise)

Activity          – Ein konkretes Kursangebot
├── Category      – Sport, Musik, Kunst, STEM, Sprachen, Outdoor, …
├── Age Range     – z.B. 4–6, 7–10, 11–14
├── Schedule      – Einmalig / Wöchentlich / Feriencamp / Flexibel
├── Capacity      – Max. Teilnehmer, Warteliste
├── Pricing       – Einzelstunde, Abo, Paket, Geschwisterrabatt
└── Media         – Fotos, Videos, Beschreibung

Booking           – Eine Buchung durch ein Elternteil
├── Child         – Name, Alter, Notfallkontakt, Allergien/Hinweise
├── Status        – Pending → Confirmed → Completed / Cancelled / No-Show
├── Payment       – Betrag, Methode, Status
└── Check-In      – Anwesenheitsstatus

Parent (Customer) – Elternteil / Erziehungsberechtigter
├── Children      – Profile der Kinder
├── Bookings      – Alle Buchungen
└── Reviews       – Bewertungen nach Kursbesuch
```

---

## Feature-Bereiche

### 1. Provider Onboarding & Profil
- Registrierung mit E-Mail / Google / Apple
- Profil-Setup-Wizard (Name, Kategorie, Logo, Beschreibung)
- Verifizierung (optional: Führungszeugnis-Upload, Versicherungsnachweis)
- Öffentliche Provider-Seite (Subdomain oder `/p/provider-slug`)

### 2. Activity Management
- Kurs erstellen mit Titel, Beschreibung, Kategorie, Altersgruppe
- Zeitplan-Builder: Einmalig, Serie (wöchentlich), Feriencamp-Block
- Kapazität & Warteliste mit automatischer Nachrücklogik
- Preisgestaltung: Einzelpreis, Abo-Modell, Pakete, Geschwisterrabatt
- Duplikation von Kursen für neue Saisons
- Draft / Published / Archived Status

### 3. Buchungssystem
- Echtzeit-Verfügbarkeitsprüfung
- Buchungsflow: Kurs wählen → Kind zuordnen → Zahlen → Bestätigung
- Warteliste mit automatischer Benachrichtigung
- Stornierung & Umbuchung mit konfigurierbaren Regeln
- Buchungsübersicht für Provider (Kalender + Liste)

### 4. Kalender & Zeitplanung
- Kalenderansicht (Tag / Woche / Monat) für Provider
- Konflikt-Erkennung (Doppelbelegung Raum/Trainer)
- Automatische Erinnerungen an Eltern (24h vorher)
- iCal-Export / Google Calendar Sync

### 5. Teilnehmer- & Anwesenheitsverwaltung
- Teilnehmerliste pro Kurs/Termin
- Check-In per QR-Code oder manuell
- Anwesenheitshistorie
- Notfallkontakte & medizinische Hinweise auf einen Blick

### 6. Kommunikation
- In-App-Nachrichten (Provider ↔ Eltern)
- Automatische Benachrichtigungen (Buchungsbestätigung, Erinnerung, Absage)
- Broadcast-Nachrichten an alle Kursteilnehmer
- E-Mail & Push-Notifications

### 7. Zahlungen & Finanzen
- Stripe Connect Integration (jeder Provider hat eigenes Konto)
- Rechnungserstellung (PDF)
- Gutscheine & Rabattcodes
- Auszahlungs-Dashboard für Provider
- SaaS-Abo-Abrechnung (Plattformgebühr)

### 8. Analytics & Reporting
- Dashboard: Buchungen, Umsatz, Auslastung, Bewertungen
- Kurs-Performance (welche Kurse laufen gut?)
- Teilnehmer-Trends (Wiederbuchungsrate)
- Export (CSV/PDF)

### 9. Eltern-Erlebnis (Discovery & Buchung)
- Suchfunktion: Kategorie, Alter, Standort, Datum, Preis
- Kartenansicht (Standorte)
- Favoriten & Merkliste
- Bewertungen & Rezensionen
- Kind-Profile mit Interessen-Matching

### 10. Admin / Plattform-Betreiber
- Provider-Verifizierung & Moderation
- Plattform-weite Analytics
- Content-Moderation (Bewertungen)
- Feature-Flags & SaaS-Plan-Verwaltung
- Support-Ticket-System

---

## SaaS-Preismodell (Provider-Seite)

| Plan        | Preis/Monat | Kurse | Buchungen/Monat | Features                              |
|-------------|-------------|-------|-----------------|---------------------------------------|
| **Free**    | 0 €         | 2     | 20              | Basis-Profil, manuelle Zahlungen      |
| **Starter** | 29 €        | 10    | 100             | + Online-Zahlung, Kalender-Sync       |
| **Pro**     | 79 €        | ∞     | ∞               | + Analytics, Gutscheine, Warteliste   |
| **Enterprise** | Individuell | ∞  | ∞               | + API, White-Label, Multi-Standort    |

Zusätzlich: Transaktionsgebühr pro Buchung (z.B. 2–5% je nach Plan).

---

## Technische Architektur (Vorschlag)

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│  Next.js App (React, TypeScript, Tailwind CSS)      │
│  ├── /provider – Provider Dashboard (SPA)           │
│  ├── /explore  – Eltern-Discovery & Buchung         │
│  └── /admin    – Plattform-Admin                    │
└─────────────────────┬───────────────────────────────┘
                      │ REST / tRPC
┌─────────────────────▼───────────────────────────────┐
│                   Backend                            │
│  Node.js / TypeScript                                │
│  ├── In-Memory Store (Map-basiert, Prototyp-Phase)  │
│  ├── Domain Services (Provider, Activity, Booking)  │
│  ├── Auth (JWT / Session-basiert)                   │
│  └── Event Bus (In-Memory, später → Redis/Kafka)    │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│              Spätere Erweiterungen                    │
│  ├── PostgreSQL (Persistenz)                         │
│  ├── Redis (Caching, Sessions)                       │
│  ├── Stripe Connect (Zahlungen)                      │
│  ├── S3 / Cloudflare R2 (Media-Upload)              │
│  └── SendGrid / Resend (E-Mails)                    │
└─────────────────────────────────────────────────────┘
```

---

## In-Memory Datenstruktur (TypeScript-Skizze)

```typescript
// Zentrale In-Memory Stores
const providers   = new Map<string, Provider>()
const activities  = new Map<string, Activity>()
const bookings    = new Map<string, Booking>()
const parents     = new Map<string, Parent>()
const reviews     = new Map<string, Review>()

// Indizes für schnelle Lookups
const activitiesByProvider = new Map<string, Set<string>>()
const bookingsByActivity   = new Map<string, Set<string>>()
const bookingsByParent     = new Map<string, Set<string>>()
const activitiesByCategory = new Map<string, Set<string>>()
```

---

## MVP-Scope (Phase 1)

Fokus auf den **Provider-Flow**:

1. ✅ Provider kann sich registrieren & Profil anlegen
2. ✅ Provider kann Kurse/Aktivitäten erstellen & verwalten
3. ✅ Einfacher Buchungsflow (ohne Zahlung)
4. ✅ Kalenderansicht für Provider
5. ✅ Teilnehmerliste & Check-In
6. ✅ Eltern können Kurse suchen & buchen

**Nicht im MVP:** Zahlungen, Analytics, Bewertungen, Kommunikation

---

## Offene Fragen zur Diskussion

1. **Markt-Fokus:** Nur Deutschland/DACH oder international?
2. **Sprache:** DE-first mit i18n-Support oder direkt mehrsprachig?
3. **Mobile:** Responsive Web oder native App (React Native)?
4. **Monetarisierung:** Rein SaaS-Abo oder auch Marktplatz-Provision?
5. **B2B vs. B2C:** Provider-Dashboard-first oder Eltern-Discovery-first?
6. **Datenschutz:** DSGVO-Konformität (Kinderdaten = besonders schützenswert!)
7. **Verifizierung:** Wie streng soll die Provider-Prüfung sein?
