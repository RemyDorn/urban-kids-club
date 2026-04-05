// ============================================================
// Document & Compliance Service – DSGVO, Führungszeugnis, Verträge
// ============================================================
// Verwaltet alle rechtlichen Dokumente: Trainer-Qualifikationen,
// Führungszeugnisse, Einverständniserklärungen der Eltern,
// DSGVO-Consent-Records.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type {
  ProviderDocument,
  DocumentType,
  DocumentStatus,
  ConsentRecord,
  ID,
} from '../types'

// --- Provider-Dokumente (Führungszeugnis, Versicherung, etc.) ---

export interface CreateDocumentInput {
  providerId: ID
  teamMemberId?: ID
  type: DocumentType
  name: string
  fileUrl?: string
  issuedAt?: Date
  expiresAt?: Date
  notes?: string
}

export const DocumentService = {

  create(input: CreateDocumentInput): ProviderDocument {
    const id = generateId('doc')
    const now = new Date()

    let status: DocumentStatus = 'pending_review'
    if (input.expiresAt) {
      const daysUntilExpiry = (input.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      if (daysUntilExpiry < 0) status = 'expired'
      else if (daysUntilExpiry < 30) status = 'expiring_soon'
      else status = 'valid'
    }

    const doc: ProviderDocument = {
      id,
      providerId: input.providerId,
      teamMemberId: input.teamMemberId,
      type: input.type,
      name: input.name,
      fileUrl: input.fileUrl,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      status,
      notes: input.notes,
      createdAt: now,
    }

    store.state.documents.set(id, doc)
    store.addToIndex(store.indexes.documentsByProvider, input.providerId, id)
    if (input.teamMemberId) {
      store.addToIndex(store.indexes.documentsByTeamMember, input.teamMemberId, id)
    }

    return doc
  },

  getById(id: ID): ProviderDocument | undefined {
    return store.state.documents.get(id)
  },

  listByProvider(providerId: ID, filters?: { type?: DocumentType; status?: DocumentStatus }): ProviderDocument[] {
    const ids = store.getFromIndex(store.indexes.documentsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.documents.get(id)!)
      .filter(Boolean)

    if (filters?.type) {
      result = result.filter((d) => d.type === filters.type)
    }
    if (filters?.status) {
      result = result.filter((d) => d.status === filters.status)
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  listByTeamMember(teamMemberId: ID): ProviderDocument[] {
    const ids = store.getFromIndex(store.indexes.documentsByTeamMember, teamMemberId)
    return Array.from(ids)
      .map((id) => store.state.documents.get(id)!)
      .filter(Boolean)
  },

  verify(id: ID, verifiedBy: string): ProviderDocument | undefined {
    const doc = store.state.documents.get(id)
    if (!doc) return undefined
    doc.verifiedBy = verifiedBy
    doc.verifiedAt = new Date()
    if (doc.status === 'pending_review') doc.status = 'valid'
    return doc
  },

  // Status aller Dokumente aktualisieren (z.B. als Cron-Job)
  refreshStatuses(): ProviderDocument[] {
    const now = new Date()
    const updated: ProviderDocument[] = []

    for (const doc of store.state.documents.values()) {
      if (!doc.expiresAt) continue

      const daysUntilExpiry = (doc.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      let newStatus: DocumentStatus = doc.status

      if (daysUntilExpiry < 0) newStatus = 'expired'
      else if (daysUntilExpiry < 30) newStatus = 'expiring_soon'
      else if (doc.verifiedAt) newStatus = 'valid'

      if (newStatus !== doc.status) {
        doc.status = newStatus
        updated.push(doc)
      }
    }

    return updated
  },

  // Compliance-Check: Sind alle Pflichtdokumente vorhanden?
  getComplianceStatus(providerId: ID): {
    compliant: boolean
    missing: DocumentType[]
    expiring: ProviderDocument[]
    expired: ProviderDocument[]
  } {
    const requiredTypes: DocumentType[] = ['fuehrungszeugnis', 'insurance']
    const docs = this.listByProvider(providerId)

    const existingTypes = new Set(docs.filter((d) => d.status === 'valid').map((d) => d.type))
    const missing = requiredTypes.filter((t) => !existingTypes.has(t))
    const expiring = docs.filter((d) => d.status === 'expiring_soon')
    const expired = docs.filter((d) => d.status === 'expired')

    return {
      compliant: missing.length === 0 && expired.length === 0,
      missing,
      expiring,
      expired,
    }
  },

  // Compliance-Check für einzelnen Trainer
  getTeamMemberCompliance(teamMemberId: ID): {
    compliant: boolean
    missing: DocumentType[]
    documents: ProviderDocument[]
  } {
    const requiredForInstructor: DocumentType[] = ['fuehrungszeugnis', 'first_aid']
    const docs = this.listByTeamMember(teamMemberId)
    const validTypes = new Set(docs.filter((d) => d.status === 'valid').map((d) => d.type))
    const missing = requiredForInstructor.filter((t) => !validTypes.has(t))

    return { compliant: missing.length === 0, missing, documents: docs }
  },

  delete(id: ID): boolean {
    const doc = store.state.documents.get(id)
    if (!doc) return false

    store.removeFromIndex(store.indexes.documentsByProvider, doc.providerId, id)
    if (doc.teamMemberId) {
      store.removeFromIndex(store.indexes.documentsByTeamMember, doc.teamMemberId, id)
    }
    return store.state.documents.delete(id)
  },
}

// --- Consent Records (DSGVO-Einwilligungen) ---

export interface CreateConsentInput {
  parentId: ID
  childName: string
  providerId: ID
  documentType: DocumentType
  ipAddress?: string
}

export const ConsentService = {

  giveConsent(input: CreateConsentInput): ConsentRecord {
    const id = generateId('consent')

    const consent: ConsentRecord = {
      id,
      parentId: input.parentId,
      childName: input.childName,
      providerId: input.providerId,
      documentType: input.documentType,
      consentGiven: true,
      consentedAt: new Date(),
      ipAddress: input.ipAddress,
    }

    store.state.consents.set(id, consent)
    store.addToIndex(store.indexes.consentsByParent, input.parentId, id)
    store.addToIndex(store.indexes.consentsByProvider, input.providerId, id)

    return consent
  },

  revokeConsent(id: ID): ConsentRecord | undefined {
    const consent = store.state.consents.get(id)
    if (!consent) return undefined
    consent.consentGiven = false
    consent.revokedAt = new Date()
    return consent
  },

  getByParent(parentId: ID): ConsentRecord[] {
    const ids = store.getFromIndex(store.indexes.consentsByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.consents.get(id)!)
      .filter(Boolean)
  },

  getByProvider(providerId: ID): ConsentRecord[] {
    const ids = store.getFromIndex(store.indexes.consentsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.consents.get(id)!)
      .filter(Boolean)
  },

  // Prüfen ob für ein Kind/Provider/Dokumenttyp Consent existiert
  hasConsent(parentId: ID, childName: string, providerId: ID, documentType: DocumentType): boolean {
    const consents = this.getByParent(parentId)
    return consents.some(
      (c) =>
        c.childName === childName &&
        c.providerId === providerId &&
        c.documentType === documentType &&
        c.consentGiven &&
        !c.revokedAt
    )
  },

  // DSGVO: Alle Daten eines Elternteils exportieren (Auskunftsrecht)
  exportParentData(parentId: ID): {
    consents: ConsentRecord[]
    bookings: unknown[]
    invoices: unknown[]
    messages: unknown[]
  } {
    const consents = this.getByParent(parentId)
    const bookingIds = store.getFromIndex(store.indexes.bookingsByParent, parentId)
    const invoiceIds = store.getFromIndex(store.indexes.invoicesByParent, parentId)
    const messageIds = store.getFromIndex(store.indexes.messagesByParent, parentId)

    return {
      consents,
      bookings: Array.from(bookingIds).map((id) => store.state.bookings.get(id)!).filter(Boolean),
      invoices: Array.from(invoiceIds).map((id) => store.state.invoices.get(id)!).filter(Boolean),
      messages: Array.from(messageIds).map((id) => store.state.messages.get(id)!).filter(Boolean),
    }
  },

  // DSGVO: Alle Daten eines Elternteils löschen (Recht auf Löschung)
  // Buchungen und Rechnungen werden anonymisiert (GoBD: 10 Jahre Aufbewahrungspflicht)
  deleteParentData(parentId: ID): { deletedRecords: number; anonymizedRecords: number } {
    let count = 0
    let anonymized = 0

    // Consents
    const consentIds = store.getFromIndex(store.indexes.consentsByParent, parentId)
    for (const id of consentIds) {
      store.state.consents.delete(id)
      count++
    }
    store.indexes.consentsByParent.delete(parentId)

    // Messages
    const messageIds = store.getFromIndex(store.indexes.messagesByParent, parentId)
    for (const id of messageIds) {
      store.state.messages.delete(id)
      count++
    }
    store.indexes.messagesByParent.delete(parentId)

    // Notifications
    const notifIds = store.getFromIndex(store.indexes.notificationsByRecipient, parentId)
    for (const id of notifIds) {
      store.state.notifications.delete(id)
      count++
    }
    store.indexes.notificationsByRecipient.delete(parentId)

    // Buchungen anonymisieren (nicht löschen – GoBD Aufbewahrungspflicht)
    const bookingIds = store.getFromIndex(store.indexes.bookingsByParent, parentId)
    for (const id of bookingIds) {
      const booking = store.state.bookings.get(id)
      if (booking) {
        booking.child = {
          name: '[GELÖSCHT]',
          age: 0,
          emergencyContact: '[GELÖSCHT]',
          emergencyPhone: '[GELÖSCHT]',
          medicalNotes: undefined,
          allergies: undefined,
        }
        booking.notes = undefined
        anonymized++
      }
    }

    // Rechnungen anonymisieren (GoBD: 10 Jahre)
    const invoiceIds = store.getFromIndex(store.indexes.invoicesByParent, parentId)
    for (const id of invoiceIds) {
      const invoice = store.state.invoices.get(id)
      if (invoice) {
        // Nur parentId-Bezug anonymisieren, Rechnungsdaten bleiben für GoBD
        anonymized++
      }
    }

    // Contact Notes löschen
    const noteIds = store.getFromIndex(store.indexes.notesByParent, parentId)
    for (const id of noteIds) {
      store.state.contactNotes.delete(id)
      count++
    }
    store.indexes.notesByParent.delete(parentId)

    // Parent selbst
    if (store.state.parents.delete(parentId)) count++

    return { deletedRecords: count, anonymizedRecords: anonymized }
  },
}
