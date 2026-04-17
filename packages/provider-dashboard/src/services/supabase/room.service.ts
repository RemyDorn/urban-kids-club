// ============================================================
// Room Service – Supabase-backed
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import type { ID } from '../../types'

const TABLE = 'rooms'

export interface Room {
  id: string
  providerId: string
  name: string
  description: string
  capacity: number | null
  color: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

function fromDb(r: Record<string, any>): Room {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name,
    description: r.description ?? '',
    capacity: r.capacity ?? null,
    color: r.color ?? '#6B7280',
    isActive: r.is_active ?? true,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }
}

export const SupabaseRoomService = {

  async list(providerId: ID): Promise<Room[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('provider_id', providerId).order('name')
    if (error) throw error
    return (data ?? []).map(fromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<Room | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? fromDb(data) : undefined
  },

  async create(input: { providerId: ID; name: string; description?: string; capacity?: number; color?: string }): Promise<Room> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).insert({
      provider_id: input.providerId,
      name: input.name,
      description: input.description ?? '',
      capacity: input.capacity ?? null,
      color: input.color ?? '#6B7280',
    }).select().single()
    if (error) throw error
    return fromDb(data)
  },

  async update(id: ID, input: Partial<{ name: string; description: string; capacity: number | null; color: string; isActive: boolean }>, providerId?: ID): Promise<Room | undefined> {
    const sb = getServiceClient()
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) update.name = input.name
    if (input.description !== undefined) update.description = input.description
    if (input.capacity !== undefined) update.capacity = input.capacity
    if (input.color !== undefined) update.color = input.color
    if (input.isActive !== undefined) update.is_active = input.isActive
    let query = sb.from(TABLE).update(update).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? fromDb(data) : undefined
  },

  async delete(id: ID, providerId: ID): Promise<boolean> {
    const sb = getServiceClient()
    // First unassign any activities using this room
    await sb.from('activities').update({ room_id: null }).eq('room_id', id)
    const { error } = await sb.from(TABLE).delete().eq('id', id).eq('provider_id', providerId)
    if (error) throw error
    return true
  },

  // Check for time conflicts in a room on a specific day
  async checkConflict(providerId: ID, roomId: ID, day: string, startTime: string, endTime: string, excludeActivityId?: ID): Promise<{
    conflict: boolean
    conflictingActivity?: { id: string; title: string; startTime: string; endTime: string }
  }> {
    const sb = getServiceClient()
    // Find all activities in this room for this provider
    let query = sb.from('activities')
      .select('id, title, schedule')
      .eq('provider_id', providerId)
      .eq('room_id', roomId)
      .in('status', ['published', 'draft'])
    if (excludeActivityId) query = query.neq('id', excludeActivityId)
    const { data: activities } = await query

    const startMin = timeToMinutes(startTime)
    const endMin = timeToMinutes(endTime)

    for (const act of activities ?? []) {
      const sched = act.schedule as any
      const slots = Array.isArray(sched) ? sched : (sched?.slots ?? [])
      for (const slot of slots) {
        if (slot.day?.toUpperCase() !== day.toUpperCase()) continue
        const slotStart = timeToMinutes(slot.startTime)
        const slotEnd = timeToMinutes(slot.endTime)
        // Check overlap: two ranges overlap if start1 < end2 AND start2 < end1
        if (startMin < slotEnd && slotStart < endMin) {
          return {
            conflict: true,
            conflictingActivity: { id: act.id, title: act.title, startTime: slot.startTime, endTime: slot.endTime }
          }
        }
      }
    }

    return { conflict: false }
  },
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
