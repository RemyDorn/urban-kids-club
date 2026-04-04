// ============================================================
// Trial Lesson Service – Probestunden-Verwaltung (130%-Feature)
// ============================================================
// Probestunden sind DER Conversion-Hebel für Kursanbieter.
// Eltern buchen eine kostenlose/günstige Probestunde → Kind probiert aus → Buchung.
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { TrialLesson, TrialStatus, ChildInfo, ID } from '../types'

export interface CreateTrialInput {
  activityId: ID
  providerId: ID
  parentId: ID
  child: ChildInfo
  scheduledDate: string
  scheduledTime: string
}

export const TrialService = {

  create(input: CreateTrialInput): TrialLesson | { error: string } {
    const activity = store.state.activities.get(input.activityId)
    if (!activity) return { error: 'Aktivität nicht gefunden' }
    if (activity.status !== 'published') return { error: 'Aktivität ist nicht aktiv' }

    // Prüfen ob bereits eine Probestunde existiert
    const existingTrials = Array.from(
      store.getFromIndex(store.indexes.trialsByActivity, input.activityId)
    )
      .map((id) => store.state.trialLessons.get(id)!)
      .filter(Boolean)

    const alreadyHasTrial = existingTrials.some(
      (t) =>
        t.parentId === input.parentId &&
        t.child.name === input.child.name &&
        t.status !== 'cancelled'
    )

    if (alreadyHasTrial) {
      return { error: 'Es existiert bereits eine Probestunde für dieses Kind in diesem Kurs' }
    }

    const id = generateId('trial')
    const now = new Date()

    const trial: TrialLesson = {
      id,
      activityId: input.activityId,
      providerId: input.providerId,
      parentId: input.parentId,
      child: input.child,
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    }

    store.state.trialLessons.set(id, trial)
    store.addToIndex(store.indexes.trialsByProvider, input.providerId, id)
    store.addToIndex(store.indexes.trialsByActivity, input.activityId, id)
    store.addToIndex(store.indexes.trialsByParent, input.parentId, id)

    return trial
  },

  getById(id: ID): TrialLesson | undefined {
    return store.state.trialLessons.get(id)
  },

  listByProvider(providerId: ID, filters?: { status?: TrialStatus }): TrialLesson[] {
    const ids = store.getFromIndex(store.indexes.trialsByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.trialLessons.get(id)!)
      .filter(Boolean)

    if (filters?.status) {
      result = result.filter((t) => t.status === filters.status)
    }

    return result.sort((a, b) => {
      const dateCmp = a.scheduledDate.localeCompare(b.scheduledDate)
      return dateCmp !== 0 ? dateCmp : a.scheduledTime.localeCompare(b.scheduledTime)
    })
  },

  listByActivity(activityId: ID): TrialLesson[] {
    const ids = store.getFromIndex(store.indexes.trialsByActivity, activityId)
    return Array.from(ids)
      .map((id) => store.state.trialLessons.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
  },

  listByParent(parentId: ID): TrialLesson[] {
    const ids = store.getFromIndex(store.indexes.trialsByParent, parentId)
    return Array.from(ids)
      .map((id) => store.state.trialLessons.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  // Probestunde als abgeschlossen markieren
  complete(id: ID, feedback?: string): TrialLesson | undefined {
    const trial = store.state.trialLessons.get(id)
    if (!trial || trial.status !== 'scheduled') return undefined

    trial.status = 'completed'
    trial.feedback = feedback
    trial.updatedAt = new Date()
    return trial
  },

  // Kind ist nicht erschienen
  markNoShow(id: ID): TrialLesson | undefined {
    const trial = store.state.trialLessons.get(id)
    if (!trial || trial.status !== 'scheduled') return undefined

    trial.status = 'no_show'
    trial.updatedAt = new Date()
    return trial
  },

  // Probestunde → Buchung konvertiert
  markConverted(id: ID, bookingId: ID): TrialLesson | undefined {
    const trial = store.state.trialLessons.get(id)
    if (!trial || trial.status !== 'completed') return undefined

    trial.status = 'converted'
    trial.convertedToBookingId = bookingId
    trial.updatedAt = new Date()
    return trial
  },

  cancel(id: ID): TrialLesson | undefined {
    const trial = store.state.trialLessons.get(id)
    if (!trial || trial.status !== 'scheduled') return undefined

    trial.status = 'cancelled'
    trial.updatedAt = new Date()
    return trial
  },

  // Eltern-Feedback nach Probestunde
  addParentFeedback(id: ID, feedback: string): TrialLesson | undefined {
    const trial = store.state.trialLessons.get(id)
    if (!trial) return undefined

    trial.parentFeedback = feedback
    trial.updatedAt = new Date()
    return trial
  },

  // Conversion Rate: Wie viele Probestunden werden zu Buchungen?
  getConversionStats(providerId: ID): {
    total: number
    completed: number
    converted: number
    noShow: number
    conversionRate: number
  } {
    const trials = this.listByProvider(providerId)

    const completed = trials.filter((t) => t.status === 'completed' || t.status === 'converted').length
    const converted = trials.filter((t) => t.status === 'converted').length
    const noShow = trials.filter((t) => t.status === 'no_show').length

    return {
      total: trials.length,
      completed,
      converted,
      noShow,
      conversionRate: completed > 0 ? Math.round((converted / completed) * 100) / 100 : 0,
    }
  },

  // Anstehende Probestunden für heute
  getUpcomingToday(providerId: ID): TrialLesson[] {
    const today = new Date().toISOString().split('T')[0]
    return this.listByProvider(providerId, { status: 'scheduled' })
      .filter((t) => t.scheduledDate === today)
  },
}
