// ============================================================
// OpenAPI 3.0 Spec – Auto-generiert aus Route-Definitionen
// ============================================================

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Urban Kids Club – Provider Dashboard API',
    description: 'REST API für die Provider SaaS-Plattform. Verwaltet Kurse, Buchungen, Finanzen und mehr.',
    version: '0.1.0',
    contact: { name: 'Urban Kids Club', email: 'api@urbankids.club' },
  },
  servers: [{ url: 'http://localhost:3000', description: 'Lokaler Entwicklungsserver' }],
  tags: [
    { name: 'Providers', description: 'Kursanbieter-Verwaltung' },
    { name: 'Activities', description: 'Kurse & Angebote' },
    { name: 'Bookings', description: 'Buchungen' },
    { name: 'Parents', description: 'Eltern & Kinder' },
    { name: 'Attendance', description: 'Anwesenheit & Check-In' },
    { name: 'Reviews', description: 'Bewertungen' },
    { name: 'Messages', description: 'Kommunikation' },
    { name: 'Waitlist', description: 'Warteliste' },
    { name: 'Coupons', description: 'Gutscheine & Rabatte' },
    { name: 'Calendar', description: 'Kalender & Zeitplanung' },
    { name: 'Trials', description: 'Probestunden' },
    { name: 'Invoices', description: 'Rechnungen' },
    { name: 'E-Invoices', description: 'E-Rechnung (ZUGFeRD/XRechnung)' },
    { name: 'Payments', description: 'Zahlungen & SEPA' },
    { name: 'Documents', description: 'Dokumente & Compliance' },
    { name: 'Seasons', description: 'Saisons & Ferien' },
    { name: 'Contracts', description: 'Honorarverträge' },
    { name: 'BuT', description: 'Bildungs- und Teilhabepaket' },
    { name: 'Widgets', description: 'Website-Einbettung' },
    { name: 'CRM', description: 'Kundenverwaltung' },
    { name: 'Notifications', description: 'Benachrichtigungen' },
    { name: 'Export', description: 'Datenexport' },
    { name: 'Reports', description: 'Berichte & Analytics' },
    { name: 'Audit', description: 'Audit-Log' },
    { name: 'Admin', description: 'Administration' },
  ],
  paths: {
    '/api/health': {
      get: { tags: ['Admin'], summary: 'Health Check', operationId: 'getHealth', responses: { '200': { description: 'OK' } } },
    },

    // --- Providers ---
    '/api/providers': {
      get: {
        tags: ['Providers'], summary: 'Alle Provider auflisten', operationId: 'listProviders',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['onboarding', 'active', 'suspended', 'archived'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Liste der Provider' } },
      },
      post: {
        tags: ['Providers'], summary: 'Provider erstellen', operationId: 'createProvider',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProvider' } } } },
        responses: { '201': { description: 'Provider erstellt' } },
      },
    },
    '/api/providers/{id}': {
      get: { tags: ['Providers'], summary: 'Provider abrufen', operationId: 'getProvider', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Provider-Daten' }, '404': { description: 'Nicht gefunden' } } },
      put: { tags: ['Providers'], summary: 'Provider aktualisieren', operationId: 'updateProvider', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Aktualisiert' } } },
    },
    '/api/providers/{id}/dashboard': {
      get: { tags: ['Reports'], summary: 'Dashboard-KPIs (11 Metriken)', operationId: 'getDashboard', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Dashboard-Zusammenfassung' } } },
    },

    // --- Activities ---
    '/api/activities/search': {
      get: {
        tags: ['Activities'], summary: 'Kurse suchen', operationId: 'searchActivities',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Freitext-Suche' },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'ageMin', in: 'query', schema: { type: 'integer' } },
          { name: 'ageMax', in: 'query', schema: { type: 'integer' } },
          { name: 'providerId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'cancelled', 'archived'] } },
        ],
        responses: { '200': { description: 'Suchergebnisse' } },
      },
    },
    '/api/activities/{id}': {
      get: { tags: ['Activities'], summary: 'Kurs-Details + verfügbare Plätze', operationId: 'getActivity', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Kurs-Daten' } } },
    },
    '/api/activities': {
      post: { tags: ['Activities'], summary: 'Kurs erstellen', operationId: 'createActivity', responses: { '201': { description: 'Erstellt' } } },
    },
    '/api/activities/{id}/publish': {
      post: { tags: ['Activities'], summary: 'Kurs veröffentlichen', operationId: 'publishActivity', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Veröffentlicht' } } },
    },
    '/api/activities/{id}/duplicate': {
      post: { tags: ['Activities'], summary: 'Kurs duplizieren', operationId: 'duplicateActivity', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Duplikat erstellt' } } },
    },

    // --- Bookings ---
    '/api/bookings': {
      post: {
        tags: ['Bookings'], summary: 'Buchung erstellen (mit Validierung, Coupon, Notification)', operationId: 'createBooking',
        description: 'Erstellt eine Buchung mit vollständiger Validierung: Alter, Doppelbuchung, Kapazität, Zeitkonflikte. Optional mit Gutscheincode.',
        responses: { '201': { description: 'Buchung erstellt' }, '400': { description: 'Validierungsfehler' } },
      },
    },
    '/api/bookings/{id}/cancel': {
      post: { tags: ['Bookings'], summary: 'Buchung stornieren (mit Warteliste-Nachrücken)', operationId: 'cancelBooking', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Storniert' } } },
    },

    // --- Trials ---
    '/api/trials': {
      post: { tags: ['Trials'], summary: 'Probestunde buchen', operationId: 'createTrial', responses: { '201': { description: 'Probestunde erstellt' } } },
    },
    '/api/trials/{id}/convert': {
      post: { tags: ['Trials'], summary: 'Probestunde → Buchung konvertieren', operationId: 'convertTrial', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Konvertiert' } } },
    },

    // --- Invoices ---
    '/api/invoices/from-booking/{bookingId}': {
      post: { tags: ['Invoices'], summary: 'Rechnung aus Buchung erstellen (GoBD-konform)', operationId: 'createInvoiceFromBooking', parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Rechnung erstellt' } } },
    },
    '/api/einvoices/generate': {
      post: { tags: ['E-Invoices'], summary: 'E-Rechnung generieren (ZUGFeRD oder XRechnung)', operationId: 'generateEInvoice', responses: { '201': { description: 'E-Rechnung generiert' } } },
    },

    // --- Calendar ---
    '/api/providers/{providerId}/calendar': {
      get: {
        tags: ['Calendar'], summary: 'Kalender + Konflikte für Zeitraum', operationId: 'getCalendar',
        parameters: [
          { name: 'providerId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'start', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'end', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Events + Konflikte' } },
      },
    },

    // --- Contracts ---
    '/api/contracts/{id}/risk': {
      get: { tags: ['Contracts'], summary: 'Scheinselbständigkeit-Risikoanalyse', operationId: 'assessFreelanceRisk', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Risikoanalyse mit Score, Indikatoren, Empfehlungen' } } },
    },

    // --- Holidays ---
    '/api/holidays/bundeslaender': {
      get: { tags: ['Seasons'], summary: 'Verfügbare Bundesländer mit Ferienterminen', operationId: 'listBundeslaender', responses: { '200': { description: 'Alle 16 Bundesländer' } } },
    },

    // --- Reports ---
    '/api/providers/{providerId}/reports/revenue/{period}': {
      get: {
        tags: ['Reports'], summary: 'Umsatz-Report (Quartal, Monat, Jahr)', operationId: 'getRevenueReport',
        parameters: [
          { name: 'providerId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'period', in: 'path', required: true, schema: { type: 'string' }, description: 'z.B. 2026-Q1, 2026-03, 2026' },
        ],
        responses: { '200': { description: 'Umsatz-Report' } },
      },
    },
    '/api/providers/{providerId}/reports/clv': {
      get: { tags: ['Reports'], summary: 'Customer Lifetime Value', operationId: 'getCLV', parameters: [{ name: 'providerId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'CLV-Analyse' } } },
    },
    '/api/providers/{providerId}/reports/churn': {
      get: { tags: ['Reports'], summary: 'Churn Rate', operationId: 'getChurnRate', parameters: [{ name: 'providerId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'months', in: 'query', schema: { type: 'integer', default: 3 } }], responses: { '200': { description: 'Churn-Analyse' } } },
    },

    // --- Export ---
    '/api/providers/{providerId}/export': {
      post: { tags: ['Export'], summary: 'Daten exportieren (CSV, DATEV, JSON)', operationId: 'createExport', parameters: [{ name: 'providerId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Export-Ergebnis' } } },
    },

    // --- Admin ---
    '/api/admin/jobs/daily': {
      post: { tags: ['Admin'], summary: 'Tägliche Background-Jobs auslösen', operationId: 'runDailyJobs', description: 'Prüft: Wartelisten-Expiry, überfällige Rechnungen, ablaufende Dokumente, Erinnerungen', responses: { '200': { description: 'Job-Ergebnis' } } },
    },
    '/api/admin/jobs/weekly': {
      post: { tags: ['Admin'], summary: 'Wöchentliche Background-Jobs auslösen', operationId: 'runWeeklyJobs', description: 'Prüft: Zahlungserinnerungen für unbezahlte Buchungen (>7 Tage)', responses: { '200': { description: 'Job-Ergebnis' } } },
    },
  },
  components: {
    schemas: {
      CreateProvider: {
        type: 'object',
        required: ['name', 'description', 'address', 'contact', 'categories'],
        properties: {
          name: { type: 'string', example: 'Tanzstudio Rhythmuskinder' },
          description: { type: 'string' },
          address: { type: 'object', properties: { street: { type: 'string' }, city: { type: 'string' }, zip: { type: 'string' }, country: { type: 'string' } } },
          contact: { type: 'object', properties: { email: { type: 'string', format: 'email' }, phone: { type: 'string' }, website: { type: 'string' } } },
          categories: { type: 'array', items: { type: 'string' } },
          subscription: { type: 'string', enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
        },
      },
    },
  },
}
