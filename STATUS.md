# V2-Sandbox · Status nach autonomer Session vom 2026-04-25

Schicke Zusammenfassung was in den letzten paar Stunden passiert ist, und was du anschauen solltest wenn du zurück bist.

## Was du dir live ansehen kannst

### Provider-Dashboard
- **KI-Assistent vertieft** — du hattest ihn als „dünn" markiert. Jetzt hat die Seite ein Activity-Feed (was Kira die Woche gemacht hat), ROI-Panel (14,2 h gespart, 510 € equivalent), Live-Chat-Demo mit 4 Mock-Konversationen, und Plan-Vergleich Free/Pro/Studio Pro+.
  → https://v2.urbankids.club/ki-assistent-preview

### Eltern-Portal (Socialy-Brand)
- **Zwei neue Tabs**: Postfach (eigene Inbox-Sicht der Mama mit Quick-Reply-Pills) und Buchungen (Historie mit Anwesenheit, Add-Ups, Bewertungen). Tab-Order ist jetzt: Meine Kurse → Postfach → Buchungen → Guthaben → Empfehlungen.
  → https://v2.urbankids.club/portal-preview

### PWA-Schicht (white-label per Provider)
- **3 Demo-Provider live**: Socialy, UKC, Tanzschule Mitte. Manifest, Icons, Service Worker werden dynamisch generiert pro Slug.
- **Datenschutz-Seite** dazu (DSGVO-konform, klare Sprache, Phase-1 vs Phase-2 erklärt).
  → Übersicht: https://v2.urbankids.club/portal-pwa-demo
  → Privacy: https://v2.urbankids.club/portal-pwa-privacy
  → Install-Guide: https://v2.urbankids.club/portal/socialy/install

## Phase-2 Backend (READY-BUT-INACTIVE)

Hier ist Code deployed der die Federation-Architektur umsetzt — aber **nicht** mit Production-Daten verbunden ist. Du kannst ihn mit Demo-Daten testen.

### Magic-Link Auth funktioniert (Dev-Mode)
```bash
# Token issuen
curl -X POST https://v2.urbankids.club/api/parent/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"hannah.b@example.com","providerId":"socialy"}'
# → returns devUrl + devToken (weil NODE_ENV != production)

# Token konsumieren (= login)
curl -c cookies.txt "https://v2.urbankids.club/portal/socialy/auth?token=<TOKEN>"

# Eingeloggt prüfen
curl -b cookies.txt https://v2.urbankids.club/api/parent/me
```

**Demo-Eltern im In-Memory-Stub:**
- `hannah.b@example.com` — bei Socialy + Tanzschule Mitte (Federation-Demo)
- `lisa.k@example.com` — nur bei Socialy

### Was sich noch im Stub befindet

| Component | Stub-Storage | Wechselt zu Supabase wenn... |
|-----------|--------------|------------------------------|
| `parent.service.ts` | In-Memory Map | Migration 006 angewendet |
| `magic-link.service.ts` | In-Memory Array | gleiche Migration |
| `push.service.ts` | In-Memory Map | Migration 007 (TODO) + VAPID-Keys gesetzt |

### Was destruktiv wäre und auf dein OK wartet

1. **Migration 006 anwenden** — `data/migrations/006_parent_federation.sql`
   - Erstellt `parents`, `parent_provider_links`, `children`, `parent_magic_links`
   - Aktiviert Row-Level-Security
   - **Lockt das alte `customers` Schema NICHT** — alte Tabellen bleiben als `customers_legacy` erhalten
2. **Backfill ausführen** — `src/api/backfill_parents.ts`
   - Default = `--dry`. Erst mit `--apply` werden Daten geschrieben.
   - `tsx backfill_parents.ts --dry` zum Vorausschauen
   - `tsx backfill_parents.ts --apply` (nur nach 006-Apply)
3. **Repos auf Supabase swappen** — `getParentRepo()` und `getRepo()` in den Service-Files austauschen, ein Adapter pro Service.
4. **VAPID-Keys generieren** für Push (siehe Doku in `push.service.ts`)

Mein Vorschlag wenn du bereit bist: erstmal 006 in einer Test-Branch anwenden, Backfill mit `--dry` laufen lassen, Output checken, dann `--apply` mit kleinem `--limit 50` zum Stichproben-Test.

