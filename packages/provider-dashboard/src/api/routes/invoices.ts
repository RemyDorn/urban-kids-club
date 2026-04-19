// ============================================================
// Invoices, E-Invoices, Payments & SEPA Routes
// ============================================================

import { Router } from '../router'
import { validate, CreateInvoiceSchema, GenerateEInvoiceSchema, CreatePaymentSchema, CreateSepaMandateSchema } from '../../lib/schemas'
import { requireAuth, checkPermission } from '../../lib/auth-middleware'
import { getServiceClient } from '../../lib/supabase'
import { InvoiceService, EInvoiceService, PaymentService, SepaMandateService } from '../../services'
import { safeParseInt, escHtml } from './helpers'

export function registerInvoiceRoutes(router: Router) {

  // ============================================================
  // INVOICES
  // ============================================================

  router.get('/api/providers/:providerId/invoices', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoices = await InvoiceService.listByProvider(auth.providerId, {
      status: req.query.status as any,
    })
    res.json({ data: invoices })
  })

  router.post('/api/invoices', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'invoices', 'create')) return
    const parsed = validate(CreateInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await InvoiceService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/from-booking/:bookingId', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const vatRate = req.body?.vatRate !== undefined ? Number(req.body.vatRate) : undefined
    const result = await (InvoiceService as any).createFromBooking(req.params.bookingId, auth.providerId, vatRate)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/invoices/:id/send', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    if (!checkPermission(auth, res, 'invoices', 'send')) return
    const invoice = await InvoiceService.send(req.params.id, auth.providerId)
    if (!invoice) return res.error(400, 'Rechnung konnte nicht versendet werden')
    res.json({ data: invoice })
  })

  router.post('/api/invoices/:id/pay', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoice = await InvoiceService.markPaid(req.params.id, auth.providerId)
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')
    res.json({ data: invoice })
  })

  router.post('/api/invoices/:id/cancel', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const invoice = await InvoiceService.cancel(req.params.id, auth.providerId)
    if (!invoice) return res.error(400, 'Rechnung konnte nicht storniert werden (bereits bezahlt oder nicht gefunden)')
    res.json({ data: invoice })
  })

  router.get('/api/providers/:providerId/invoices/outstanding', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const outstanding = await InvoiceService.getOutstandingTotal(auth.providerId)
    res.json({ data: outstanding })
  })

  // Invoice PDF view (renders HTML template for printing)
  // Requires either: (a) valid auth token, or (b) HMAC signature in ?token= query param
  router.get('/api/invoices/:id/view', async (req, res) => {
    const db = getServiceClient()
    const invoiceId = req.params.id

    // Check access: try multiple auth methods in sequence
    const queryToken = req.query?.token as string | undefined
    let hasAccess = false
    let authProviderId: string | undefined

    if (queryToken) {
      // Method 1: HMAC view token (32 chars, from emailed invoice link)
      if (!hasAccess && queryToken.length === 32) {
        const { createHmac } = await import('node:crypto')
        const secret = process.env.INVOICE_VIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        if (secret) {
          const expected = createHmac('sha256', secret).update(invoiceId).digest('hex').slice(0, 32)
          hasAccess = (queryToken === expected)
        }
      }

      // Method 2: Parent session token (64 chars hex, from portal)
      if (!hasAccess && queryToken.length === 64 && /^[0-9a-f]+$/i.test(queryToken)) {
        const { data: session } = await db.from('parent_sessions')
          .select('parent_id, expires_at').eq('session_token', queryToken).maybeSingle()
        if (session && new Date(session.expires_at) > new Date()) {
          hasAccess = true
        }
      }

      // Method 3: Supabase JWT (200+ chars, from dashboard "view invoice" button)
      if (!hasAccess && queryToken.length > 100) {
        try {
          const { supabase: sbClient } = await import('../../lib/supabase')
          const { data: { user } } = await sbClient.auth.getUser(queryToken)
          if (user?.email) {
            const svc = getServiceClient()
            const { data: prov } = await svc.from('providers').select('id').eq('login_email', user.email).maybeSingle()
            if (prov) { hasAccess = true; authProviderId = prov.id }
          }
        } catch { /* invalid JWT */ }
      }
    }

    // Method 4: Authorization header (provider JWT)
    if (!hasAccess) {
      try {
        const auth = await (await import('../../lib/auth-middleware')).authenticateRequest(req as any)
        if (auth) { hasAccess = true; authProviderId = auth.providerId }
      } catch { /* not authenticated */ }
    }

    if (!hasAccess) return res.error(403, 'Kein Zugriff — bitte anmelden oder gültigen Link verwenden')

    const { data: invoice } = await db.from('invoices').select('*').eq('id', invoiceId).maybeSingle()
    if (!invoice) return res.error(404, 'Rechnung nicht gefunden')

    const { data: provider } = await db.from('providers').select('id, name, display_name, company_name, legal_form, address_street, address_zip, address_city, email, phone, tax_id, vat_id, kleinunternehmer, bank_holder, bank_iban, bank_bic, logo_url').eq('id', invoice.provider_id).single()
    const { data: parent } = await db.from('parents').select('id, name, email, street, zip, city').eq('id', invoice.parent_id).single()

    const lineItems = (invoice.line_items || []) as Array<{ description: string; quantity: number; unitPrice: number; vatRate: number; total: number; netAmount?: number; vatAmount?: number }>
    const isKleinunternehmer = provider?.kleinunternehmer || false
    const vatPercent = isKleinunternehmer ? 0 : Math.round((lineItems[0]?.vatRate || 0.19) * 100)

    const fmt = (n: number) => Number(n).toFixed(2).replace('.', ',')
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('de-DE') : ''
    const statusLabels: Record<string, string> = { draft: 'Entwurf', sent: 'Versendet', paid: 'Bezahlt', overdue: 'Überfällig', cancelled: 'Storniert' }

    const lineItemsHtml = lineItems.map((item, i) => {
      const vatRate = item.vatRate ?? 0.19
      const brutto = item.total ?? 0
      const net = item.netAmount ?? (vatRate > 0 ? Math.round(brutto / (1 + vatRate) * 100) / 100 : brutto)
      return `<tr><td>${i + 1}</td><td>${escHtml(item.description)}</td><td>${fmt(item.unitPrice)} &euro;</td><td>${isKleinunternehmer ? 'entf.' : (Math.round(vatRate * 100) + '%')}</td><td>${fmt(net)} &euro;</td><td>${fmt(brutto)} &euro;</td></tr>`
    }).join('')

    // Read template and replace placeholders
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    let template: string
    try {
      template = await fs.readFile(path.join(currentDir, '../../frontend/invoice-template.html'), 'utf-8')
    } catch {
      // Fallback: try relative to cwd
      template = await fs.readFile(path.resolve('src/frontend/invoice-template.html'), 'utf-8')
    }

    // Escape all user-controlled values to prevent XSS in invoice HTML
    const e = escHtml
    const replacements: Record<string, string> = {
      '{{invoiceNumber}}': e(invoice.number),
      '{{invoiceDate}}': e(fmtDate(invoice.issued_at)),
      '{{dueDate}}': e(fmtDate(invoice.due_date)),
      '{{status}}': e(statusLabels[invoice.status] || invoice.status),
      '{{providerName}}': e(provider?.company_name || ''),
      '{{providerLegalForm}}': e(provider?.legal_form || ''),
      '{{providerStreet}}': e(provider?.address_street || ''),
      '{{providerZip}}': e(provider?.address_zip || ''),
      '{{providerCity}}': e(provider?.address_city || ''),
      '{{providerEmail}}': e(provider?.email || ''),
      '{{providerPhone}}': e(provider?.phone || ''),
      '{{providerTaxId}}': e(provider?.tax_id || ''),
      '{{providerVatId}}': e(provider?.vat_id || ''),
      '{{logoUrl}}': e(provider?.logo_url || ''),
      '{{parentName}}': e(parent?.name || ''),
      '{{parentEmail}}': e(parent?.email || ''),
      '{{lineItemsHtml}}': lineItemsHtml,
      '{{subtotal}}': fmt(invoice.subtotal),
      '{{tax}}': fmt(invoice.tax),
      '{{total}}': fmt(invoice.total),
      '{{vatPercent}}': String(vatPercent),
      '{{bankHolder}}': e(provider?.bank_holder || provider?.company_name || ''),
      '{{bankIban}}': e(provider?.bank_iban || ''),
      '{{bankBic}}': e(provider?.bank_bic || ''),
    }

    // Handle conditional blocks
    for (const [key, val] of Object.entries(replacements)) {
      template = template.replaceAll(key, val)
    }

    // Handle {{#if ...}} blocks (with optional {{else}}) — non-greedy, one block at a time
    const ifBlock = (flag: boolean, name: string) => {
      // Process each occurrence individually to avoid greedy cross-block matching
      let result = template
      const openTag = `{{#if ${name}}}`
      const closeTag = `{{/if}}`
      const elseTag = `{{else}}`
      let idx = result.indexOf(openTag)
      while (idx !== -1) {
        const afterOpen = idx + openTag.length
        // Find the NEXT {{/if}} (not a distant one)
        const closeIdx = result.indexOf(closeTag, afterOpen)
        if (closeIdx === -1) break
        const inner = result.substring(afterOpen, closeIdx)
        const elseIdx = inner.indexOf(elseTag)
        let replacement = ''
        if (elseIdx !== -1) {
          replacement = flag ? inner.substring(0, elseIdx) : inner.substring(elseIdx + elseTag.length)
        } else {
          replacement = flag ? inner : ''
        }
        result = result.substring(0, idx) + replacement + result.substring(closeIdx + closeTag.length)
        idx = result.indexOf(openTag)
      }
      template = result
    }
    ifBlock(!!provider?.logo_url, 'logoUrl')
    ifBlock(isKleinunternehmer, 'isKleinunternehmer')
    ifBlock(!!provider?.tax_id, 'providerTaxId')
    ifBlock(!!provider?.vat_id, 'providerVatId')
    ifBlock(!!provider?.bank_holder, 'bankHolder')
    ifBlock(!!provider?.bank_iban, 'bankIban')
    ifBlock(!!provider?.bank_bic, 'bankBic')

    res.html(template)
  })

  router.get('/api/providers/:providerId/invoices/vat-summary/:year', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const year = safeParseInt(req.params.year, new Date().getFullYear())
    const summary = await InvoiceService.getVatSummary(auth.providerId, year)
    res.json({ data: summary })
  })

  // ============================================================
  // E-INVOICES
  // ============================================================

  router.post('/api/einvoices/generate', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(GenerateEInvoiceSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await EInvoiceService.generate(parsed.data as any)
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.get('/api/invoices/:invoiceId/einvoice', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const eInvoice = await EInvoiceService.getByInvoice(req.params.invoiceId)
    if (!eInvoice) return res.error(404, 'Keine E-Rechnung vorhanden')
    res.json({ data: eInvoice })
  })

  // ============================================================
  // PAYMENTS & SEPA
  // ============================================================

  router.get('/api/providers/:providerId/payments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payments = await PaymentService.listByProvider(auth.providerId, {
      method: req.query.method as any,
      status: req.query.status,
    })
    res.json({ data: payments })
  })

  router.post('/api/payments', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreatePaymentSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const result = await PaymentService.create({ ...parsed.data as any, providerId: auth.providerId })
    if ('error' in result) return res.error(400, result.error)
    res.status(201).json({ data: result })
  })

  router.post('/api/payments/:id/complete', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payment = await PaymentService.markCompleted(req.params.id, auth.providerId)
    if (!payment) return res.error(400, 'Zahlung konnte nicht abgeschlossen werden')
    res.json({ data: payment })
  })

  router.get('/api/providers/:providerId/payments/summary', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const summary = await PaymentService.getRevenueSummary(auth.providerId)
    res.json({ data: summary })
  })

  router.post('/api/providers/:providerId/sepa/collect', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const payments = await PaymentService.runSepaCollection(auth.providerId)
    res.json({ data: payments, count: payments.length })
  })

  router.get('/api/providers/:providerId/sepa/mandates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const mandates = await SepaMandateService.listByProvider(auth.providerId)
    res.json({ data: mandates })
  })

  router.post('/api/sepa/mandates', async (req, res) => {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const parsed = validate(CreateSepaMandateSchema, req.body)
    if ('error' in parsed) return res.error(400, parsed.error)
    const mandate = await SepaMandateService.create({ ...parsed.data as any, providerId: auth.providerId })
    res.status(201).json({ data: mandate })
  })
}
