// ============================================================
// Workflow Engine – Automatisierte Geschäftsprozesse
// ============================================================
// Verbindet Services miteinander: Events → Aktionen → Benachrichtigungen
// Enthält Background-Job-Logik die periodisch aufgerufen wird.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { ID } from '../types'

// ============================================================
// 1. TRIAL → BOOKING CONVERSION
// ============================================================

export const TrialConversionWorkflow = {

  /**
   * Konvertiert eine abgeschlossene Probestunde in eine vollständige Buchung.
   * Erstellt Buchung, markiert Trial als konvertiert, sendet Benachrichtigung.
   */
  convert(trialId: ID, pricingOptionId: ID): { bookingId: ID } | { error: string } {
    const trial = store.state.trialLessons.get(trialId)
    if (!trial) return { error: 'Probestunde nicht gefunden' }
    if (trial.status !== 'completed') return { error: 'Probestunde muss erst abgeschlossen sein' }

    const activity = store.state.activities.get(trial.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricing = activity.pricing.find((p) => p.id === pricingOptionId)
    if (!pricing) return { error: 'Preisoption nicht gefunden' }

    // Buchung erstellen
    const bookingId = generateId('book')
    const now = new Date()

    const booking = {
      id: bookingId,
      activityId: trial.activityId,
      providerId: trial.providerId,
      parentId: trial.parentId,
      child: trial.child,
      pricingOptionId,
      status: 'confirmed' as const,
      paymentStatus: 'unpaid' as const,
      amountPaid: 0,
      currency: pricing.currency,
      notes: `Konvertiert aus Probestunde ${trialId}`,
      createdAt: now,
      updatedAt: now,
    }

    store.state.bookings.set(bookingId, booking)
    store.addToIndex(store.indexes.bookingsByActivity, trial.activityId, bookingId)
    store.addToIndex(store.indexes.bookingsByProvider, trial.providerId, bookingId)
    store.addToIndex(store.indexes.bookingsByParent, trial.parentId, bookingId)

    // Trial als konvertiert markieren
    trial.status = 'converted'
    trial.convertedToBookingId = bookingId
    trial.updatedAt = now

    // Benachrichtigung
    const notifId = generateId('notif')
    store.state.notifications.set(notifId, {
      id: notifId,
      recipientType: 'parent',
      recipientId: trial.parentId,
      type: 'booking_confirmed',
      channel: 'email',
      title: 'Willkommen im Kurs!',
      body: `"${trial.child.name}" ist jetzt fest für "${activity.title}" angemeldet. Probestunde erfolgreich konvertiert.`,
      data: { bookingId, activityId: trial.activityId, trialId },
      read: false,
      sentAt: now,
    })
    store.addToIndex(store.indexes.notificationsByRecipient, trial.parentId, notifId)

    // Audit
    const auditId = generateId('audit')
    store.state.auditLog.set(auditId, {
      id: auditId,
      providerId: trial.providerId,
      userId: trial.parentId,
      userType: 'parent',
      action: 'trial.converted',
      entityType: 'trial',
      entityId: trialId,
      changes: { bookingId: { old: null, new: bookingId } },
      timestamp: now,
    })
    store.addToIndex(store.indexes.auditByProvider, trial.providerId, auditId)

    return { bookingId }
  },
}

// ============================================================
// 2. WAITLIST → BOOKING CONVERSION
// ============================================================

export const WaitlistConversionWorkflow = {

  /**
   * Wenn ein Wartelisten-Eintrag akzeptiert wird → Buchung erstellen.
   */
  acceptAndBook(waitlistEntryId: ID, pricingOptionId: ID): { bookingId: ID } | { error: string } {
    const entry = store.state.waitlistEntries.get(waitlistEntryId)
    if (!entry) return { error: 'Wartelisten-Eintrag nicht gefunden' }
    if (entry.status !== 'offered') return { error: 'Platz wurde nicht angeboten' }

    // Frist prüfen
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      entry.status = 'expired'
      return { error: 'Angebotsfrist ist abgelaufen' }
    }

    const activity = store.state.activities.get(entry.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const pricing = activity.pricing.find((p) => p.id === pricingOptionId)
    if (!pricing) return { error: 'Preisoption nicht gefunden' }

    // Buchung erstellen
    const bookingId = generateId('book')
    const now = new Date()

    const booking = {
      id: bookingId,
      activityId: entry.activityId,
      providerId: activity.providerId,
      parentId: entry.parentId,
      child: entry.child,
      pricingOptionId,
      status: 'confirmed' as const,
      paymentStatus: 'unpaid' as const,
      amountPaid: 0,
      currency: pricing.currency,
      notes: `Von Warteliste nachrückt (${waitlistEntryId})`,
      createdAt: now,
      updatedAt: now,
    }

    store.state.bookings.set(bookingId, booking)
    store.addToIndex(store.indexes.bookingsByActivity, entry.activityId, bookingId)
    store.addToIndex(store.indexes.bookingsByProvider, activity.providerId, bookingId)
    store.addToIndex(store.indexes.bookingsByParent, entry.parentId, bookingId)

    // Warteliste aktualisieren
    entry.status = 'accepted'

    // Benachrichtigung
    const notifId = generateId('notif')
    store.state.notifications.set(notifId, {
      id: notifId,
      recipientType: 'parent',
      recipientId: entry.parentId,
      type: 'booking_confirmed',
      channel: 'email',
      title: 'Buchung bestätigt – Platz von Warteliste',
      body: `"${entry.child.name}" hat einen Platz in "${activity.title}" erhalten!`,
      data: { bookingId, activityId: entry.activityId },
      read: false,
      sentAt: now,
    })
    store.addToIndex(store.indexes.notificationsByRecipient, entry.parentId, notifId)

    return { bookingId }
  },
}

// ============================================================
// 3. BACKGROUND JOBS – Periodisch aufzurufen
// ============================================================

export const BackgroundJobs = {

  /**
   * TÄGLICH aufrufen: Prüft alle zeitbasierten Aktionen.
   * Returns Zusammenfassung der durchgeführten Aktionen.
   */
  runDaily(): {
    expiredWaitlistOffers: number
    overdueInvoices: number
    expiringDocuments: number
    trialReminders: number
    bookingReminders: number
  } {
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const now = new Date()

    let expiredWaitlistOffers = 0
    let overdueInvoices = 0
    let expiringDocuments = 0
    let trialReminders = 0
    let bookingReminders = 0

    // 1. Abgelaufene Wartelisten-Angebote
    for (const entry of store.state.waitlistEntries.values()) {
      if (entry.status === 'offered' && entry.expiresAt && now > entry.expiresAt) {
        entry.status = 'expired'
        expiredWaitlistOffers++

        // Nächsten Kandidaten anbieten
        const nextWaiting = Array.from(store.state.waitlistEntries.values())
          .filter((e) => e.activityId === entry.activityId && e.status === 'waiting')
          .sort((a, b) => a.position - b.position)[0]

        if (nextWaiting) {
          nextWaiting.status = 'offered'
          nextWaiting.notifiedAt = now
          nextWaiting.expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000)

          const notifId = generateId('notif')
          store.state.notifications.set(notifId, {
            id: notifId,
            recipientType: 'parent',
            recipientId: nextWaiting.parentId,
            type: 'waitlist_promoted',
            channel: 'email',
            title: 'Platz frei geworden!',
            body: `Ein Platz ist frei geworden. Bitte bestätigen Sie innerhalb von 48 Stunden.`,
            data: { waitlistEntryId: nextWaiting.id, activityId: nextWaiting.activityId },
            read: false,
            sentAt: now,
          })
          store.addToIndex(store.indexes.notificationsByRecipient, nextWaiting.parentId, notifId)
        }
      }
    }

    // 2. Überfällige Rechnungen
    for (const invoice of store.state.invoices.values()) {
      if (invoice.status === 'sent' && invoice.dueDate < now) {
        invoice.status = 'overdue'
        overdueInvoices++

        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'parent',
          recipientId: invoice.parentId,
          type: 'payment_overdue',
          channel: 'email',
          title: `Zahlungserinnerung – ${invoice.number}`,
          body: `Die Rechnung ${invoice.number} über ${invoice.total} ${invoice.currency} ist überfällig.`,
          data: { invoiceId: invoice.id, invoiceNumber: invoice.number },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, invoice.parentId, notifId)
      }
    }

    // 3. Ablaufende Dokumente (30 Tage vorher warnen)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    for (const doc of store.state.documents.values()) {
      if (!doc.expiresAt) continue

      const daysUntilExpiry = (doc.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

      if (daysUntilExpiry < 0 && doc.status !== 'expired') {
        doc.status = 'expired'
        expiringDocuments++

        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'provider',
          recipientId: doc.providerId,
          type: 'document_expiring',
          channel: 'in_app',
          title: 'Dokument abgelaufen!',
          body: `"${doc.name}" ist abgelaufen. Bitte erneuern Sie es umgehend.`,
          data: { documentId: doc.id },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, doc.providerId, notifId)
      } else if (daysUntilExpiry > 0 && daysUntilExpiry <= 30 && doc.status !== 'expiring_soon') {
        doc.status = 'expiring_soon'
        expiringDocuments++

        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'provider',
          recipientId: doc.providerId,
          type: 'document_expiring',
          channel: 'in_app',
          title: 'Dokument läuft bald ab',
          body: `"${doc.name}" läuft in ${Math.ceil(daysUntilExpiry)} Tagen ab.`,
          data: { documentId: doc.id },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, doc.providerId, notifId)
      }
    }

    // 4. Probestunden-Erinnerungen (morgen)
    for (const trial of store.state.trialLessons.values()) {
      if (trial.status === 'scheduled' && trial.scheduledDate === tomorrow) {
        trialReminders++

        const activity = store.state.activities.get(trial.activityId)
        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'parent',
          recipientId: trial.parentId,
          type: 'trial_reminder' as any,
          channel: 'email',
          title: 'Erinnerung: Probestunde morgen',
          body: `"${trial.child.name}" hat morgen um ${trial.scheduledTime} eine Probestunde bei "${activity?.title ?? ''}".`,
          data: { trialId: trial.id },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, trial.parentId, notifId)
      }
    }

    // 5. Kurs-Erinnerungen (morgen)
    for (const calEvent of store.state.calendarEvents.values()) {
      if (calEvent.type !== 'activity' || calEvent.date !== tomorrow || !calEvent.activityId) continue

      const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, calEvent.activityId)
      for (const bid of bookingIds) {
        const booking = store.state.bookings.get(bid)
        if (!booking || booking.status !== 'confirmed') continue

        bookingReminders++
        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'parent',
          recipientId: booking.parentId,
          type: 'booking_reminder',
          channel: 'email',
          title: 'Erinnerung: Kurs morgen',
          body: `"${booking.child.name}" hat morgen um ${calEvent.startTime} Kurs: "${calEvent.title}".`,
          data: { bookingId: bid, activityId: calEvent.activityId },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, booking.parentId, notifId)
      }
    }

    return { expiredWaitlistOffers, overdueInvoices, expiringDocuments, trialReminders, bookingReminders }
  },

  /**
   * WÖCHENTLICH aufrufen: SEPA-Lastschriften, Reporting-Snapshots.
   */
  runWeekly(): {
    sepaCollections: number
    paymentReminders: number
  } {
    let sepaCollections = 0
    let paymentReminders = 0
    const now = new Date()

    // Zahlungserinnerungen für unbezahlte Buchungen (>7 Tage)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    for (const booking of store.state.bookings.values()) {
      if (
        booking.status === 'confirmed' &&
        booking.paymentStatus === 'unpaid' &&
        booking.createdAt < sevenDaysAgo
      ) {
        paymentReminders++

        const activity = store.state.activities.get(booking.activityId)
        const notifId = generateId('notif')
        store.state.notifications.set(notifId, {
          id: notifId,
          recipientType: 'parent',
          recipientId: booking.parentId,
          type: 'payment_overdue',
          channel: 'email',
          title: 'Zahlungserinnerung',
          body: `Die Zahlung für "${activity?.title ?? ''}" (${booking.child.name}) steht noch aus.`,
          data: { bookingId: booking.id },
          read: false,
          sentAt: now,
        })
        store.addToIndex(store.indexes.notificationsByRecipient, booking.parentId, notifId)
      }
    }

    return { sepaCollections, paymentReminders }
  },
}

