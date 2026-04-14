# Checkout & Buchungsflow — Design Spec

## Ziel

Eltern koennen ueber den eingebetteten Kalender-Widget direkt Kurse buchen und bezahlen. Provider verwalten Buchungen, Zahlungen und Stornierungen im Dashboard.

---

## 1. Zahlungsanbieter (Provider-Einstellungen)

### Stripe Connect
- OAuth-Flow: Provider klickt "Stripe verbinden" in Einstellungen > Steuern & Finanzen
- Weiterleitung zu Stripe Connect Onboarding
- Nach Rueckkehr: `stripe_account_id` wird am Provider gespeichert
- Gruener Badge "Stripe verbunden" mit Konto-Info

### PayPal Connect
- Provider gibt PayPal Client ID + Secret ein (oder OAuth wenn verfuegbar)
- `paypal_client_id` und `paypal_secret` werden am Provider gespeichert
- Gruener Badge "PayPal verbunden"

### Regeln
- Mindestens Stripe ODER PayPal muss verbunden sein, damit ein Kurs mit "Online bezahlen" erstellt werden kann
- Wenn keins verbunden: Kurs kann nur mit "Vor Ort bezahlen" erstellt werden
- Validierung beim Kurs-Speichern: wenn "Online bezahlen" aktiv aber kein Zahlungsanbieter verbunden → Fehlermeldung

---

## 2. Kurs-Einstellungen (pro Kurs)

Neue Felder im Kurs-Editor (bei Preisgestaltung):

- **Checkbox: "Online bezahlen"** — nur aktivierbar wenn Stripe oder PayPal verbunden
- **Checkbox: "Vor Ort bezahlen"** — immer aktivierbar
- Mindestens eine Option muss aktiv sein
- Default fuer neue Kurse: "Vor Ort bezahlen" aktiv

---

## 3. Stornierungsbedingungen (Provider-Einstellungen)

Neuer Abschnitt in Einstellungen > Rechtliches:

- **Stornierungsgebuehr Typ**: Dropdown
  - Fester Betrag (z.B. 20 EUR)
  - Prozentual (z.B. 25%)
- **Stornierungsgebuehr Wert**: Eingabefeld (Betrag oder Prozent)
- **Stornierungsfrist**: X Stunden/Tage vor Kursbeginn (z.B. 48 Stunden)
- **Storno-Text**: Freitext der im Checkout angezeigt wird (z.B. "Bei Nichterscheinen ohne Stornierung wird eine Gebuehr von 30 EUR erhoben.")

---

## 4. Embed-Kalender Checkout-Flow

### Schritt 1: Daten eingeben
Formular im Embed-Widget (nach Klick auf "Buchen"):

**Kinddaten:**
- Vorname (Pflicht)
- Nachname (Pflicht)
- Geburtsjahr (Pflicht, Dropdown oder Zahleneingabe)

**Elterndaten:**
- Vorname (Pflicht)
- Nachname (Pflicht)
- E-Mail (Pflicht)
- Telefon (Pflicht)

### Schritt 2: Zahlungsart waehlen
- Nur angezeigt wenn Kurs sowohl "Online" als auch "Vor Ort" erlaubt
- Wenn nur "Online": direkt zu Schritt 3
- Wenn nur "Vor Ort": direkt zu Schritt 3 (kein Payment noetig)
- Optionen:
  - "Jetzt online bezahlen" (zeigt Stripe/PayPal Icons)
  - "Vor Ort bezahlen"

### Schritt 3: AGB & Stornierung
- Checkbox: "Ich stimme den AGB zu" (Pflicht, Link zu AGB des Providers)
- Checkbox: "Ich akzeptiere die Stornierungsbedingungen: [Storno-Text]" (Pflicht)
- Button: "Kostenpflichtig buchen" (bei Online) oder "Verbindlich buchen" (bei Vor Ort)

### Schritt 4: Zahlung
- **Stripe**: Redirect zu Stripe Checkout Session (gehostet auf stripe.com)
  - Erfolgs-URL: `/embed/{slug}/booking-success?session_id={CHECKOUT_SESSION_ID}`
  - Abbruch-URL: `/embed/{slug}/calendar`
- **PayPal**: Redirect zu PayPal Checkout
  - Gleiche Erfolgs/Abbruch-URLs

