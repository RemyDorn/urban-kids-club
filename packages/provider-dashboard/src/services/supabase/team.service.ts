// ============================================================
// Team Service – Supabase-backed (Roles & Permissions)
// ============================================================

import { getServiceClient } from '../../lib/supabase'
import type { ID, TeamPermissions, TeamRole } from '../../types'
import { DEFAULT_ROLE_PERMISSIONS } from '../../types'

const TABLE = 'team_members'

// Legacy flat permissions (kept for backward compatibility)
export const ALL_PERMISSIONS = [
  'view_calendar', 'edit_calendar',
  'view_bookings', 'manage_bookings',
  'view_customers', 'manage_customers',
  'view_invoices', 'manage_invoices',
  'view_reports',
  'manage_courses',
  'manage_team',
  'manage_settings',
  'checkin',
] as const

export type Permission = typeof ALL_PERMISSIONS[number]

export const ROLE_PRESETS: Record<string, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  manager: ['view_calendar', 'edit_calendar', 'view_bookings', 'manage_bookings', 'view_customers', 'manage_customers', 'view_invoices', 'view_reports', 'manage_courses', 'checkin'],
  instructor: ['view_calendar', 'view_bookings', 'view_customers', 'checkin'],
  receptionist: ['view_calendar', 'view_bookings', 'manage_bookings', 'view_customers', 'checkin', 'view_invoices'],
}

export interface TeamMember {
  id: string
  providerId: string
  name: string
  email: string
  phone: string | null
  role: string
  permissions: TeamPermissions | Permission[]
  specializations: string[]
  avatar: string | null
  active: boolean
  userId: string | null
  inviteToken: string | null
  inviteSentAt: string | null
  lastLoginAt: string | null
  createdAt: Date
}

function fromDb(r: Record<string, any>): TeamMember {
  const role = (r.role || 'staff') as TeamRole
  // Support both area-based object and legacy flat array formats
  let permissions: TeamPermissions | Permission[] = r.permissions
  if (!permissions) {
    permissions = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.staff
  }
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    role,
    permissions,
    specializations: r.specializations ?? [],
    avatar: r.avatar ?? null,
    active: r.active ?? true,
    userId: r.user_id ?? null,
    inviteToken: r.invite_token ?? null,
    inviteSentAt: r.invite_sent_at ?? null,
    lastLoginAt: r.last_login_at ?? null,
    createdAt: new Date(r.created_at),
  }
}