// ============================================================
// 4. CASCADE DELETE – Konsistentes Löschen
// ============================================================

export const CascadeDelete = {

  /**
   * Löscht eine Aktivität und alle abhängigen Daten.
   */
  deleteActivity(activityId: ID): { deleted: Record<string, number> } {
    const activity = store.state.activities.get(activityId)
    if (!activity) return { deleted: {} }

    const deleted: Record<string, number> = { activities: 0, bookings: 0, reviews: 0, trials: 0, waitlist: 0, calendar: 0 }

    // Buchungen löschen
    const bookingIds = Array.from(store.getFromIndex(store.indexes.bookingsByActivity, activityId))
    for (const bid of bookingIds) {
      const booking = store.state.bookings.get(bid)
      if (booking) {
        store.removeFromIndex(store.indexes.bookingsByProvider, booking.providerId, bid)
        store.removeFromIndex(store.indexes.bookingsByParent, booking.parentId, bid)
        store.state.bookings.delete(bid)
        deleted.bookings++
      }
    }
    store.indexes.bookingsByActivity.delete(activityId)

    // Reviews löschen
    const reviewIds = Array.from(store.getFromIndex(store.indexes.reviewsByActivity, activityId))
    for (const rid of reviewIds) {
      const review = store.state.reviews.get(rid)
      if (review) {
        store.removeFromIndex(store.indexes.reviewsByProvider, review.providerId, rid)
        store.state.reviews.delete(rid)
        deleted.reviews++
      }
    }
    store.indexes.reviewsByActivity.delete(activityId)

    // Probestunden löschen
    const trialIds = Array.from(store.getFromIndex(store.indexes.trialsByActivity, activityId))
    for (const tid of trialIds) {
      const trial = store.state.trialLessons.get(tid)
      if (trial) {
        store.removeFromIndex(store.indexes.trialsByProvider, trial.providerId, tid)
        store.removeFromIndex(store.indexes.trialsByParent, trial.parentId, tid)
        store.state.trialLessons.delete(tid)
        deleted.trials++
      }
    }
    store.indexes.trialsByActivity.delete(activityId)

    // Warteliste löschen
    const wlIds = Array.from(store.getFromIndex(store.indexes.waitlistByActivity, activityId))
    for (const wid of wlIds) {
      const entry = store.state.waitlistEntries.get(wid)
      if (entry) {
        store.removeFromIndex(store.indexes.waitlistByParent, entry.parentId, wid)
        store.state.waitlistEntries.delete(wid)
        deleted.waitlist++
      }
    }
    store.indexes.waitlistByActivity.delete(activityId)

    // Kalender-Events löschen
    const calIds = Array.from(store.getFromIndex(store.indexes.calendarByProvider, activity.providerId))
    for (const cid of calIds) {
      const event = store.state.calendarEvents.get(cid)
      if (event && event.activityId === activityId) {
        store.removeFromIndex(store.indexes.calendarByDate, event.date, cid)
        if (event.locationId) store.removeFromIndex(store.indexes.calendarByLocation, event.locationId, cid)
        if (event.instructorId) store.removeFromIndex(store.indexes.calendarByInstructor, event.instructorId, cid)
        store.state.calendarEvents.delete(cid)
        deleted.calendar++
      }
    }

    // Aktivität selbst löschen
    store.removeFromIndex(store.indexes.activitiesByProvider, activity.providerId, activityId)
    store.removeFromIndex(store.indexes.activitiesByCategory, activity.category, activityId)
    if (activity.locationId) {
      store.removeFromIndex(store.indexes.activitiesByLocation, activity.locationId, activityId)
    }
    store.state.activities.delete(activityId)
    deleted.activities = 1

    return { deleted }
  },

  /**
   * Löscht einen Standort und entkoppelt alle Aktivitäten.
   */
  deleteLocation(locationId: ID): { deleted: Record<string, number>; unlinkedActivities: number } {
    const location = store.state.locations.get(locationId)
    if (!location) return { deleted: {}, unlinkedActivities: 0 }

    let unlinkedActivities = 0

    // Aktivitäten entkoppeln (nicht löschen!)
    const activityIds = store.getFromIndex(store.indexes.activitiesByLocation, locationId)
    for (const aid of activityIds) {
      const activity = store.state.activities.get(aid)
      if (activity) {
        activity.locationId = undefined
        unlinkedActivities++
      }
    }
    store.indexes.activitiesByLocation.delete(locationId)

    // Kalender-Events entkoppeln
    const calIds = store.getFromIndex(store.indexes.calendarByLocation, locationId)
    for (const cid of calIds) {
      const event = store.state.calendarEvents.get(cid)
      if (event) event.locationId = undefined
    }
    store.indexes.calendarByLocation.delete(locationId)

    // Standort löschen
    store.removeFromIndex(store.indexes.locationsByProvider, location.providerId, locationId)
    store.state.locations.delete(locationId)

    return { deleted: { locations: 1 }, unlinkedActivities }
  },

  /**
   * Löscht ein Teammitglied und entkoppelt alle Zuweisungen.
   */
  deleteTeamMember(memberId: ID): { deleted: Record<string, number>; unlinkedActivities: number } {
    const member = store.state.teamMembers.get(memberId)
    if (!member) return { deleted: {}, unlinkedActivities: 0 }

    let unlinkedActivities = 0

    // Aktivitäten entkoppeln
    for (const activity of store.state.activities.values()) {
      if (activity.instructorId === memberId) {
        activity.instructorId = undefined
        unlinkedActivities++
      }
    }

    // Kalender-Events entkoppeln
    const calIds = store.getFromIndex(store.indexes.calendarByInstructor, memberId)
    for (const cid of calIds) {
      const event = store.state.calendarEvents.get(cid)
      if (event) event.instructorId = undefined
    }
    store.indexes.calendarByInstructor.delete(memberId)

    // Dokumente löschen
    const docIds = Array.from(store.getFromIndex(store.indexes.documentsByTeamMember, memberId))
    for (const did of docIds) {
      store.state.documents.delete(did)
    }
    store.indexes.documentsByTeamMember.delete(memberId)

    // Verträge löschen
    const contractIds = Array.from(store.getFromIndex(store.indexes.contractsByTeamMember, memberId))
    for (const cid of contractIds) {
      const contract = store.state.instructorContracts.get(cid)
      if (contract) {
        store.removeFromIndex(store.indexes.contractsByProvider, contract.providerId, cid)
      }
      store.state.instructorContracts.delete(cid)
    }
    store.indexes.contractsByTeamMember.delete(memberId)

    // Teammitglied löschen
    store.removeFromIndex(store.indexes.teamByProvider, member.providerId, memberId)
    store.state.teamMembers.delete(memberId)

    return { deleted: { teamMembers: 1, documents: docIds.length, contracts: contractIds.length }, unlinkedActivities }
  },
}