### Schritt 5: Bestaetigung
- Bestatigungsseite im Embed: Gruener Haken, Buchungsdetails
- Kursname, Datum/Zeit, Kindname, Zahlungsstatus
- "Sie erhalten eine Bestaetigung per E-Mail"
- **Wichtig**: Diese Seite bekommt spaeter Pixel-Support (Conversion Tracking)

---

## 5. Backend-Architektur

### Neue DB-Tabellen

**provider_payment_config:**
- provider_id (FK)
- stripe_account_id (nullable)
- stripe_connected (boolean)
- paypal_client_id (nullable)
- paypal_secret (encrypted, nullable)
- paypal_connected (boolean)

**cancellation_policy:**
- provider_id (FK)
- fee_type: 'fixed' | 'percentage'
- fee_value: number
- deadline_hours: number
- custom_text: text

Erweitere **activities** Tabelle:
- payment_online: boolean (default false)
- payment_onsite: boolean (default true)

Erweitere **bookings** Tabelle:
- payment_method: 'stripe' | 'paypal' | 'onsite' | null
- payment_status: 'paid' | 'pending' | 'refunded' | 'failed'
- stripe_session_id: text (nullable)
- paypal_order_id: text (nullable)

### Neue API-Endpoints

**Payment Config (auth required):**
- GET /api/providers/:id/payment-config
- PUT /api/providers/:id/payment-config
- POST /api/providers/:id/stripe-connect (initiiert OAuth)
- GET /api/stripe/callback (OAuth Rueckkehr)

**Public Checkout (kein Auth):**
- POST /api/checkout/create-session
  - Input: { slug, activityId, blockId, child, parent, paymentMethod }
  - Erstellt Stripe/PayPal Session ODER direkte Buchung (bei Vor Ort)
  - Returns: { redirectUrl } oder { bookingId }

**Webhooks:**
- POST /api/webhooks/stripe — Stripe Event Handler
  - checkout.session.completed → Buchung erstellen/bestaetigen
- POST /api/webhooks/paypal — PayPal IPN/Webhook
  - CHECKOUT.ORDER.APPROVED → Buchung erstellen/bestaetigen

**Cancellation Policy:**
- GET /api/providers/:id/cancellation-policy
- PUT /api/providers/:id/cancellation-policy

### Buchungserstellung nach Zahlung

Nach erfolgreichem Payment (Webhook oder Vor-Ort):
1. Parent-Record erstellen/finden (by email)
2. Child-Record erstellen (verknuepft mit Parent)
3. Booking erstellen (verknuepft mit Activity, Block, Child)
4. Block-Enrollment erstellen
5. Payment-Record erstellen
6. Bestaetgungs-Email senden (spaeter)

---

## 6. Provider-Dashboard Aenderungen

### Buchungen-Seite
- Neue Spalte: "Zahlungsart" mit Icons (Stripe-Logo, PayPal-Logo, "Vor Ort")
- Filter nach Zahlungsart
- Status-Badges: "Bezahlt" (gruen), "Ausstehend" (gelb), "Storniert" (rot)

### Einstellungen > Steuern & Finanzen
- Neuer Bereich: "Zahlungsanbieter"
  - Stripe Connect Button + Status
  - PayPal Credentials + Status
- Neuer Bereich: "Stornierungsbedingungen"
  - Gebuehrentyp, Wert, Frist, Text

### Kurs-Editor
- Neue Checkboxen bei Preisgestaltung: "Online bezahlen" / "Vor Ort bezahlen"
- Validierung: Online nur wenn Zahlungsanbieter verbunden

---

## 7. Technische Abhaengigkeiten

- **stripe** npm Package (Stripe Node.js SDK)
- **@paypal/checkout-server-sdk** oder direkte REST API
- Stripe Account: Platform-Account fuer Stripe Connect (Urban Kids Club)
- Stripe Connect: Standard oder Express Accounts fuer Provider
- Environment Variables:
  - STRIPE_SECRET_KEY (Platform)
  - STRIPE_WEBHOOK_SECRET
  - STRIPE_CONNECT_CLIENT_ID

---

## 8. Nicht im Scope (spaeter)

- Conversion Pixel auf Bestaetigungsseite
- E-Mail-Bestaetigungen
- Automatische Stornierungsgebuehr-Einzug
- Gutschein-Codes im Checkout
- Ratenzahlung
- Auto-Slide Kursblock Feature (separates n8n-Projekt)
