// ============================================================
// CourseBlock Service – Kursblöcke verwalten (8-Wochen-Blöcke)
// ============================================================
// Ein CourseBlock ist eine Reihe von 8 wöchentlichen Sessions,
// die als Einheit gebucht und bezahlt werden (z.B. 140 €).
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import { createAuditEntry, getEntitiesFromIndex, DAY_TO_NUMBER } from './helpers'
import type {
  ID,
  DayOfWeek,
  Currency,
  CourseBlock,
  CourseBlockStatus,
  BlockSession,
  BlockSessionStatus,
  BlockEnrollment,
  SessionAttendanceRecord,
  CompensationType,
} from '../types'

// --- Helpers ---

const DAY_FROM_NUMBER: Record<number, DayOfWeek> = {
  0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA',
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMin = h * 60 + m + minutes
  const newH = Math.floor(totalMin / 60) % 24
  const newM = totalMin % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

function generateSessionDates(startDate: string, recurringDay: DayOfWeek, totalSessions: number): string[] {
  const targetDay = DAY_TO_NUMBER[recurringDay]
  const dates: string[] = []
  const start = new Date(startDate + 'T00:00:00Z')

  // Find first occurrence of the target day on or after startDate
  let current = new Date(start)
  while (current.getUTCDay() !== targetDay) {
    current.setUTCDate(current.getUTCDate() + 1)
  }

  for (let i = 0; i < totalSessions; i++) {
    dates.push(current.toISOString().split('T')[0])
    current.setUTCDate(current.getUTCDate() + 7)
  }

  return dates
}

// --- Input Types ---

export interface CreateCourseBlockInput {
  providerId: ID
  activityId: ID
  activityType: string          // z.B. "little_movers_circle"
  seasonLabel: string           // z.B. "Block 1 – Mai/Juni 2026"
  totalSessions?: number        // Default: 8
  startDate: string             // "YYYY-MM-DD"
  recurringDay: DayOfWeek
  recurringTime: string         // "HH:mm"
  durationMinutes?: number      // Default: 60
  pricePerBlock?: number        // Default: 140
  currency?: Currency           // Default: 'EUR'
  capacity: number              // z.B. 10
  makeupCapacity?: number       // Default: 2
  maxCreditsPerEnrollment?: number  // Default: 2
  cancellationDeadlineMinutes?: number  // Default: 1440 (24h)
}

export interface EnrollChildInput {
  blockId: ID
  parentId: ID
  childId: string
  childName: string
  childAge: number
  pricePaid?: number
  currency?: Currency
  bookingId?: ID
}

export interface CancelSessionInput {
  sessionId: ID
  reason: string
  compensation: CompensationType
  cancelledBy: ID               // TeamMember / Provider ID
}

// --- Service ---

export const CourseBlockService = {

  // ================================================================
  // Block erstellen (generiert automatisch N BlockSessions)
  // ================================================================
  createBlock(input: CreateCourseBlockInput): CourseBlock | { error: string } {
    const activity = store.state.activities.get(input.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }

    const totalSessions = input.totalSessions ?? 8
    const durationMinutes = input.durationMinutes ?? 60
    const pricePerBlock = input.pricePerBlock ?? 140
    const currency = input.currency ?? 'EUR'
    const makeupCapacity = input.makeupCapacity ?? 2
    const maxCredits = input.maxCreditsPerEnrollment ?? 2
    const cancellationDeadline = input.cancellationDeadlineMinutes ?? 1440

    // Termine generieren
    const dates = generateSessionDates(input.startDate, input.recurringDay, totalSessions)
    const endDate = dates[dates.length - 1]
    const endTime = addMinutes(input.recurringTime, durationMinutes)

    const blockId = generateId('blk')
    const now = new Date()

    // Block erstellen
    const block: CourseBlock = {
      id: blockId,
      providerId: input.providerId,
      activityId: input.activityId,
      activityType: input.activityType,
      seasonLabel: input.seasonLabel,
      totalSessions,
      startDate: dates[0],
      endDate,
      recurringDay: input.recurringDay,
      recurringTime: input.recurringTime,
      durationMinutes,
      pricePerBlock,
      currency,
      capacity: input.capacity,
      makeupCapacity,
      maxCreditsPerEnrollment: maxCredits,
      cancellationDeadlineMinutes: cancellationDeadline,
      status: 'upcoming',
      createdAt: now,
      updatedAt: now,
    }

    store.state.courseBlocks.set(blockId, block)
    store.addToIndex(store.indexes.blocksByProvider, input.providerId, blockId)
    store.addToIndex(store.indexes.blocksByActivity, input.activityId, blockId)
    store.addToIndex(store.indexes.blocksByActivityType, input.activityType, blockId)

    // Sessions generieren
    for (let i = 0; i < dates.length; i++) {
      const sessionId = generateId('bsn')
      const session: BlockSession = {
        id: sessionId,
        blockId,
        sessionNumber: i + 1,
        date: dates[i],
        startTime: input.recurringTime,
        endTime,
        status: 'scheduled',
        createdAt: now,
      }
      store.state.blockSessions.set(sessionId, session)
      store.addToIndex(store.indexes.sessionsByBlock, blockId, sessionId)
      store.addToIndex(store.indexes.sessionsByDate, dates[i], sessionId)
    }

    // Audit
    createAuditEntry({
      providerId: input.providerId,
      userId: input.providerId,
      userType: 'provider',
      action: 'course_block.created',
      entityType: 'course_block',
      entityId: blockId,
    })

    return block
  },

  // ================================================================
  // Block abrufen
  // ================================================================
  getBlock(blockId: ID): CourseBlock | undefined {
    return store.state.courseBlocks.get(blockId)
  },

  // ================================================================
  // Alle Blöcke eines Providers
  // ================================================================
  getBlocksByProvider(providerId: ID): CourseBlock[] {
    return getEntitiesFromIndex(store.state.courseBlocks, store.indexes.blocksByProvider, providerId)
  },

  // ================================================================
  // Alle Blöcke eines Kurstyps (für Nachhol-Suche)
  // ================================================================
  getBlocksByActivityType(activityType: string, activeOnly = false): CourseBlock[] {
    const blocks = getEntitiesFromIndex(
      store.state.courseBlocks, store.indexes.blocksByActivityType, activityType
    )
    if (activeOnly) return blocks.filter(b => b.status === 'active' || b.status === 'upcoming')
    return blocks
  },

  // ================================================================
  // Sessions eines Blocks
  // ================================================================
  getSessionsByBlock(blockId: ID): BlockSession[] {
    return getEntitiesFromIndex(store.state.blockSessions, store.indexes.sessionsByBlock, blockId)
      .sort((a, b) => a.sessionNumber - b.sessionNumber)
  },

  // ================================================================
  // Einzelne Session abrufen
  // ================================================================
  getSession(sessionId: ID): BlockSession | undefined {
    return store.state.blockSessions.get(sessionId)
  },

  // ================================================================
  // Kind in Block einschreiben
  // ================================================================
  enrollChild(input: EnrollChildInput): BlockEnrollment | { error: string } {
    const block = store.state.courseBlocks.get(input.blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    // Prüfen ob Kind schon eingeschrieben
    const existingEnrollments = getEntitiesFromIndex(
      store.state.blockEnrollments, store.indexes.enrollmentsByBlock, input.blockId
    )
    const alreadyEnrolled = existingEnrollments.find(
      e => e.childId === input.childId && e.status === 'active'
    )
    if (alreadyEnrolled) return { error: 'Kind ist bereits in diesem Block eingeschrieben' }

    // Kapazität prüfen (nur reguläre Plätze)
    const activeEnrollments = existingEnrollments.filter(e => e.status === 'active')
    if (activeEnrollments.length >= block.capacity) {
      return { error: `Block ist voll (${block.capacity}/${block.capacity} Plätze belegt)` }
    }

    const enrollmentId = generateId('enr')
    const now = new Date()

    const enrollment: BlockEnrollment = {
      id: enrollmentId,
      blockId: input.blockId,
      activityType: block.activityType,
      providerId: block.providerId,
      parentId: input.parentId,
      childId: input.childId,
      childName: input.childName,
      childAge: input.childAge,
      bookingId: input.bookingId,
      status: 'active',
      pricePaid: input.pricePaid ?? block.pricePerBlock,
      currency: input.currency ?? block.currency,
      creditsEarned: 0,
      creditsUsed: 0,
      createdAt: now,
      updatedAt: now,
    }

    store.state.blockEnrollments.set(enrollmentId, enrollment)
    store.addToIndex(store.indexes.enrollmentsByBlock, input.blockId, enrollmentId)
    store.addToIndex(store.indexes.enrollmentsByChild, input.childId, enrollmentId)
    store.addToIndex(store.indexes.enrollmentsByParent, input.parentId, enrollmentId)
    store.addToIndex(store.indexes.enrollmentsByProvider, block.providerId, enrollmentId)

    // Attendance-Records für alle zukünftigen Sessions anlegen
    const sessions = CourseBlockService.getSessionsByBlock(input.blockId)
    const today = new Date().toISOString().split('T')[0]

    for (const session of sessions) {
      if (session.date >= today && session.status === 'scheduled') {
        const attId = generateId('att')
        const att: SessionAttendanceRecord = {
          id: attId,
          sessionId: session.id,
          blockId: input.blockId,
          enrollmentId,
          childId: input.childId,
          status: 'expected',
          creditIssued: false,
          isMakeup: false,
          createdAt: now,
        }
        store.state.sessionAttendances.set(attId, att)
        store.addToIndex(store.indexes.sessionAttendancesBySession, session.id, attId)
        store.addToIndex(store.indexes.sessionAttendancesByChild, input.childId, attId)
        store.addToIndex(store.indexes.sessionAttendancesByEnrollment, enrollmentId, attId)
      }
    }

    // Audit
    createAuditEntry({
      providerId: block.providerId,
      userId: input.parentId,
      userType: 'parent',
      action: 'block_enrollment.created',
      entityType: 'block_enrollment',
      entityId: enrollmentId,
    })

    return enrollment
  },

  // ================================================================
  // Einschreibungen eines Blocks
  // ================================================================
  getEnrollmentsByBlock(blockId: ID): BlockEnrollment[] {
    return getEntitiesFromIndex(
      store.state.blockEnrollments, store.indexes.enrollmentsByBlock, blockId
    )
  },

  // ================================================================
  // Einschreibungen eines Kindes
  // ================================================================
  getEnrollmentsByChild(childId: string): BlockEnrollment[] {
    return getEntitiesFromIndex(
      store.state.blockEnrollments, store.indexes.enrollmentsByChild, childId
    )
  },

  // ================================================================
  // Einschreibungen eines Elternteils
  // ================================================================
  getEnrollmentsByParent(parentId: ID): BlockEnrollment[] {
    return getEntitiesFromIndex(
      store.state.blockEnrollments, store.indexes.enrollmentsByParent, parentId
    )
  },

  // ================================================================
  // Anwesenheit einer Session abrufen
  // ================================================================
  getAttendanceBySession(sessionId: ID): SessionAttendanceRecord[] {
    return getEntitiesFromIndex(
      store.state.sessionAttendances, store.indexes.sessionAttendancesBySession, sessionId
    )
  },

  // ================================================================
  // Anwesenheit erfassen (Check-In / Abwesend)
  // ================================================================
  markAttendance(
    attendanceId: ID,
    status: 'attended' | 'absent_excused' | 'absent_unexcused'
  ): SessionAttendanceRecord | { error: string } {
    const att = store.state.sessionAttendances.get(attendanceId)
    if (!att) return { error: 'Attendance-Record nicht gefunden' }
    if (att.status !== 'expected') return { error: `Status ist bereits '${att.status}'` }

    att.status = status
    return att
  },

  // ================================================================
  // Provider sagt Session ab (mit Kompensation)
  // ================================================================
  cancelSession(input: CancelSessionInput): { affected: number; compensation: CompensationType } | { error: string } {
    const session = store.state.blockSessions.get(input.sessionId)
    if (!session) return { error: 'Session nicht gefunden' }
    if (session.status !== 'scheduled') return { error: 'Session ist nicht im Status scheduled' }

    const block = store.state.courseBlocks.get(session.blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    // Session als abgesagt markieren
    session.status = 'cancelled_by_provider'
    session.cancellationReason = input.reason
    session.compensationType = input.compensation

    // Alle Attendance-Records für diese Session updaten
    const attendances = CourseBlockService.getAttendanceBySession(input.sessionId)

    if (input.compensation === 'credit') {
      // Option A: Guthaben an alle Teilnehmer
      const { SessionCreditService } = require('./session-credit.service')
      for (const att of attendances) {
        if (att.status === 'expected') {
          att.status = 'absent_excused'
          // Provider-Credits zählen NICHT gegen das Limit
          SessionCreditService.issueProviderCredit(att.enrollmentId, input.sessionId)
        }
      }
    } else {
      // Option B: Block verlängern
      CourseBlockService.extendBlock(session.blockId, 1)
    }

    // Audit
    createAuditEntry({
      providerId: block.providerId,
      userId: input.cancelledBy,
      userType: 'provider',
      action: 'block_session.cancelled_by_provider',
      entityType: 'block_session',
      entityId: input.sessionId,
      changes: { reason: { old: null, new: input.reason }, compensation: { old: null, new: input.compensation } },
    })

    return { affected: attendances.length, compensation: input.compensation }
  },

  // ================================================================
  // Block verlängern (zusätzliche Session anhängen)
  // ================================================================
  extendBlock(blockId: ID, additionalSessions: number): BlockSession[] | { error: string } {
    const block = store.state.courseBlocks.get(blockId)
    if (!block) return { error: 'Block nicht gefunden' }

    const existingSessions = CourseBlockService.getSessionsByBlock(blockId)
    const lastSession = existingSessions[existingSessions.length - 1]
    const lastDate = lastSession.date
    const endTime = addMinutes(block.recurringTime, block.durationMinutes)
    const now = new Date()
    const newSessions: BlockSession[] = []

    for (let i = 0; i < additionalSessions; i++) {
      const newDate = addDays(lastDate, 7 * (i + 1))
      const sessionNum = existingSessions.length + i + 1
      const sessionId = generateId('bsn')

      const session: BlockSession = {
        id: sessionId,
        blockId,
        sessionNumber: sessionNum,
        date: newDate,
        startTime: block.recurringTime,
        endTime,
        status: 'scheduled',
        createdAt: now,
      }

      store.state.blockSessions.set(sessionId, session)
      store.addToIndex(store.indexes.sessionsByBlock, blockId, sessionId)
      store.addToIndex(store.indexes.sessionsByDate, newDate, sessionId)
      newSessions.push(session)

      // Attendance-Records für alle aktiven Einschreibungen
      const enrollments = CourseBlockService.getEnrollmentsByBlock(blockId)
        .filter(e => e.status === 'active')

      for (const enrollment of enrollments) {
        const attId = generateId('att')
        const att: SessionAttendanceRecord = {
          id: attId,
          sessionId,
          blockId,
          enrollmentId: enrollment.id,
          childId: enrollment.childId,
          status: 'expected',
          creditIssued: false,
          isMakeup: false,
          createdAt: now,
        }
        store.state.sessionAttendances.set(attId, att)
        store.addToIndex(store.indexes.sessionAttendancesBySession, sessionId, attId)
        store.addToIndex(store.indexes.sessionAttendancesByChild, enrollment.childId, attId)
        store.addToIndex(store.indexes.sessionAttendancesByEnrollment, enrollment.id, attId)
      }
    }

    // Block-Enddatum updaten
    const newEndDate = newSessions[newSessions.length - 1].date
    block.extendedEndDate = newEndDate
    block.totalSessions = existingSessions.length + additionalSessions
    block.updatedAt = now

    // Credits-Gültigkeit verlängern für alle aktiven Credits dieses Blocks
    const credits = getEntitiesFromIndex(
      store.state.sessionCredits, store.indexes.creditsByBlock, blockId
    )
    for (const credit of credits) {
      if (credit.status === 'available') {
        credit.validUntil = newEndDate
      }
    }

    return newSessions
  },

  // ================================================================
  // Block-Status aktualisieren (Cronjob)
  // ================================================================
  updateBlockStatuses(): { activated: number; completed: number } {
    const today = new Date().toISOString().split('T')[0]
    let activated = 0
    let completed = 0

    for (const block of store.state.courseBlocks.values()) {
      const effectiveEndDate = block.extendedEndDate ?? block.endDate

      if (block.status === 'upcoming' && block.startDate <= today) {
        block.status = 'active'
        block.updatedAt = new Date()
        activated++
      } else if (block.status === 'active' && effectiveEndDate < today) {
        block.status = 'completed'
        block.updatedAt = new Date()
        completed++

        // Alle aktiven Einschreibungen abschließen
        const enrollments = CourseBlockService.getEnrollmentsByBlock(block.id)
        for (const enrollment of enrollments) {
          if (enrollment.status === 'active') {
            enrollment.status = 'completed'
            enrollment.updatedAt = new Date()
          }
        }
      }
    }

    return { activated, completed }
  },

  // ================================================================
  // Verfügbare Nachhol-Slots finden (für ein bestimmtes Credit)
  // ================================================================
  getAvailableMakeupSlots(activityType: string, validUntil: string, excludeBlockId?: ID): Array<{
    session: BlockSession
    block: CourseBlock
    regularCount: number
    makeupCount: number
    spotsLeft: number
  }> {
    const today = new Date().toISOString().split('T')[0]
    const blocks = CourseBlockService.getBlocksByActivityType(activityType, true)
    const results: Array<{
      session: BlockSession
      block: CourseBlock
      regularCount: number
      makeupCount: number
      spotsLeft: number
    }> = []

    for (const block of blocks) {
      if (excludeBlockId && block.id === excludeBlockId) continue

      const sessions = CourseBlockService.getSessionsByBlock(block.id)

      for (const session of sessions) {
        // Nur zukünftige, geplante Sessions innerhalb der Gültigkeit
        if (session.date <= today) continue
        if (session.date > validUntil) continue
        if (session.status !== 'scheduled') continue

        // Kapazität prüfen: regulär + makeup
        const attendances = CourseBlockService.getAttendanceBySession(session.id)
        const regularCount = attendances.filter(a => !a.isMakeup && a.status === 'expected').length
        const makeupCount = attendances.filter(a => a.isMakeup && (a.status === 'expected' || a.status === 'attended')).length

        const totalMakeupAllowed = block.makeupCapacity
        const spotsLeft = totalMakeupAllowed - makeupCount

        if (spotsLeft > 0) {
          results.push({ session, block, regularCount, makeupCount, spotsLeft })
        }
      }
    }

    // Sortieren: nächster Termin zuerst
    return results.sort((a, b) => a.session.date.localeCompare(b.session.date))
  },
}