export const SupabaseTeamService = {

  async list(providerId: ID): Promise<TeamMember[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from(TABLE).select('*')
      .eq('provider_id', providerId).order('name')
    if (error) throw error
    return (data ?? []).map(fromDb)
  },

  async getById(id: ID, providerId?: ID): Promise<TeamMember | undefined> {
    const sb = getServiceClient()
    let query = sb.from(TABLE).select('*').eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    return data ? fromDb(data) : undefined
  },

  async create(input: {
    providerId: ID; name: string; email: string; phone?: string;
    role: string; permissions?: TeamPermissions | Permission[]; specializations?: string[]
  }): Promise<TeamMember> {
    const sb = getServiceClient()
    const role = (input.role || 'staff') as TeamRole
    // Accept area-based object, legacy flat array, or default from role
    const permissions = input.permissions || DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.staff
    const { data, error } = await sb.from(TABLE).insert({
      provider_id: input.providerId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      role: input.role,
      permissions,
      specializations: input.specializations ?? [],
    }).select().single()
    if (error) throw error
    return fromDb(data)
  },

  async update(id: ID, input: Partial<{
    name: string; email: string; phone: string; role: string;
    permissions: TeamPermissions | Permission[]; specializations: string[]; active: boolean
  }>, providerId?: ID): Promise<TeamMember | undefined> {
    const sb = getServiceClient()
    const update: Record<string, unknown> = {}
    if (input.name !== undefined) update.name = input.name
    if (input.email !== undefined) update.email = input.email
    if (input.phone !== undefined) update.phone = input.phone
    if (input.role !== undefined) {
      update.role = input.role
      // Auto-set permissions if role changed and no explicit permissions given
      if (!input.permissions) {
        const r = input.role as TeamRole
        update.permissions = DEFAULT_ROLE_PERMISSIONS[r] || DEFAULT_ROLE_PERMISSIONS.staff
      }
    }
    if (input.permissions !== undefined) update.permissions = input.permissions
    if (input.specializations !== undefined) update.specializations = input.specializations
    if (input.active !== undefined) update.active = input.active
    let query = sb.from(TABLE).update(update).eq('id', id)
    if (providerId) query = query.eq('provider_id', providerId)
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    return data ? fromDb(data) : undefined
  },

  async delete(id: ID, providerId: ID): Promise<boolean> {
    const sb = getServiceClient()
    const { error } = await sb.from(TABLE).delete().eq('id', id).eq('provider_id', providerId)
    if (error) throw error
    return true
  },

  async invite(id: ID, providerId: ID): Promise<{ token: string } | { error: string }> {
    const sb = getServiceClient()
    const member = await this.getById(id, providerId)
    if (!member) return { error: 'Teammitglied nicht gefunden' }

    const { randomBytes } = await import('node:crypto')
    const token = randomBytes(24).toString('hex')

    await sb.from(TABLE).update({
      invite_token: token,
      invite_sent_at: new Date().toISOString(),
    }).eq('id', id)

    // Send invitation email
    try {
      const { EmailService } = await import('../../lib/email')
      const { data: provider } = await sb.from('providers').select('company_name').eq('id', providerId).maybeSingle()
      const origin = process.env.APP_PUBLIC_URL || 'https://dev.urbankids.club'
      await EmailService.send({
        to: member.email,
        subject: `Einladung: ${provider?.company_name || 'Provider'} – Dashboard-Zugang`,
        html: `
          <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;color:#3C2225;">
            <div style="background:linear-gradient(135deg,#D4956A,#c4854a);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
              <h1 style="color:white;margin:0;font-size:24px;">Du wurdest eingeladen!</h1>
            </div>
            <div style="padding:32px;background:#FFF9F5;border-radius:0 0 16px 16px;">
              <p>Hey ${member.name},</p>
              <p><strong>${provider?.company_name}</strong> hat dich als <strong>${member.role}</strong> zum Team hinzugefügt.</p>
              <p style="text-align:center;margin:24px 0;">
                <a href="${origin}/?invite=${token}" style="display:inline-block;background:#D4956A;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;">Einladung annehmen</a>
              </p>
              <hr style="border:none;border-top:1px solid #F2E6E2;margin:24px 0;">
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Powered by Urban Kids Club</p>
            </div>
          </div>
        `,
      })
    } catch (e) { console.error('[Team] Invite email failed:', e); throw new Error('Einladungs-E-Mail konnte nicht gesendet werden') }

    return { token }
  },

  // Convenience: deactivate a team member
  async deactivate(id: ID, providerId?: ID): Promise<TeamMember | undefined> {
    return this.update(id, { active: false }, providerId)
  },

  // Convenience: activate a team member
  async activate(id: ID, providerId?: ID): Promise<TeamMember | undefined> {
    return this.update(id, { active: true }, providerId)
  },

  // All activities assigned to a team member (instructor)
  async getAssignedActivities(memberId: ID): Promise<string[]> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('activities').select('id')
      .eq('instructor_id', memberId)
    if (error) throw error
    return (data ?? []).map((r: any) => r.id)
  },

  // Workload: how many courses / weekly slots does a team member have?
  async getWorkload(memberId: ID): Promise<{ activityCount: number; weeklySlots: number }> {
    const sb = getServiceClient()
    const { data, error } = await sb.from('activities').select('id, schedule, status')
      .eq('instructor_id', memberId).eq('status', 'published')
    if (error) throw error

    const activities = data ?? []
    let weeklySlots = 0
    for (const a of activities) {
      const sched = a.schedule as any
      if (sched?.type === 'recurring' && Array.isArray(sched.slots)) {
        weeklySlots += sched.slots.length
      } else {
        weeklySlots += 1
      }
    }
    return { activityCount: activities.length, weeklySlots }
  },

  // Get permissions for a user (by auth user_id)
  async getPermissionsForUser(userId: string): Promise<{ providerId: string; role: string; permissions: TeamPermissions | Permission[] } | null> {
    const sb = getServiceClient()
    const { data } = await sb.from(TABLE).select('provider_id, role, permissions, active')
      .eq('user_id', userId).eq('active', true).maybeSingle()
    if (!data) return null
    const role = (data.role || 'staff') as TeamRole
    const permissions = data.permissions || DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.staff
    return { providerId: data.provider_id, role, permissions }
  },
}
