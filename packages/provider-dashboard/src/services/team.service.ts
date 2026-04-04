// ============================================================
// Team Service – Trainer/Lehrer-Verwaltung
// ============================================================

import { store } from '../domain/store'
import { generateId } from './id'
import type { TeamMember, TeamRole, ID } from '../types'

export interface CreateTeamMemberInput {
  providerId: ID
  name: string
  email: string
  role: TeamRole
  specializations?: string[]
  avatar?: string
}

export interface UpdateTeamMemberInput {
  name?: string
  email?: string
  role?: TeamRole
  specializations?: string[]
  avatar?: string
}

export const TeamService = {

  create(input: CreateTeamMemberInput): TeamMember {
    const id = generateId('team')

    const member: TeamMember = {
      id,
      providerId: input.providerId,
      name: input.name,
      email: input.email,
      role: input.role,
      specializations: input.specializations ?? [],
      avatar: input.avatar,
      active: true,
    }

    store.state.teamMembers.set(id, member)
    store.addToIndex(store.indexes.teamByProvider, input.providerId, id)

    return member
  },

  getById(id: ID): TeamMember | undefined {
    return store.state.teamMembers.get(id)
  },

  listByProvider(providerId: ID, filters?: { role?: TeamRole; active?: boolean }): TeamMember[] {
    const ids = store.getFromIndex(store.indexes.teamByProvider, providerId)
    let result = Array.from(ids)
      .map((id) => store.state.teamMembers.get(id)!)
      .filter(Boolean)

    if (filters?.role) {
      result = result.filter((m) => m.role === filters.role)
    }
    if (filters?.active !== undefined) {
      result = result.filter((m) => m.active === filters.active)
    }

    return result
  },

  update(id: ID, input: UpdateTeamMemberInput): TeamMember | undefined {
    const member = store.state.teamMembers.get(id)
    if (!member) return undefined

    const updated: TeamMember = { ...member, ...input }
    store.state.teamMembers.set(id, updated)
    return updated
  },

  deactivate(id: ID): TeamMember | undefined {
    const member = store.state.teamMembers.get(id)
    if (!member) return undefined
    member.active = false
    return member
  },

  activate(id: ID): TeamMember | undefined {
    const member = store.state.teamMembers.get(id)
    if (!member) return undefined
    member.active = true
    return member
  },

  // Alle Kurse eines Trainers
  getAssignedActivities(memberId: ID): string[] {
    return Array.from(store.state.activities.values())
      .filter((a) => a.instructorId === memberId)
      .map((a) => a.id)
  },

  // Workload: Wie viele Kurse/Stunden hat ein Trainer?
  getWorkload(memberId: ID): { activityCount: number; weeklySlots: number } {
    const activities = Array.from(store.state.activities.values())
      .filter((a) => a.instructorId === memberId && a.status === 'published')

    let weeklySlots = 0
    for (const activity of activities) {
      if (activity.schedule.type === 'recurring') {
        weeklySlots += activity.schedule.slots.length
      } else {
        weeklySlots += 1
      }
    }

    return { activityCount: activities.length, weeklySlots }
  },

  delete(id: ID): boolean {
    const member = store.state.teamMembers.get(id)
    if (!member) return false

    store.removeFromIndex(store.indexes.teamByProvider, member.providerId, id)
    return store.state.teamMembers.delete(id)
  },
}
