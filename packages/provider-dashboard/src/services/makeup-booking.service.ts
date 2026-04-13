// ============================================================
// MakeupBooking Service – Nachholtermine buchen
// ============================================================
// Eltern lösen ein SessionCredit ein, um in einem kompatiblen
// Kurs-Slot nachzuholen. Provider (Jasmin) können auch manuell buchen.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { createNotification, createAuditEntry, getEntitiesFromIndex } from './helpers'
import { SessionCreditService } from './session-credit.service'
import { CourseBlockService } from './course-block.service'
import type {
  ID,
  MakeupBooking,
  MakeupBookingStatus,
  SessionAttendanceRecord,
} from '../types'

export interface BookMakeupInput {
  creditId: ID
  targetSessionId: ID
  bookedBy: 'parent' | 'provider'
  overrideCapacity?: boolean     // Nur für Provider: Kapazität ignorieren
}

export const MakeupBookingService = {

  // ================================================================
  // Nachholtermin buchen
  // ================================================================
  bookMakeup(input: BookMakeupInput): MakeupBooking | { error: string } {
    // Credit validieren
    const credit = store.state.sessionCredits.get(input.creditId)
    if (!credit) return { error: 'Guthaben nicht gefunden' }
    if (credit.status !== 'available') return { error: `Guthaben nicht verfügbar (Status: ${credit.status})` }

    // Gültigkeit prüfen
    const today = new Date().toISOString().split('T')[0]
    if (credit.validUntil < today) {
      credit.status = 'expired'
      return { error: 'Guthaben ist abgelaufen' }
    }

    // Target Session validieren
    const targetSession = store.state.blockSessions.get(input.targetSessionId)
    if (!targetSession) return { error: 'Ziel-Termin nicht gefunden' }
    if (targetSession.status !== 'scheduled') return { error: 'Ziel-Termin ist nicht geplant' }
    if (targetSession.date <= today) return { error: 'Ziel-Termin muss in der Zukunft liegen' }
    if (targetSession.date > credit.validUntil) return { error: 'Ziel-Termin liegt nach Ablauf des Guthabens' }

    // Target Block validieren
    const targetBlock = store.state.courseBlocks.get(targetSession.blockId)
    if (!targetBlock) return { error: 'Ziel-Block nicht gefunden' }

    // ActivityType muss übereinstimmen
    if (targetBlock.activityType !== credit.activityType) {
      return { error: `Kurstyp stimmt nicht überein. Guthaben: "${credit.activityType}", Ziel: "${targetBlock.activityType}"` }
    }

    // Kapazitätsprüfung (Nachhol-Plätze)
    if (!input.overrideCapacity || input.bookedBy !== 'provider') {
      const attendances = CourseBlockService.getAttendanceBySession(input.targetSessionId)
      const makeupCount = attendances.filter(
        a => a.isMakeup && (a.status === 'expected' || a.status === 'attended')
      ).length

      if (makeupCount >= targetBlock.makeupCapacity) {
        return { error: `Keine Nachhol-Plätze verfügbar (${makeupCount}/${targetBlock.makeupCapacity} belegt)` }
      }
    }

    // Prüfe ob Kind nicht schon in dieser Session einen Nachholtermin hat
    const existingMakeups = getEntitiesFromIndex(
      store.state.makeupBookings, store.indexes.makeupsBySession, input.targetSessionId
    )
    const alreadyBooked = existingMakeups.find(
      m => m.childId === credit.childId && m.status === 'confirmed'
    )
    if (alreadyBooked) return { error: 'Kind hat bereits einen Nachholtermin in dieser Session' }

    // Enrollment für childName lookup
    const enrollment = store.state.blockEnrollments.get(credit.enrollmentId)
    const childName = enrollment?.childName ?? 'Kind'

    // Alles okay → Credit einlösen
    const redeemResult = SessionCreditService.redeemCredit(input.creditId, input.targetSessionId)
    if ('error' in redeemResult) return redeemResult

    // MakeupBooking erstellen
    const makeupId = generateId('mkp')
    const now = new Date()

    const makeup: MakeupBooking = {
      id: makeupId,
      creditId: input.creditId,
      targetBlockId: targetSession.blockId,
      targetSessionId: input.targetSessionId,
      providerId: targetBlock.providerId,
      parentId: credit.parentId,
      childId: credit.childId,
      childName,
      status: 'confirmed',
      bookedBy: input.bookedBy,
      createdAt: now,
      updatedAt: now,
    }

    store.state.makeupBookings.set(makeupId, makeup)
    store.addToIndex(store.indexes.makeupsByCredit, input.creditId, makeupId)
    store.addToIndex(store.indexes.makeupsBySession, input.targetSessionId, makeupId)
    store.addToIndex(store.indexes.makeupsByChild, credit.childId, makeupId)

    // SessionAttendance für den Nachholtermin erstellen
    const attId = generateId('att')
    const att: SessionAttendanceRecord = {
      id: attId,
      sessionId: input.targetSessionId,
      blockId: targetSession.blockId,
      enrollmentId: credit.enrollmentId,
      childId: credit.childId,
      status: 'expected',
      creditIssued: false,
      isMakeup: true,
      makeupCreditId: input.creditId,
      createdAt: now,
    }

    store.state.sessionAttendances.set(attId, att)
    store.addToIndex(store.indexes.sessionAttendancesBySession, input.targetSessionId, attId)
    store.addToIndex(store.indexes.sessionAttendancesByChild, credit.childId, attId)
    store.addToIndex(store.indexes.sessionAttendancesByEnrollment, credit.enrollmentId, attId)

    // Notifications
    createNotification({
      recipientType: 'parent',
      recipientId: credit.parentId,
      type: 'booking_confirmed',
      title: 'Nachholtermin gebucht',
      body: `Nachholtermin für ${childName}: ${targetSession.date} um ${targetSession.startTime} Uhr. Bis dann!`,
      data: { makeupId, sessionId: input.targetSessionId, blockId: targetSession.blockId },
    })

    // Telegram-Notification an Provider (Jasmin)
    createNotification({
      recipientType: 'provider',
      recipientId: targetBlock.providerId,
      type: 'custom',
      title: 'Nachholtermin gebucht',
      body: `📋 Nachholtermin: ${childName} → ${targetBlock.activityType} am ${targetSession.date} um ${targetSession.startTime}`,
      data: { makeupId, childId: credit.childId },
    })

    // Audit
    createAuditEntry({
      providerId: targetBlock.providerId,
      userId: input.bookedBy === 'parent' ? credit.parentId : targetBlock.providerId,
      userType: input.bookedBy === 'parent' ? 'parent' : 'provider',
      action: 'makeup_booking.created',
      entityType: 'makeup_booking',
      entityId: makeupId,
      changes: {
        creditId: { old: null, new: input.creditId },
        targetSession: { old: null, new: `${targetSession.date} ${targetSession.startTime}` },
      },
    })

    return makeup
  },

  // ================================================================
  // Nachholtermin stornieren
  // ================================================================
  cancelMakeup(makeupId: ID, cancelledBy: 'parent' | 'provider'): { success: boolean } | { error: string } {
    const makeup = store.state.makeupBookings.get(makeupId)
    if (!makeup) return { error: 'Nachholtermin nicht gefunden' }
    if (makeup.status !== 'confirmed') return { error: `Status ist bereits '${makeup.status}'` }

    // Status updaten
    makeup.status = 'cancelled'
    makeup.updatedAt = new Date()

    // Credit zurücksetzen
    const unredeemResult = SessionCreditService.unredeemCredit(makeup.creditId)
    if ('error' in unredeemResult) {
      // Credit konnte nicht zurückgesetzt werden, Makeup trotzdem stornieren
      console.warn(`Credit ${makeup.creditId} konnte nicht zurückgesetzt werden: ${unredeemResult.error}`)
    }

    // Attendance-Record entfernen / auf cancelled setzen
    const attendances = CourseBlockService.getAttendanceBySession(makeup.targetSessionId)
    const makeupAtt = attendances.find(
      a => a.isMakeup && a.makeupCreditId === makeup.creditId && a.childId === makeup.childId
    )
    if (makeupAtt) {
      // Aus Store entfernen
      store.state.sessionAttendances.delete(makeupAtt.id)
      store.removeFromIndex(store.indexes.sessionAttendancesBySession, makeup.targetSessionId, makeupAtt.id)
      store.removeFromIndex(store.indexes.sessionAttendancesByChild, makeup.childId, makeupAtt.id)
      store.removeFromIndex(store.indexes.sessionAttendancesByEnrollment, makeupAtt.enrollmentId, makeupAtt.id)
    }

    // Notification
    createNotification({
      recipientType: 'parent',
      recipientId: makeup.parentId,
      type: 'booking_cancelled',
      title: 'Nachholtermin storniert',
      body: `Der Nachholtermin für ${makeup.childName} wurde storniert. Dein Guthaben ist wieder verfügbar.`,
      data: { makeupId, creditId: makeup.creditId },
    })

    // Audit
    createAuditEntry({
      providerId: makeup.providerId,
      userId: cancelledBy === 'parent' ? makeup.parentId : makeup.providerId,
      userType: cancelledBy === 'parent' ? 'parent' : 'provider',
      action: 'makeup_booking.cancelled',
      entityType: 'makeup_booking',
      entityId: makeupId,
    })

    return { success: true }
  },

  // ================================================================
  // Nachhol-Anwesenheit erfassen
  // ================================================================
  markMakeupAttendance(
    makeupId: ID,
    status: 'attended' | 'no_show'
  ): MakeupBooking | { error: string } {
    const makeup = store.state.makeupBookings.get(makeupId)
    if (!makeup) return { error: 'Nachholtermin nicht gefunden' }
    if (makeup.status !== 'confirmed') return { error: `Status ist bereits '${makeup.status}'` }

    makeup.status = status
    makeup.updatedAt = new Date()

    // Attendance-Record updaten
    const attendances = CourseBlockService.getAttendanceBySession(makeup.targetSessionId)
    const makeupAtt = attendances.find(
      a => a.isMakeup && a.makeupCreditId === makeup.creditId && a.childId === makeup.childId
    )
    if (makeupAtt) {
      makeupAtt.status = status === 'attended' ? 'attended' : 'absent_unexcused'
    }

    return makeup
  },

  // ================================================================
  // Nachholtermine eines Kindes
  // ================================================================
  getMakeupsByChild(childId: string): MakeupBooking[] {
    return getEntitiesFromIndex(
      store.state.makeupBookings, store.indexes.makeupsByChild, childId
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  // ================================================================
  // Nachholtermine eines Elternteils (alle Kinder)
  // ================================================================
  getMakeupsByParent(parentId: ID): MakeupBooking[] {
    // Über Credits → Makeups
    const credits = SessionCreditService.getCreditsByParent(parentId)
    const makeups: MakeupBooking[] = []

    for (const credit of credits) {
      const creditMakeups = getEntitiesFromIndex(
        store.state.makeupBookings, store.indexes.makeupsByCredit, credit.id
      )
      makeups.push(...creditMakeups)
    }

    return makeups.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  },

  // ================================================================
  // Nachholtermine einer Session
  // ================================================================
  getMakeupsBySession(sessionId: ID): MakeupBooking[] {
    return getEntitiesFromIndex(
      store.state.makeupBookings, store.indexes.makeupsBySession, sessionId
    )
  },

  // ================================================================
  // Einzelnen Nachholtermin abrufen
  // ================================================================
  getMakeup(makeupId: ID): MakeupBooking | undefined {
    return store.state.makeupBookings.get(makeupId)
  },
}
