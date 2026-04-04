// ============================================================
// Activity Service – Kurse/Angebote verwalten
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Activity, ActivityStatus, Schedule, AgeRange, PricingOption, ID } from '../types'

export interface CreateActivityInput {
  providerId: ID
  locationId?: ID
  instructorId?: ID
  title: string
  description: string
  category: string
  ageRange: AgeRange
  schedule: Schedule
  capacity: number
  waitlistEnabled?: boolean
  trialEnabled?: boolean
  pricing: Omit<PricingOption, 'id'>[]
  platformListing?: { enabled: boolean; platformCapacity: number; featured: boolean; trialAvailable: boolean }
  media?: string[]
  tags?: string[]
}

export interface UpdateActivityInput {
  title?: string
  description?: string
  category?: string
  ageRange?: AgeRange
  schedule?: Schedule
  capacity?: number
  waitlistEnabled?: boolean
  pricing?: Omit<PricingOption, 'id'>[]
  media?: string[]
  tags?: string[]
  locationId?: ID
  instructorId?: ID
}

export interface ActivitySearchFilters {
  category?: string
  ageMin?: number
  ageMax?: number
  providerId?: ID
  status?: ActivityStatus
  query?: string          // Freitextsuche in Titel/Beschreibung
}

export const ActivityService = {

  create(input: CreateActivityInput): Activity {
    const id = generateId('act')
    const now = new Date()

    // Pricing-Optionen mit IDs versehen
    const pricing: PricingOption[] = input.pricing.map((p) => ({
      ...p,
      id: generateId('price'),
    }))

    const activity: Activity = {
      id,
      providerId: input.providerId,
      locationId: input.locationId,
      instructorId: input.instructorId,
      title: input.title,
      description: input.description,
      category: input.category,
      ageRange: input.ageRange,
      schedule: input.schedule,
      capacity: input.capacity,
      waitlistEnabled: input.waitlistEnabled ?? false,
      trialEnabled: input.trialEnabled ?? true,
      platformListing: input.platformListing,
      pricing,
      media: input.media ?? [],
      tags: input.tags ?? [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }

    store.state.activities.set(id, activity)

    // Indizes pflegen
    store.addToIndex(store.indexes.activitiesByProvider, input.providerId, id)
    store.addToIndex(store.indexes.activitiesByCategory, input.category, id)
    if (input.locationId) {
      store.addToIndex(store.indexes.activitiesByLocation, input.locationId, id)
    }

    return activity
  },

  getById(id: ID): Activity | undefined {
    return store.state.activities.get(id)
  },

  listByProvider(providerId: ID): Activity[] {
    const ids = store.getFromIndex(store.indexes.activitiesByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.activities.get(id)!)
      .filter(Boolean)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  search(filters: ActivitySearchFilters): Activity[] {
    let results = Array.from(store.state.activities.values())

    // Nur veröffentlichte Kurse (außer Provider schaut eigene an)
    if (filters.status) {
      results = results.filter((a) => a.status === filters.status)
    }

    if (filters.providerId) {
      results = results.filter((a) => a.providerId === filters.providerId)
    }

    if (filters.category) {
      results = results.filter((a) => a.category === filters.category)
    }

    if (filters.ageMin !== undefined) {
      results = results.filter((a) => a.ageRange.max >= filters.ageMin!)
    }

    if (filters.ageMax !== undefined) {
      results = results.filter((a) => a.ageRange.min <= filters.ageMax!)
    }

    if (filters.query) {
      const q = filters.query.toLowerCase()
      results = results.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  },

  update(id: ID, input: UpdateActivityInput): Activity | undefined {
    const activity = store.state.activities.get(id)
    if (!activity) return undefined

    // Kategorie-Index aktualisieren
    if (input.category && input.category !== activity.category) {
      store.removeFromIndex(store.indexes.activitiesByCategory, activity.category, id)
      store.addToIndex(store.indexes.activitiesByCategory, input.category, id)
    }

    // Location-Index aktualisieren
    if (input.locationId !== undefined && input.locationId !== activity.locationId) {
      if (activity.locationId) {
        store.removeFromIndex(store.indexes.activitiesByLocation, activity.locationId, id)
      }
      if (input.locationId) {
        store.addToIndex(store.indexes.activitiesByLocation, input.locationId, id)
      }
    }

    // Pricing mit IDs
    let pricing = activity.pricing
    if (input.pricing) {
      pricing = input.pricing.map((p) => ({ ...p, id: generateId('price') }))
    }

    const updated: Activity = {
      ...activity,
      ...input,
      pricing,
      updatedAt: new Date(),
    }

    store.state.activities.set(id, updated)
    return updated
  },

  publish(id: ID): Activity | undefined {
    const activity = store.state.activities.get(id)
    if (!activity || activity.status === 'archived') return undefined
    activity.status = 'published'
    activity.updatedAt = new Date()
    return activity
  },

  cancel(id: ID): Activity | undefined {
    const activity = store.state.activities.get(id)
    if (!activity) return undefined
    activity.status = 'cancelled'
    activity.updatedAt = new Date()
    return activity
  },

  archive(id: ID): Activity | undefined {
    const activity = store.state.activities.get(id)
    if (!activity) return undefined
    activity.status = 'archived'
    activity.updatedAt = new Date()
    return activity
  },

  duplicate(id: ID): Activity | undefined {
    const original = store.state.activities.get(id)
    if (!original) return undefined

    return this.create({
      providerId: original.providerId,
      locationId: original.locationId,
      instructorId: original.instructorId,
      title: `${original.title} (Kopie)`,
      description: original.description,
      category: original.category,
      ageRange: { ...original.ageRange },
      schedule: { ...original.schedule } as Schedule,
      capacity: original.capacity,
      waitlistEnabled: original.waitlistEnabled,
      pricing: original.pricing.map(({ id: _id, ...rest }) => rest),
      media: [...original.media],
      tags: [...original.tags],
    })
  },

  getAvailableSpots(id: ID): number {
    const activity = store.state.activities.get(id)
    if (!activity) return 0

    const bookingIds = store.getFromIndex(store.indexes.bookingsByActivity, id)
    const confirmedCount = Array.from(bookingIds)
      .map((bid) => store.state.bookings.get(bid))
      .filter((b) => b && (b.status === 'confirmed' || b.status === 'pending'))
      .length

    return Math.max(0, activity.capacity - confirmedCount)
  },

  delete(id: ID): boolean {
    const activity = store.state.activities.get(id)
    if (!activity) return false

    store.removeFromIndex(store.indexes.activitiesByProvider, activity.providerId, id)
    store.removeFromIndex(store.indexes.activitiesByCategory, activity.category, id)
    if (activity.locationId) {
      store.removeFromIndex(store.indexes.activitiesByLocation, activity.locationId, id)
    }

    return store.state.activities.delete(id)
  },
}