## Files geändert / neu

### Server (TypeScript, alle in `src/api/`)
- `portal-pwa.ts` (existed) — Provider-Branding-Registry, dynamische Manifest/SW/Icons
- `parent.service.ts` (neu) — Federation interface + In-Memory adapter
- `magic-link.service.ts` (neu) — Token issue/consume mit Hash + TTL + Rate-Limit
- `parent-auth-routes.ts` (neu) — `/api/parent/magic-link`, `/api/parent/me`, `/api/parent/logout`
- `push.service.ts` (neu) — VAPID scaffold, subscribe/unsubscribe routes
- `backfill_parents.ts` (neu) — CLI tool für Customer→Parent Migration
- `server.ts` — async handler + dispatcher injections (handleParentAuth + handlePushRoutes + handlePortalPwa)

### Frontend / Widgets
- `widgets/ki-assistent-preview.html` — enrichment via `enrich_ki_page.py`
- `widgets/portal-preview.html` — 2 neue Tab-Panels via `extend_portal_tabs.py`
- `widgets/portal-pwa-demo.html` — neu, Architektur-Übersicht mit 3 Provider
- `widgets/portal-pwa-install.html` — neu, iOS/Android Anleitung
- `widgets/portal-pwa-privacy.html` — neu, DSGVO-Seite
- `frontend/portal-pwa-banner.js` — Install-Banner clientseitig

### Migrations / Schema
- `data/migrations/006_parent_federation.sql` — **deployed, not applied**

### Memory
- `project_ukc_pwa_federation.md` — Hybrid B/C decision dokumentiert

## Was ich bewusst NICHT gemacht habe

- Migration 006 nicht angewendet (destruktiv, braucht dein OK)
- Push-Notification VAPID-Keys nicht generiert (aktiviert externes Versenden)
- Backfill nicht ausgeführt (touched alte `customers`)
- Federation-Master-View (`/portal/ukc` als „alle Studios") nicht aktiviert — `UKC_FEDERATION_ENABLED` env flag bleibt false. Bis du den B2C-Pivot ziehen willst.
- Kein `force-push`, keine destruktiven git-Operationen
- Live-Dashboards (root-domain `v2.urbankids.club`) nicht touched — V2-Sandbox bleibt isoliert auf den `*-preview` Routen

## Smoke-Test Ergebnis

```
postfach          200   /portal/socialy/manifest.json    200
ki-assistent      200   /portal/socialy/sw.js            200
integrationen     200   /portal/socialy/icons/icon.svg   200
raeume            200   /portal/socialy/icons/apple.svg  200
credits           200   /api/parent/magic-link          200 (returns devUrl)
anwesenheit       200   /api/parent/me (no cookie)      401 (correct)
portal            200   /api/parent/me (with cookie)    200 (returns parent JSON)
portal-pwa-demo   200   /api/parent/logout               200
privacy           200   /api/parent/push/public-key      503 (VAPID not set, correct)
```

## Wenn du loslegen willst

Empfohlene Reihenfolge:
1. KI-Seite + Portal-Tabs durchklicken — sind die Inhalte Ton-treffer?
2. Eine PWA auf dein Phone installieren (Safari → Teilen → Zum Home-Bildschirm bei https://v2.urbankids.club/portal/socialy)
3. Privacy-Page durchlesen — was fehlt für deine Vorstellung?
4. Magic-Link mit `lisa.k@example.com` testen (curl-snippet oben)
5. Schema 006 anschauen (`data/migrations/006_parent_federation.sql`)
6. Wenn alles passt: über Schema-Apply + Backfill-Strategie reden

## Offene Punkte für nächste Session

- VAPID-Keys generieren + Push-Permission-Flow im Banner
- Migration 007 für `parent_push_subscriptions` schreiben
- Email-Versand für Magic-Links (aktuell: dev-only return)
- Real Provider-Logos statt SVG-Letter (per-provider PNG-Upload-Form?)
- Federation-Master-View UI (für Phase 2)
- Apple-Touch-Icon Provider-spezifisch als echtes 180×180 PNG (aktuell: SVG, iOS rasterisiert es)
