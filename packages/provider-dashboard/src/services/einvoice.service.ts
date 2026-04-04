// ============================================================
// E-Rechnung Service – ZUGFeRD / XRechnung (Gesetzliche Pflicht)
// ============================================================
// Ab 01.01.2027: Unternehmen >800k€ Umsatz müssen E-Rechnungen stellen
// Ab 01.01.2028: ALLE Unternehmen müssen E-Rechnungen stellen (B2B)
// Formate: XRechnung (XML), ZUGFeRD (PDF/A-3 mit eingebettetem XML)
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { EInvoice, EInvoiceFormat, GoBDInvoiceData, ID } from '../types'

export interface GenerateEInvoiceInput {
  invoiceId: ID
  format: EInvoiceFormat
  leitweg_id?: string       // Für öffentliche Auftraggeber
}

export const EInvoiceService = {

  generate(input: GenerateEInvoiceInput): EInvoice | { error: string } {
    const invoice = store.state.invoices.get(input.invoiceId)
    if (!invoice) return { error: 'Rechnung nicht gefunden' }

    const provider = store.state.providers.get(invoice.providerId)
    if (!provider) return { error: 'Provider nicht gefunden' }

    const parent = store.state.parents.get(invoice.parentId)
    if (!parent) return { error: 'Kunde nicht gefunden' }

    const id = generateId('einv')
    const now = new Date()

    const eInvoice: EInvoice = {
      id,
      invoiceId: input.invoiceId,
      providerId: invoice.providerId,
      format: input.format,
      leitweg_id: input.leitweg_id,
      status: 'draft',
      generatedAt: now,
    }

    // XML-Content generieren
    if (input.format === 'xrechnung') {
      eInvoice.xmlContent = this._generateXRechnung(invoice, provider, parent)
      eInvoice.status = 'generated'
    } else if (input.format === 'zugferd') {
      eInvoice.xmlContent = this._generateZUGFeRDXML(invoice, provider, parent)
      eInvoice.status = 'generated'
    }

    store.state.eInvoices.set(id, eInvoice)
    store.indexes.eInvoicesByInvoice.set(input.invoiceId, id)
    store.addToIndex(store.indexes.eInvoicesByProvider, invoice.providerId, id)

    return eInvoice
  },

  getById(id: ID): EInvoice | undefined {
    return store.state.eInvoices.get(id)
  },

  getByInvoice(invoiceId: ID): EInvoice | undefined {
    const eInvId = store.indexes.eInvoicesByInvoice.get(invoiceId)
    return eInvId ? store.state.eInvoices.get(eInvId) : undefined
  },

  listByProvider(providerId: ID): EInvoice[] {
    const ids = store.getFromIndex(store.indexes.eInvoicesByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.eInvoices.get(id)!)
      .filter(Boolean)
      .sort((a, b) => (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0))
  },

  markSent(id: ID): EInvoice | undefined {
    const eInvoice = store.state.eInvoices.get(id)
    if (!eInvoice || eInvoice.status !== 'generated') return undefined
    eInvoice.status = 'sent'
    eInvoice.sentAt = new Date()
    return eInvoice
  },

  // GoBD-konforme Rechnungsdaten zusammenstellen
  buildGoBDData(invoiceId: ID): GoBDInvoiceData | { error: string } {
    const invoice = store.state.invoices.get(invoiceId)
    if (!invoice) return { error: 'Rechnung nicht gefunden' }

    const provider = store.state.providers.get(invoice.providerId)
    if (!provider) return { error: 'Provider nicht gefunden' }

    const parent = store.state.parents.get(invoice.parentId)
    if (!parent) return { error: 'Kunde nicht gefunden' }

    const vatRate = 0.19 // Standard-MwSt

    const lineItems = invoice.lineItems.map((item) => {
      const netAmount = item.total
      const vatAmount = Math.round(netAmount * vatRate * 100) / 100
      const grossAmount = Math.round((netAmount + vatAmount) * 100) / 100

      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate,
        netAmount,
        vatAmount,
        grossAmount,
      }
    })

    const netTotal = lineItems.reduce((sum, item) => sum + item.netAmount, 0)
    const vatTotal = lineItems.reduce((sum, item) => sum + item.vatAmount, 0)

    return {
      providerName: provider.name,
      providerAddress: provider.address,
      providerTaxId: '', // Muss vom Provider hinterlegt werden
      customerName: parent.name,
      customerAddress: { street: '', city: '', zip: '', country: 'DE' },
      invoiceNumber: invoice.number,
      invoiceDate: invoice.issuedAt,
      lineItems,
      netTotal,
      vatBreakdown: [{ rate: vatRate, net: netTotal, vat: vatTotal }],
      grossTotal: Math.round((netTotal + vatTotal) * 100) / 100,
      paymentTerms: `Zahlbar innerhalb von 14 Tagen`,
    }
  },

  // XRechnung XML generieren (EN 16931 / UBL 2.1)
  _generateXRechnung(
    invoice: { number: string; issuedAt: Date; dueDate: Date; lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>; total: number; currency: string },
    provider: { name: string; address: { street: string; city: string; zip: string; country: string }; contact: { email: string } },
    parent: { name: string; email: string }
  ): string {
    const dateStr = invoice.issuedAt.toISOString().split('T')[0]
    const dueDateStr = invoice.dueDate.toISOString().split('T')[0]

    // Vereinfachte XRechnung (UBL Invoice)
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
      '             xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
      '             xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
      `  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>`,
      `  <cbc:ID>${invoice.number}</cbc:ID>`,
      `  <cbc:IssueDate>${dateStr}</cbc:IssueDate>`,
      `  <cbc:DueDate>${dueDateStr}</cbc:DueDate>`,
      `  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>`,
      `  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>`,
      `  <cac:AccountingSupplierParty>`,
      `    <cac:Party>`,
      `      <cac:PartyName><cbc:Name>${this._escapeXml(provider.name)}</cbc:Name></cac:PartyName>`,
      `      <cac:PostalAddress>`,
      `        <cbc:StreetName>${this._escapeXml(provider.address.street)}</cbc:StreetName>`,
      `        <cbc:CityName>${this._escapeXml(provider.address.city)}</cbc:CityName>`,
      `        <cbc:PostalZone>${provider.address.zip}</cbc:PostalZone>`,
      `        <cac:Country><cbc:IdentificationCode>${provider.address.country}</cbc:IdentificationCode></cac:Country>`,
      `      </cac:PostalAddress>`,
      `      <cac:Contact><cbc:ElectronicMail>${provider.contact.email}</cbc:ElectronicMail></cac:Contact>`,
      `    </cac:Party>`,
      `  </cac:AccountingSupplierParty>`,
      `  <cac:AccountingCustomerParty>`,
      `    <cac:Party>`,
      `      <cac:PartyName><cbc:Name>${this._escapeXml(parent.name)}</cbc:Name></cac:PartyName>`,
      `    </cac:Party>`,
      `  </cac:AccountingCustomerParty>`,
      `  <cac:LegalMonetaryTotal>`,
      `    <cbc:PayableAmount currencyID="${invoice.currency}">${invoice.total.toFixed(2)}</cbc:PayableAmount>`,
      `  </cac:LegalMonetaryTotal>`,
      ...invoice.lineItems.map((item, i) => [
        `  <cac:InvoiceLine>`,
        `    <cbc:ID>${i + 1}</cbc:ID>`,
        `    <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>`,
        `    <cbc:LineExtensionAmount currencyID="${invoice.currency}">${item.total.toFixed(2)}</cbc:LineExtensionAmount>`,
        `    <cac:Item><cbc:Name>${this._escapeXml(item.description)}</cbc:Name></cac:Item>`,
        `    <cac:Price><cbc:PriceAmount currencyID="${invoice.currency}">${item.unitPrice.toFixed(2)}</cbc:PriceAmount></cac:Price>`,
        `  </cac:InvoiceLine>`,
      ].join('\n')).flat(),
      '</ubl:Invoice>',
    ].join('\n')
  },

  // ZUGFeRD XML (Cross-Industry Invoice / CII)
  _generateZUGFeRDXML(
    invoice: { number: string; issuedAt: Date; total: number; currency: string; lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }> },
    provider: { name: string },
    parent: { name: string }
  ): string {
    const dateStr = invoice.issuedAt.toISOString().split('T')[0].replace(/-/g, '')

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
      '  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
      '  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
      '  <rsm:ExchangedDocumentContext>',
      '    <ram:GuidelineSpecifiedDocumentContextParameter>',
      '      <ram:ID>urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended</ram:ID>',
      '    </ram:GuidelineSpecifiedDocumentContextParameter>',
      '  </rsm:ExchangedDocumentContext>',
      '  <rsm:ExchangedDocument>',
      `    <ram:ID>${invoice.number}</ram:ID>`,
      '    <ram:TypeCode>380</ram:TypeCode>',
      `    <ram:IssueDateTime><udt:DateTimeString format="102">${dateStr}</udt:DateTimeString></ram:IssueDateTime>`,
      '  </rsm:ExchangedDocument>',
      '  <rsm:SupplyChainTradeTransaction>',
      '    <ram:ApplicableHeaderTradeAgreement>',
      `      <ram:SellerTradeParty><ram:Name>${this._escapeXml(provider.name)}</ram:Name></ram:SellerTradeParty>`,
      `      <ram:BuyerTradeParty><ram:Name>${this._escapeXml(parent.name)}</ram:Name></ram:BuyerTradeParty>`,
      '    </ram:ApplicableHeaderTradeAgreement>',
      '    <ram:ApplicableHeaderTradeSettlement>',
      `      <ram:InvoiceCurrencyCode>${invoice.currency}</ram:InvoiceCurrencyCode>`,
      '      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
      `        <ram:DuePayableAmount>${invoice.total.toFixed(2)}</ram:DuePayableAmount>`,
      '      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
      '    </ram:ApplicableHeaderTradeSettlement>',
      '  </rsm:SupplyChainTradeTransaction>',
      '</rsm:CrossIndustryInvoice>',
    ].join('\n')
  },

  _escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  },
}
