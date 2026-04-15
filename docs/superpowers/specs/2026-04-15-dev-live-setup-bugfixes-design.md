# Design: Dev/Live-Trennung + Bug-Fixes Urban Kids Club

**Datum:** 2026-04-15
**Status:** Approved
**Autor:** Claude Code + Remy

---

## 1. Kontext

Das UKC Provider Dashboard läuft produktiv auf einem VPS (46.224.112.178). Ein umfassendes Audit hat folgende Probleme aufgedeckt:

### Kritische Bugs
1. **Doppelte Booking-Tabellen** — `bookings` (UKC-Plattform) und `provider_bookings` (Dashboard) existieren parallel. `reporting.service.ts` liest aus beiden und riskiert Doppelzählung.
2. **Schema-Mismatch CheckoutService** — Wurde heute gefixt (schrieb in falsche Tabelle), aber die Kapazitätsprüfung und Reporting-Logik müssen konsolidiert werden.
3. **Keine Stripe-Key-Validierung** — Kein Check ob Test- vs Live-Keys im richtigen Environment verwendet werden.

### Strukturelle Probleme
4. **Kein Dev-Environment** — Änderungen gehen direkt live.
5. **Port-Konflikte** — Ports werden ad-hoc vergeben, kollidieren mit anderen Projekten.
6. **Keine Integration-Tests** — Tests laufen nur gegen In-Memory-Store.

---

## 2. Plan: Bug-Fixes (Phase 1)

### 2.1 Reporting-Service: Doppelzählung beheben
- `getCourseStats()` soll NUR `provider_bookings` lesen
- `getOverview()` soll NUR `provider_bookings` lesen
- Die `bookings`-Tabelle (UKC-Plattform) wird vom Dashboard ignoriert — die gehört zum separaten Plattform-Booking-System
- Fallback auf `bookings` via `activity_slots` entfernen

### 2.2 Stripe-Key-Validierung
- Beim Server-Start prüfen: wenn `NODE_ENV=production`, müssen Keys `sk_live_`/`pk_live_` sein
- Wenn `NODE_ENV=development`, warnen wenn Live-Keys verwendet werden
- Webhook-Secret muss in Production gesetzt sein

### 2.3 Schema-Validierung
- `parents`-Tabelle: Code erwartet `name` (nicht `first_name`/`last_name`) — CheckoutService wurde heute gefixt
- `provider_bookings`: `pricing_option_id` ist jetzt nullable — OK
- `activities.capacity` vs `activities.max_participants`: konsolidieren auf `capacity`

---

## 3. Plan: Dev-Umgebung (Phase 2)

### 3.1 Neues Supabase-Projekt (Dev)
- Separates Supabase-Projekt erstellen
- Gleiche Tabellen-Struktur wie Live
- Seed-Daten für Tests

### 3.2 Dev-Server auf VPS
- Port 3010 (gemäß Registry)
- Domain: dev.socialy.club
- Systemd-Service: `dashboard-dev.service`
- Stripe Test-Keys
- Resend im Console-Log-Modus

### 3.3 Environment-Konfiguration
- `.env.development` und `.env.production` Templates
- Server-Start validiert Environment-Variablen
- Stripe-Key-Format wird geprüft

### 3.4 Deployment-Prozess
```
Entwickeln (lokal/Dev) → Testen auf Dev-Server → Deployen auf Live
```

---

## 4. Port-Registry

| Block | Projekt | Live | Dev | Admin |
|-------|---------|------|-----|-------|
| 3000-3009 | Urban Kids Club | :3000 | :3010 | :3001 |
| 3020-3029 | Qaama | :3020 | :3021 | :3022 |
| 3030-3039 | Content Repurposing | :3030 | :3031 | :3032 |
| 5678 | n8n | :5678 | - | - |

---

## 5. Reihenfolge

1. **Jetzt:** Bug-Fixes auf Live (Reporting, Stripe-Validierung, Schema)
2. **Danach:** Dev-Supabase-Projekt + Dev-Server einrichten
3. **Ab dann:** Alle Änderungen über Dev → Live Workflow
