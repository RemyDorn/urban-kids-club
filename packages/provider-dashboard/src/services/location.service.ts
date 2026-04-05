// ============================================================
// Location Service – Multi-Standort-Verwaltung
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { Location, Address, ID } from '../types'

export interface CreateLocationInput {
  providerId: ID
  name: string
  address: Address
  rooms?: string[]
  capacity?: number
}

export interface UpdateLocationInput {
  name?: string
  address?: Address
  rooms?: string[]
  capacity?: number
}

export const LocationService = {

  create(input: CreateLocationInput): Location {
    const id = generateId('loc')

    const location: Location = {
      id,
      providerId: input.providerId,
      name: input.name,
      address: input.address,
      rooms: input.rooms ?? [],
      capacity: input.capacity,
    }

    store.state.locations.set(id, location)
    store.addToIndex(store.indexes.locationsByProvider, input.providerId, id)

    return location
  },

  getById(id: ID): Location | undefined {
    return store.state.locations.get(id)
  },

  listByProvider(providerId: ID): Location[] {
    const ids = store.getFromIndex(store.indexes.locationsByProvider, providerId)
    return Array.from(ids)
      .map((id) => store.state.locations.get(id)!)
      .filter(Boolean)
  },

  update(id: ID, input: UpdateLocationInput): Location | undefined {
    const location = store.state.locations.get(id)
    if (!location) return undefined

    const updated: Location = { ...location, ...input }
    store.state.locations.set(id, updated)
    return updated
  },

  addRoom(id: ID, roomName: string): Location | undefined {
    const location = store.state.locations.get(id)
    if (!location) return undefined

    if (!location.rooms) location.rooms = []
    if (!location.rooms.includes(roomName)) {
      location.rooms.push(roomName)
    }
    return location
  },

  removeRoom(id: ID, roomName: string): Location | undefined {
    const location = store.state.locations.get(id)
    if (!location || !location.rooms) return undefined

    location.rooms = location.rooms.filter((r) => r !== roomName)
    return location
  },

  // Prüfe, welche Kurse an diesem Standort stattfinden
  getActivities(locationId: ID): string[] {
    return Array.from(store.getFromIndex(store.indexes.activitiesByLocation, locationId))
  },

  delete(id: ID): boolean {
    const location = store.state.locations.get(id)
    if (!location) return false

    // Aktivitäten entkoppeln
    const activityIds = store.getFromIndex(store.indexes.activitiesByLocation, id)
    for (const aid of activityIds) {
      const activity = store.state.activities.get(aid)
      if (activity) activity.locationId = undefined
    }
    store.indexes.activitiesByLocation.delete(id)

    store.removeFromIndex(store.indexes.locationsByProvider, location.providerId, id)
    return store.state.locations.delete(id)
  },
}
