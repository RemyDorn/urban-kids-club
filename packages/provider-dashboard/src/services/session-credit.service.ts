// ============================================================
// SessionCredit Service – Guthaben-System für verpasste Termine
// ============================================================
// Regeln:
// - Eltern-Absage >= 24h vorher → 1 Credit (max 2 pro Block)
// - Provider-Absage → Credit für alle (zählt NICHT gegen Limit)
// - Credit gültig bis Block-Ende
// - Einlösbar nur im selben Kurstyp (activityType)
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { createNotification, createAuditEntry, getEntitiesFromIndex } from './helpers'
import type {
  ID,
  SessionCredit,
  SessionCreditStatus,
  CreditReason,
  SessionAttendanceRecord,
} from '../types'

export const SessionCreditService = {

  // ================================================================
  // Eltern-Absage: Prüfen & Credit ausstellen
  // ================================================================
  handleParentCancellation(
    attendanceId: ID
  ): { credit?: SessionCredit; message: string } | { error: string } {
    const att = store.state.sessionAttendances.get(attendanceId)
    if (!att) return { error: 'Attendance-Record nicht gefunden' }
    if (att.status !== 'expected') return { error: `Status ist bereits '${att.status}'` }

    const session = store.state.blockSessions.get(att.sessionId)
    if (!session) return { error: 'Session nicht gefunden' }

    const block = store.state.courseBlocks.get(att.blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    const enrollment = store.state.blockEnrollments.get(att.enrollmentId)
    if (!enrollment) return { error: 'Einschreibung nicht gefunden' }

    // Berechne Minuten vor Kursbeginn
    const sessionDateTime = new Date(`${session.date}T${session.startTime}:00`)
    const now = new Date()
    const minutesBefore = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60)

    att.cancelledAt = now
    att.cancelledMinutesBefore = Math.floor(minutesBefore)

    // Prüfe 24h-Regel (konfigurierbar via block.cancellationDeadlineMinutes)
    if (minutesBefore < block.cancellationDeadlineMinutes) {
      att.status = 'absent_unexcused'
      att.creditIssued = false

      // Notification: Zu spät abgesagt
      createNotification({
        recipientType: 'parent',
        recipientId: enrollment.parentId,
        type: 'custom',
        title: 'Absage vermerkt',
        body: `Die Absage für ${enrollment.childName} am ${session.date} wurde vermerkt. `
          + `Leider ist kein Guthaben möglich (weniger als ${Math.floor(block.cancellationDeadlineMinutes / 60)}h vorher).`,
        data: { sessionId: session.id, blockId: block.id },
      })

      return { message: 'Absage vermerkt, aber kein Guthaben (zu spät abgesagt)' }
    }

    // Prüfe Max-Credits-Limit (nur eigene Absagen zählen)
    if (enrollment.creditsEarned >= block.maxCreditsPerEnrollment) {
      att.status = 'absent_excused'
      att.creditIssued = false

      createNotification({
        recipientType: 'parent',
        recipientId: enrollment.parentId,
        type: 'custom',
        title: 'Absage vermerkt – max. Guthaben erreicht',
        body: `Die Absage für ${enrollment.childName} wurde vermerkt. `
          + `Leider sind bereits ${block.maxCreditsPerEnrollment} Guthaben für diesen Block aufgebraucht.`,
        data: { sessionId: session.id, blockId: block.id },
      })

      return { message: `Absage vermerkt, max. Guthaben (${block.maxCreditsPerEnrollment}) bereits erreicht` }
    }

    // Credit ausstellen!
    att.status = 'absent_excused'
    att.creditIssued = true

    const effectiveEndDate = block.extendedEndDate ?? block.endDate

    const credit = SessionCreditService._createCredit({
      enrollmentId: enrollment.id,
      blockId: block.id,
      providerId: block.providerId,
      parentId: enrollment.parentId,
      childId: enrollment.childId,
      activityType: block.activityType,
      reason: 'parent_cancellation',
      isProviderCancellation: false,
      originalSessionId: session.id,
      originalSessionDate: session.date,
      validUntil: effectiveEndDate,
    })

    // Enrollment-Zähler hochsetzen
    enrollment.creditsEarned++
    enrollment.updatedAt = new Date()

    // Notification: Guthaben erhalten
    createNotification({
      recipientType: 'parent',
      recipientId: enrollment.parentId,
      type: 'custom',
      title: 'Guthaben erhalten',
      body: `Du hast 1 Guthaben für ${enrollment.childName} erhalten. `
        + `Gültig bis ${effectiveEndDate}. Nachholen im selben Kurstyp möglich.`,
      data: { creditId: credit.id, sessionId: session.id, blockId: block.id },
    })

    return { credit, message: 'Absage vermerkt, 1 Guthaben ausgestellt' }
  },

  // ================================================================
  // Provider-Absage: Credit für einen Teilnehmer (zählt NICHT gegen Limit)
  // ================================================================
  issueProviderCredit(
    enrollmentId: ID,
    sessionId: ID,
  ): SessionCredit | { error: string } {
    const enrollment = store.state.blockEnrollments.get(enrollmentId)
    if (!enrollment) return { error: 'Einschreibung nicht gefunden' }

    const session = store.state.blockSessions.get(sessionId)
    if (!session) return { error: 'Session nicht gefunden' }

    const block = store.state.courseBlocks.get(enrollment.blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    const effectiveEndDate = block.extendedEndDate ?? block.endDate

    const credit = SessionCreditService._createCredit({
      enrollmentId: enrollment.id,
      blockId: block.id,
      providerId: block.providerId,
      parentId: enrollment.parentId,
      childId: enrollment.childId,
      activityType: block.activityType,
      reason: 'provider_cancellation',
      isProviderCancellation: true,  // Zählt NICHT gegen Limit
      originalSessionId: session.id,
      originalSessionDate: session.date,
      validUntil: effectiveEndDate,
    })

    // Notification
    createNotification({
      recipientType: 'parent',
      recipientId: enrollment.parentId,
      type: 'activity_cancelled',
      title: 'Termin fällt aus – Guthaben erhalten',
      body: `Der Termin am ${session.date} fällt leider aus. `
        + `Du hast ein Guthaben für ${enrollment.childName} erhalten. Gültig bis ${effectiveEndDate}.`,
      data: { creditId: credit.id, sessionId: session.id, blockId: block.id },
    })

    return credit
  },

  // ================================================================
  // Admin: Guthaben manuell erstellen (Kulanz / Sonderfälle)
  // ================================================================
  issueManualCredit(input: {
    enrollmentId: ID
    reason: string
    validUntil?: string
    issuedBy: ID
  }): SessionCredit | { error: string } {
    const enrollment = store.state.blockEnrollments.get(input.enrollmentId)
    if (!enrollment) return { error: 'Einschreibung nicht gefunden' }

    const block = store.state.courseBlocks.get(enrollment.blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    const effectiveEndDate = input.validUntil ?? block.extendedEndDate ?? block.endDate

    const credit = SessionCreditService._createCredit({
      enrollmentId: enrollment.id,
      blockId: block.id,
      providerId: block.providerId,
      parentId: enrollment.parentId,
      childId: enrollment.childId,
      activityType: block.activityType,
      reason: 'provider_cancellation',  // Kulanz = Provider-seitig
      isProviderCancellation: true,
      originalSessionId: 'manual',
      originalSessionDate: new Date().toISOString().split('T')[0],
      validUntil: effectiveEndDate,
    })

    // Audit
    createAuditEntry({
      providerId: block.providerId,
      userId: input.issuedBy,
      userType: 'provider',
      action: 'session_credit.manual_issue',
      entityType: 'session_credit',
      entityId: credit.id,
      changes: { reason: { old: null, new: input.reason } },
    })

    return credit
  },

  // ================================================================
  // Credits eines Kindes abrufen
  // ================================================================
  getCreditsByChild(childId: string, statusFilter?: SessionCreditStatus): SessionCredit[] {
    const credits = getEntitiesFromIndex(
      store.state.sessionCredits, store.indexes.creditsByChild, childId
    )
    if (statusFilter) return credits.filter(c => c.status === statusFilter)
    return credits.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  // ================================================================
  // Credits eines Elternteils (alle Kinder)
  // ================================================================
  getCreditsByParent(parentId: ID, statusFilter?: SessionCreditStatus): SessionCredit[] {
    // Alle Enrollments des Elternteils finden
    const enrollments = getEntitiesFromIndex(
      store.state.blockEnrollments, store.indexes.enrollmentsByParent, parentId
    )
    const credits: SessionCredit[] = []
    for (const enrollment of enrollments) {
      const enrollmentCredits = getEntitiesFromIndex(
        store.state.sessionCredits, store.indexes.creditsByEnrollment, enrollment.id
      )
      credits.push(...enrollmentCredits)
    }
    if (statusFilter) return credits.filter(c => c.status === statusFilter)
    return credits.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  // ================================================================
  // Einzelnes Credit abrufen
  // ================================================================
  getCredit(creditId: ID): SessionCredit | undefined {
    return store.state.sessionCredits.get(creditId)
  },

  // ================================================================
  // Credit einlösen (wird von MakeupBookingService aufgerufen)
  // ================================================================
  redeemCredit(creditId: ID, targetSessionId: ID): SessionCredit | { error: string } {
    const credit = store.state.sessionCredits.get(creditId)
    if (!credit) return { error: 'Guthaben nicht gefunden' }
    if (credit.status !== 'available') return { error: `Guthaben ist nicht verfügbar (Status: ${credit.status})` }

    const today = new Date().toISOString().split('T')[0]
    if (credit.validUntil < today) {
      credit.status = 'expired'
      return { error: 'Guthaben ist abgelaufen' }
    }

    credit.status = 'used'
    credit.usedInSessionId = targetSessionId
    credit.usedAt = new Date()

    // Enrollment-Zähler
    const enrollment = store.state.blockEnrollments.get(credit.enrollmentId)
    if (enrollment) {
      enrollment.creditsUsed++
      enrollment.updatedAt = new Date()
    }

    return credit
  },

  // ================================================================
  // Credit zurücksetzen (bei Stornierung des Nachholtermins)
  // ================================================================
  unredeemCredit(creditId: ID): SessionCredit | { error: string } {
    const credit = store.state.sessionCredits.get(creditId)
    if (!credit) return { error: 'Guthaben nicht gefunden' }
    if (credit.status !== 'used') return { error: 'Guthaben ist nicht im Status used' }

    credit.status = 'available'
    credit.usedInSessionId = undefined
    credit.usedAt = undefined

    const enrollment = store.state.blockEnrollments.get(credit.enrollmentId)
    if (enrollment) {
      enrollment.creditsUsed = Math.max(0, enrollment.creditsUsed - 1)
      enrollment.updatedAt = new Date()
    }

    return credit
  },

  // ================================================================
  // Verfallene Credits markieren (Cronjob – täglich)
  // ================================================================
  expireCredits(): number {
    const today = new Date().toISOString().split('T')[0]
    let expired = 0

    for (const credit of store.state.sessionCredits.values()) {
      if (credit.status === 'available' && credit.validUntil < today) {
        credit.status = 'expired'
        expired++
      }
    }

    return expired
  },

  // ================================================================
  // Credit bald ablaufend? → Reminder-Notification (3 Tage vorher)
  // ================================================================
  sendExpiryReminders(): number {
    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    const targetDate = threeDaysFromNow.toISOString().split('T')[0]
    const today = new Date().toISOString().split('T')[0]
    let sent = 0

    for (const credit of store.state.sessionCredits.values()) {
      if (credit.status === 'available' && credit.validUntil === targetDate) {
        createNotification({
          recipientType: 'parent',
          recipientId: credit.parentId,
          type: 'custom',
          title: 'Guthaben läuft bald ab',
          body: `Dein Guthaben für den Kurstyp "${credit.activityType}" läuft in 3 Tagen ab (${credit.validUntil}). Jetzt Nachholtermin buchen!`,
          data: { creditId: credit.id },
        })
        sent++
      }
    }

    return sent
  },

  // ================================================================
  // Interner Helper: Credit erstellen
  // ================================================================
  _createCredit(input: {
    enrollmentId: ID
    blockId: ID
    providerId: ID
    parentId: ID
    childId: string
    activityType: string
    reason: CreditReason
    isProviderCancellation: boolean
    originalSessionId: ID
    originalSessionDate: string
    validUntil: string
  }): SessionCredit {
    const creditId = generateId('crd')
    const now = new Date()

    const credit: SessionCredit = {
      id: creditId,
      enrollmentId: input.enrollmentId,
      blockId: input.blockId,
      providerId: input.providerId,
      parentId: input.parentId,
      childId: input.childId,
      activityType: input.activityType,
      reason: input.reason,
      isProviderCancellation: input.isProviderCancellation,
      originalSessionId: input.originalSessionId,
      originalSessionDate: input.originalSessionDate,
      status: 'available',
      validUntil: input.validUntil,
      createdAt: now,
    }

    store.state.sessionCredits.set(creditId, credit)
    store.addToIndex(store.indexes.creditsByChild, input.childId, creditId)
    store.addToIndex(store.indexes.creditsByBlock, input.blockId, creditId)
    store.addToIndex(store.indexes.creditsByEnrollment, input.enrollmentId, creditId)
    store.addToIndex(store.indexes.creditsByProvider, input.providerId, creditId)
    store.addToIndex(store.indexes.creditsByActivityType, input.activityType, creditId)

    return credit
  },
}
